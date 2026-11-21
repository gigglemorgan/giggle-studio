"""Baseline benchmark harness for llama.cpp on NVIDIA GeForce RTX 5070 (sm_120).

Executes llama-bench and end-to-end generation across prompt matrix:
- Target Hardware: RTX 5070 12GB (Blackwell sm_120a)
- Compiler: NVCC 13.0 (CUDA 13.0.88), CMAKE_CUDA_ARCHITECTURES=120a
- llama.cpp built from source under data/third_party/llama.cpp
- Prompts: 512, 4096 tokens (pp512, pp4096)
- Decode Generation: 256 tokens (tg256, e2e_decode_256)
- Timing: Warm-up passes + >= 10 timed runs reporting median, stddev, min, max, CV%
- Concurrency: Synchronized under scripts/gpu_run.sh (flock /tmp/giggle-gpu.lock)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

SRC_LLAMA_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "data"
    / "third_party"
    / "llama.cpp"
    / "build"
    / "bin"
)
HERMES_LLAMA_DIR = Path("/home/sedat/.hermes/tools/llamacpp-cuda-11671-linux-x64")
GPU_RUN_SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "gpu_run.sh"


@dataclass
class BenchmarkRunResult:
    timestamp: str
    model_name: str
    backend: str
    commit_hash: str
    test_type: str  # pp512, pp4096, tg256, e2e_decode_256
    prompt_tokens: int
    gen_tokens: int
    runs_count: int
    median_tps: float
    stddev_tps: float
    cv_percent: float  # Coefficient of Variation: (stddev / median) * 100
    min_tps: float
    max_tps: float
    ttft_ms: float
    peak_vram_mb: float
    avg_temp_c: float
    avg_sm_clock_mhz: float


def get_gpu_telemetry() -> dict[str, float]:
    """Query current GPU telemetry (VRAM, temp, SM clock)."""
    try:
        cmd = [
            "nvidia-smi",
            "--query-gpu=memory.used,temperature.gpu,clocks.current.sm",
            "--format=csv,noheader,nounits",
        ]
        out = subprocess.check_output(cmd, text=True).strip()
        parts = [p.strip() for p in out.split(",")]
        return {
            "vram_mb": float(parts[0]),
            "temp_c": float(parts[1]),
            "sm_clock_mhz": float(parts[2]),
        }
    except Exception:
        return {"vram_mb": 0.0, "temp_c": 0.0, "sm_clock_mhz": 0.0}


def get_llama_cpp_info(bin_dir: Path) -> dict[str, str]:
    """Get commit hash and build info for llama.cpp binary."""
    bench_bin = bin_dir / "llama-bench"
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = f"{bin_dir}:{env.get('LD_LIBRARY_PATH', '')}"
    cmd = [str(bench_bin), "--version"]
    try:
        out = subprocess.check_output(cmd, env=env, stderr=subprocess.STDOUT, text=True)
        commit = "b019be0"
        build = "source"
        for line in out.splitlines():
            if "commit" in line:
                m = re.search(r"commit\s+([0-9a-fA-F]+)", line)
                if m:
                    commit = m.group(1)
            if "build" in line:
                m_b = re.search(r"build\s+([0-9]+)", line)
                if m_b:
                    build = m_b.group(1)
        return {"commit": commit, "build": build, "raw": out.strip()}
    except Exception as e:
        return {"commit": "unknown", "build": "unknown", "raw": str(e)}


def run_llama_bench(
    bin_dir: Path,
    model_path: str,
    repetitions: int = 10,
    warmup_runs: int = 2,
) -> list[dict[str, Any]]:
    """Execute llama-bench with warm-up and JSON output for pure pp and pure tg."""
    bench_bin = bin_dir / "llama-bench"
    env_str = f"LD_LIBRARY_PATH='{bin_dir}':$LD_LIBRARY_PATH"

    # 1. Warm-up run to spin up GPU clocks and ensure memory buffers are primed
    if warmup_runs > 0:
        print(f"[BENCH] Running {warmup_runs} warm-up passes for llama-bench...")
        warmup_cmd = [
            str(GPU_RUN_SCRIPT),
            "bash",
            "-c",
            f"export {env_str} && '{bench_bin}' -m '{model_path}' -ngl 99 -fa 1 -r {warmup_runs} -p 512 -n 128",
        ]
        subprocess.run(warmup_cmd, capture_output=True, text=True, check=True)
        time.sleep(1.0)

    # 2. Pure prompt processing: pp512, pp4096 (n_gen=0)
    cmd_pp = [
        str(GPU_RUN_SCRIPT),
        "bash",
        "-c",
        f"export {env_str} && '{bench_bin}' -m '{model_path}' -ngl 99 -fa 1 -r {repetitions} -p 512,4096 -n 0 -o json",
    ]
    print(f"[BENCH] Running llama-bench pure prompt processing ({repetitions} reps, pp512, pp4096)...")
    t0_telem = get_gpu_telemetry()
    res_pp = subprocess.run(cmd_pp, capture_output=True, text=True, check=True)
    t1_telem = get_gpu_telemetry()

    # 3. Pure decode: tg128, tg256 (n_prompt=0)
    cmd_tg = [
        str(GPU_RUN_SCRIPT),
        "bash",
        "-c",
        f"export {env_str} && '{bench_bin}' -m '{model_path}' -ngl 99 -fa 1 -r {repetitions} -p 0 -n 128,256 -o json",
    ]
    print(f"[BENCH] Running llama-bench pure decode ({repetitions} reps, tg128, tg256)...")
    t2_telem = get_gpu_telemetry()
    res_tg = subprocess.run(cmd_tg, capture_output=True, text=True, check=True)
    t3_telem = get_gpu_telemetry()

    def parse_json_lines(stdout: str) -> list[dict[str, Any]]:
        stdout_lines = stdout.strip().splitlines()
        json_start = -1
        for idx, line in enumerate(stdout_lines):
            if line.strip().startswith("["):
                json_start = idx
                break
        if json_start >= 0:
            json_str = "\n".join(stdout_lines[json_start:])
            return json.loads(json_str)
        return json.loads(stdout)

    data_pp = parse_json_lines(res_pp.stdout)
    for item in data_pp:
        item["_telem_start"] = t0_telem
        item["_telem_end"] = t1_telem

    data_tg = parse_json_lines(res_tg.stdout)
    for item in data_tg:
        item["_telem_start"] = t2_telem
        item["_telem_end"] = t3_telem

    return data_pp + data_tg


def run_e2e_generation(
    bin_dir: Path,
    model_path: str,
    prompt: str,
    gen_tokens: int = 256,
    repetitions: int = 10,
    warmup_runs: int = 2,
) -> dict[str, Any]:
    """Execute llama-cli end-to-end generation runs to measure TTFT and generation speed."""
    cli_bin = bin_dir / "llama-cli"
    prompt_speeds: list[float] = []
    gen_speeds: list[float] = []
    ttfts: list[float] = []
    temps: list[float] = []
    clocks: list[float] = []
    vrams: list[float] = []

    tmp_out = Path("/tmp/giggle_e2e_bench.txt")
    escaped_prompt = prompt.replace("'", "'\\''")
    inner_cmd = (
        f"export LD_LIBRARY_PATH='{bin_dir}':$LD_LIBRARY_PATH && "
        f"'{GPU_RUN_SCRIPT}' '{cli_bin}' -m '{model_path}' -ngl 99 -fa 1 "
        f"-p '{escaped_prompt}' -n {gen_tokens} --temp 0.0 -s 42 --single-turn"
    )

    # 1. Warm-up passes
    if warmup_runs > 0:
        print(f"[BENCH] Running {warmup_runs} warm-up passes for e2e decode...")
        for _ in range(warmup_runs):
            if tmp_out.exists():
                tmp_out.unlink()
            subprocess.run(
                ["script", "-q", "-c", inner_cmd, str(tmp_out)],
                capture_output=True,
                text=True,
                check=True,
            )
            time.sleep(0.5)

    # 2. Timed runs
    print(f"[BENCH] Running {repetitions} timed e2e generation runs via llama-cli...")
    for i in range(repetitions):
        if tmp_out.exists():
            tmp_out.unlink()

        telem_pre = get_gpu_telemetry()
        subprocess.run(
            ["script", "-q", "-c", inner_cmd, str(tmp_out)],
            capture_output=True,
            text=True,
            check=True,
        )
        telem_post = get_gpu_telemetry()

        output = tmp_out.read_text(encoding="utf-8", errors="replace") if tmp_out.exists() else ""
        m_prompt = re.search(r"Prompt:\s*([0-9.,]+)\s*t/s", output)
        m_gen = re.search(r"Generation:\s*([0-9.,]+)\s*t/s", output)

        if m_prompt and m_gen:
            p_tps = float(m_prompt.group(1).replace(",", "."))
            g_tps = float(m_gen.group(1).replace(",", "."))
            prompt_speeds.append(p_tps)
            gen_speeds.append(g_tps)

            ttft = (512.0 / p_tps) * 1000.0 if p_tps > 0 else 0.0
            ttfts.append(ttft)
            print(
                f"  Run {i+1}/{repetitions}: Prompt={p_tps:.1f} t/s, Gen={g_tps:.1f} t/s, TTFT={ttft:.1f} ms"
            )
        else:
            print(f"  Run {i+1}/{repetitions}: Output format unrecognized")

        temps.append(max(telem_pre["temp_c"], telem_post["temp_c"]))
        clocks.append(max(telem_pre["sm_clock_mhz"], telem_post["sm_clock_mhz"]))
        vrams.append(max(telem_pre["vram_mb"], telem_post["vram_mb"]))
        time.sleep(0.5)

    if tmp_out.exists():
        tmp_out.unlink()

    gen_median = float(np.median(gen_speeds)) if gen_speeds else 0.0
    gen_std = float(np.std(gen_speeds)) if gen_speeds else 0.0
    gen_cv = (gen_std / gen_median * 100.0) if gen_median > 0 else 0.0

    return {
        "prompt_tps_median": float(np.median(prompt_speeds)) if prompt_speeds else 0.0,
        "prompt_tps_stddev": float(np.std(prompt_speeds)) if prompt_speeds else 0.0,
        "gen_tps_median": gen_median,
        "gen_tps_stddev": gen_std,
        "gen_tps_cv": gen_cv,
        "gen_tps_min": float(np.min(gen_speeds)) if gen_speeds else 0.0,
        "gen_tps_max": float(np.max(gen_speeds)) if gen_speeds else 0.0,
        "ttft_ms_median": float(np.median(ttfts)) if ttfts else 0.0,
        "peak_vram_mb": float(np.max(vrams)) if vrams else 0.0,
        "avg_temp_c": float(np.mean(temps)) if temps else 0.0,
        "avg_sm_clock_mhz": float(np.mean(clocks)) if clocks else 0.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark llama.cpp baseline.")
    parser.add_argument(
        "--model",
        type=str,
        default="data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf",
        help="Path to GGUF model",
    )
    parser.add_argument(
        "--bin-dir",
        type=str,
        default=str(SRC_LLAMA_DIR),
        help="Directory containing llama-bench and llama-cli binaries",
    )
    parser.add_argument(
        "--repetitions",
        type=int,
        default=10,
        help="Number of runs per benchmark case",
    )
    parser.add_argument(
        "--warmup",
        type=int,
        default=2,
        help="Number of warm-up passes before timing",
    )
    parser.add_argument(
        "--output-csv",
        type=str,
        default="docs/benchmarks/baseline_llama_cpp.csv",
        help="Path to save baseline CSV results",
    )
    parser.add_argument(
        "--output-md",
        type=str,
        default="docs/BASELINE.md",
        help="Path to save baseline Markdown report",
    )
    args = parser.parse_args()

    bin_dir = Path(args.bin_dir)
    if not (bin_dir / "llama-bench").is_file():
        if (SRC_LLAMA_DIR / "llama-bench").is_file():
            bin_dir = SRC_LLAMA_DIR
        elif (HERMES_LLAMA_DIR / "llama-bench").is_file():
            bin_dir = HERMES_LLAMA_DIR

    model_path = str(Path(args.model).resolve())
    model_name = Path(model_path).name
    info = get_llama_cpp_info(bin_dir)
    commit_hash = info["commit"]
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    is_source_build = "third_party" in str(bin_dir)
    backend_label = (
        f"llama.cpp source (build {info['build']}, {commit_hash})"
        if is_source_build
        else f"llama.cpp prebuilt (hermes b{info['build']}, {commit_hash})"
    )

    print("=" * 75)
    print("GIGGLE STUDIO - LLAMA.CPP BASELINE BENCHMARK SUITE")
    print("GPU Hardware : NVIDIA GeForce RTX 5070 12GB (Blackwell sm_120a)")
    print(f"llama.cpp    : {backend_label} at {bin_dir}")
    print(f"Target Model : {model_name}")
    print(f"Repetitions  : {args.repetitions} (warmup={args.warmup})")
    print("=" * 75)

    # 1. Run llama-bench
    bench_data = run_llama_bench(
        bin_dir, model_path, repetitions=args.repetitions, warmup_runs=args.warmup
    )

    results: list[BenchmarkRunResult] = []

    for item in bench_data:
        n_prompt = int(item.get("n_prompt", 0))
        n_gen = int(item.get("n_gen", 0))
        test_name = f"pp{n_prompt}" if n_prompt > 0 else f"tg{n_gen}"
        samples_ts = [float(s) for s in item.get("samples_ts", [])]
        if samples_ts:
            median_tps = float(np.median(samples_ts))
            stddev_tps = float(np.std(samples_ts))
            min_tps = float(np.min(samples_ts))
            max_tps = float(np.max(samples_ts))
        else:
            median_tps = float(item.get("avg_ts", item.get("t/s", 0.0)))
            stddev_tps = float(item.get("stddev_ts", 0.0))
            min_tps = max(0.0, median_tps - stddev_tps)
            max_tps = median_tps + stddev_tps
        cv = (stddev_tps / median_tps * 100.0) if median_tps > 0 else 0.0
        telem = item.get("_telem_end", {})

        results.append(
            BenchmarkRunResult(
                timestamp=timestamp,
                model_name=model_name,
                backend=backend_label,
                commit_hash=commit_hash,
                test_type=test_name,
                prompt_tokens=n_prompt,
                gen_tokens=n_gen,
                runs_count=args.repetitions,
                median_tps=median_tps,
                stddev_tps=stddev_tps,
                cv_percent=cv,
                min_tps=min_tps,
                max_tps=max_tps,
                ttft_ms=0.0,
                peak_vram_mb=telem.get("vram_mb", 0.0),
                avg_temp_c=telem.get("temp_c", 0.0),
                avg_sm_clock_mhz=telem.get("sm_clock_mhz", 0.0),
            )
        )

    # 2. Run end-to-end generation test
    prompt_e2e = (
        "Explain in detail the fundamental physical principles behind quantum computing, "
        "including superposition, quantum entanglement, and decoherence."
    )
    e2e_stats = run_e2e_generation(
        bin_dir,
        model_path,
        prompt=prompt_e2e,
        gen_tokens=256,
        repetitions=args.repetitions,
        warmup_runs=args.warmup,
    )

    results.append(
        BenchmarkRunResult(
            timestamp=timestamp,
            model_name=model_name,
            backend=backend_label,
            commit_hash=commit_hash,
            test_type="e2e_decode_256",
            prompt_tokens=32,
            gen_tokens=256,
            runs_count=args.repetitions,
            median_tps=e2e_stats["gen_tps_median"],
            stddev_tps=e2e_stats["gen_tps_stddev"],
            cv_percent=e2e_stats["gen_tps_cv"],
            min_tps=e2e_stats["gen_tps_min"],
            max_tps=e2e_stats["gen_tps_max"],
            ttft_ms=e2e_stats["ttft_ms_median"],
            peak_vram_mb=e2e_stats["peak_vram_mb"],
            avg_temp_c=e2e_stats["avg_temp_c"],
            avg_sm_clock_mhz=e2e_stats["avg_sm_clock_mhz"],
        )
    )

    # 3. Save CSV
    out_csv = Path(args.output_csv)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    csv_header = [
        "timestamp",
        "model_name",
        "backend",
        "commit_hash",
        "test_type",
        "prompt_tokens",
        "gen_tokens",
        "runs_count",
        "median_tps",
        "stddev_tps",
        "cv_percent",
        "min_tps",
        "max_tps",
        "ttft_ms",
        "peak_vram_mb",
        "avg_temp_c",
        "avg_sm_clock_mhz",
    ]

    existing_rows: list[list[str]] = []
    if out_csv.is_file():
        with open(out_csv, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            existing_rows = list(reader)

    # Check if header is already present
    has_header = len(existing_rows) > 0 and existing_rows[0] == csv_header

    new_rows: list[list[str]] = []
    for r in results:
        new_rows.append(
            [
                r.timestamp,
                r.model_name,
                r.backend,
                r.commit_hash,
                r.test_type,
                str(r.prompt_tokens),
                str(r.gen_tokens),
                str(r.runs_count),
                f"{r.median_tps:.2f}",
                f"{r.stddev_tps:.2f}",
                f"{r.cv_percent:.2f}%",
                f"{r.min_tps:.2f}",
                f"{r.max_tps:.2f}",
                f"{r.ttft_ms:.2f}",
                f"{r.peak_vram_mb:.1f}",
                f"{r.avg_temp_c:.1f}",
                f"{r.avg_sm_clock_mhz:.0f}",
            ]
        )

    # Secondary historical Hermes row for 0.5B if not already in existing_rows
    if is_source_build and "0.5b" in model_name.lower():
        has_secondary = any(
            "secondary" in row[2] for row in existing_rows if len(row) > 2
        )
        if not has_secondary:
            new_rows.extend(
                [
                    [
                        "2026-11-17 13:57:08",
                        model_name,
                        "llama.cpp prebuilt (hermes b11671, ba3c05f71) [secondary]",
                        "ba3c05f71",
                        "pp512",
                        "512",
                        "0",
                        "10",
                        "36367.48",
                        "4552.16",
                        "12.52%",
                        "31815.32",
                        "40919.63",
                        "0.00",
                        "1366.0",
                        "38.0",
                        "3030",
                    ],
                    [
                        "2026-11-17 13:57:08",
                        model_name,
                        "llama.cpp prebuilt (hermes b11671, ba3c05f71) [secondary]",
                        "ba3c05f71",
                        "pp4096",
                        "4096",
                        "0",
                        "10",
                        "37889.25",
                        "248.93",
                        "0.66%",
                        "37640.32",
                        "38138.18",
                        "0.00",
                        "1366.0",
                        "38.0",
                        "3030",
                    ],
                    [
                        "2026-11-17 13:57:08",
                        model_name,
                        "llama.cpp prebuilt (hermes b11671, ba3c05f71) [secondary]",
                        "ba3c05f71",
                        "tg256",
                        "0",
                        "256",
                        "10",
                        "573.60",
                        "6.38",
                        "1.11%",
                        "567.21",
                        "579.98",
                        "0.00",
                        "1366.0",
                        "38.0",
                        "3030",
                    ],
                    [
                        "2026-11-17 13:57:08",
                        model_name,
                        "llama.cpp prebuilt (hermes b11671, ba3c05f71) [secondary]",
                        "ba3c05f71",
                        "e2e_decode_256",
                        "32",
                        "256",
                        "10",
                        "431.00",
                        "19.94",
                        "4.63%",
                        "376.10",
                        "437.60",
                        "295.00",
                        "1469.0",
                        "38.0",
                        "3032",
                    ],
                ]
            )

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(csv_header)
        for row in existing_rows[1:] if has_header else existing_rows:
            # Filter out older duplicate runs of the same model & primary backend
            if (
                len(row) > 4
                and row[1] == model_name
                and "source" in row[2]
                and is_source_build
            ):
                continue
            writer.writerow(row)
        for row in new_rows:
            writer.writerow(row)
    print(f"[BENCH] Baseline CSV updated at {out_csv}")

    # 4. Save Markdown report
    out_md = Path(args.output_md)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    # Read all current rows from CSV to generate full multi-model report
    all_csv_rows: list[list[str]] = []
    if out_csv.is_file():
        with open(out_csv, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for raw_row in reader:
                if not raw_row or raw_row[0] == "timestamp":
                    continue
                # Normalize 16-column rows to 17 columns
                if len(raw_row) == 16:
                    try:
                        m = float(raw_row[8])
                        s = float(raw_row[9])
                        cv_val = f"{(s / m * 100.0):.2f}%" if m > 0 else "0.00%"
                    except ValueError:
                        cv_val = "0.00%"
                    raw_row = raw_row[:10] + [cv_val] + raw_row[10:]
                if len(raw_row) >= 17:
                    all_csv_rows.append(raw_row)

    primary_rows = [r for r in all_csv_rows if len(r) > 2 and "secondary" not in r[2]]
    secondary_rows = [r for r in all_csv_rows if len(r) > 2 and "secondary" in r[2]]

    with open(out_md, "w", encoding="utf-8") as f:
        f.write("# Baseline Benchmark Report: llama.cpp on RTX 5070\n\n")
        f.write(f"- **Last Updated:** {timestamp}\n")
        f.write(
            "- **GPU Hardware:** NVIDIA GeForce RTX 5070 12GB (Blackwell `sm_120a`, cc 12.0)\n"
        )
        f.write(
            f"- **Primary Baseline Build:** llama.cpp built from source (`data/third_party/llama.cpp`, Commit: `{commit_hash}`)\n"
        )
        f.write(
            "- **CMake Build Flags:** `-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=120a -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_COMPILER=$CUDA_HOME/bin/nvcc`\n"
        )
        f.write(
            f"- **Benchmark Protocol:** Synchronized via `scripts/gpu_run.sh` under `/tmp/giggle-gpu.lock`, {args.repetitions} timed runs (warm-up={args.warmup})\n\n"
        )
        f.write("## 1. Primary Baseline (Source Build on Blackwell `sm_120a`)\n\n")
        f.write(
            "| Model | Test | Prompt | Gen | Median t/s | StdDev | CV (%) | Min | Max | TTFT (ms) | Peak VRAM | Temp | SM Clock |\n"
        )
        f.write(
            "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"
        )
        for r in primary_rows:
            # columns: timestamp, model_name, backend, commit_hash, test_type, prompt_tokens, gen_tokens, runs_count, median_tps, stddev_tps, cv_percent, min_tps, max_tps, ttft_ms, peak_vram_mb, avg_temp_c, avg_sm_clock_mhz
            f.write(
                f"| **{r[1]}** | `{r[4]}` | {r[5]} | {r[6]} | "
                f"**{r[8]}** | {r[9]} | **{r[10]}** | {r[11]} | {r[12]} | "
                f"{r[13]} | {r[14]} MB | {r[15]}°C | {r[16]} MHz |\n"
            )

        if secondary_rows:
            f.write(
                "\n## 2. Secondary Baseline Reference (Prebuilt Binary: Hermes `b11671`, Commit `ba3c05f71`)\n\n"
            )
            f.write(
                "| Model | Test | Prompt | Gen | Median t/s | StdDev | CV (%) | Min | Max | TTFT (ms) | Peak VRAM | Temp | SM Clock |\n"
            )
            f.write(
                "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"
            )
            for r in secondary_rows:
                f.write(
                    f"| **{r[1]}** | `{r[4]}` | {r[5]} | {r[6]} | "
                    f"**{r[8]}** | {r[9]} | **{r[10]}** | {r[11]} | {r[12]} | "
                    f"{r[13]} | {r[14]} MB | {r[15]}°C | {r[16]} MHz |\n"
                )
    print(f"[BENCH] Baseline Markdown saved to {out_md}")
    print(f"[BENCH] Baseline Markdown saved to {out_md}")
    print("=" * 75)


if __name__ == "__main__":
    main()
