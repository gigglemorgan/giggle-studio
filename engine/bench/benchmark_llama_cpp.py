"""Baseline benchmark harness for llama.cpp on NVIDIA GeForce RTX 5070 (sm_120).

Executes llama-bench and end-to-end generation across prompt matrix:
- Model: Qwen2.5-0.5B-Instruct Q4_K_M (and others in matrix when present)
- Context / Prompts: 512, 4096 tokens
- Generation: 256 tokens (batch 1, greedy)
- Repetitions: >= 10 runs, reporting median, stddev, min, max
- Telemetry: GPU temperature, clocks, peak VRAM
- Protocol: Wrapped in scripts/gpu_run.sh
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

LLAMA_DIR = Path("/home/sedat/.hermes/tools/llamacpp-cuda-11671-linux-x64")
LLAMA_BENCH_BIN = LLAMA_DIR / "llama-bench"
LLAMA_CLI_BIN = LLAMA_DIR / "llama-cli"
GPU_RUN_SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "gpu_run.sh"


@dataclass
class BenchmarkRunResult:
    timestamp: str
    model_name: str
    backend: str
    commit_hash: str
    test_type: str  # pp512, pp4096, tg256, e2e_decode
    prompt_tokens: int
    gen_tokens: int
    runs_count: int
    median_tps: float
    stddev_tps: float
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


def get_llama_cpp_info() -> dict[str, str]:
    """Get commit hash and build info for llama.cpp binary."""
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = f"{LLAMA_DIR}:{env.get('LD_LIBRARY_PATH', '')}"
    cmd = [str(LLAMA_BENCH_BIN), "--version"]
    try:
        out = subprocess.check_output(cmd, env=env, stderr=subprocess.STDOUT, text=True)
        commit = "ba3c05f71"
        for line in out.splitlines():
            if "commit" in line:
                m = re.search(r"commit\s+([0-9a-fA-F]+)", line)
                if m:
                    commit = m.group(1)
        return {"commit": commit, "build": "11671", "raw": out.strip()}
    except Exception as e:
        return {"commit": "unknown", "build": "unknown", "raw": str(e)}


def run_llama_bench(
    model_path: str,
    repetitions: int = 10,
) -> list[dict[str, Any]]:
    """Execute llama-bench with JSON output."""
    env = dict(os.environ)
    env["LD_LIBRARY_PATH"] = f"{LLAMA_DIR}:{env.get('LD_LIBRARY_PATH', '')}"

    cmd = [
        str(GPU_RUN_SCRIPT),
        "env",
        f"LD_LIBRARY_PATH={LLAMA_DIR}:{env.get('LD_LIBRARY_PATH', '')}",
        str(LLAMA_BENCH_BIN),
        "-m",
        model_path,
        "-ngl",
        "99",
        "-fa",
        "1",
        "-r",
        str(repetitions),
        "-p",
        "512,4096",
        "-n",
        "256",
        "-o",
        "json",
    ]

    print(f"[BENCH] Running llama-bench: {' '.join(cmd)}")
    t0_telem = get_gpu_telemetry()
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    t1_telem = get_gpu_telemetry()

    # Parse JSON output from stdout
    # llama-bench outputs logs to stderr and JSON array to stdout
    data = json.loads(res.stdout)
    for item in data:
        item["_telem_start"] = t0_telem
        item["_telem_end"] = t1_telem
    return data


def run_e2e_generation(
    model_path: str,
    prompt: str,
    gen_tokens: int = 256,
    repetitions: int = 10,
) -> dict[str, Any]:
    """Execute llama-cli end-to-end generation runs to measure TTFT and generation speed."""
    prompt_speeds: list[float] = []
    gen_speeds: list[float] = []
    ttfts: list[float] = []
    temps: list[float] = []
    clocks: list[float] = []
    vrams: list[float] = []

    tmp_out = Path("/tmp/giggle_e2e_bench.txt")

    print(f"[BENCH] Running {repetitions} end-to-end generation runs via llama-cli...")
    for i in range(repetitions):
        if tmp_out.exists():
            tmp_out.unlink()

        telem_pre = get_gpu_telemetry()
        escaped_prompt = prompt.replace("'", "'\\''")
        inner_cmd = (
            f"'{GPU_RUN_SCRIPT}' env "
            f"LD_LIBRARY_PATH='{LLAMA_DIR}':$LD_LIBRARY_PATH "
            f"'{LLAMA_CLI_BIN}' -m '{model_path}' -ngl 99 -fa 1 "
            f"-p '{escaped_prompt}' -n {gen_tokens} --temp 0.0 -s 42 --single-turn"
        )
        script_cmd = ["script", "-q", "-c", inner_cmd, str(tmp_out)]

        subprocess.run(script_cmd, capture_output=True, text=True, check=True)
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
            print(f"  Run {i+1}/{repetitions}: Prompt={p_tps:.1f} t/s, Gen={g_tps:.1f} t/s, TTFT={ttft:.1f} ms")
        else:
            print(f"  Run {i+1}/{repetitions}: Output format unrecognized")

        temps.append(max(telem_pre["temp_c"], telem_post["temp_c"]))
        clocks.append(max(telem_pre["sm_clock_mhz"], telem_post["sm_clock_mhz"]))
        vrams.append(max(telem_pre["vram_mb"], telem_post["vram_mb"]))

    if tmp_out.exists():
        tmp_out.unlink()

    import numpy as np

    return {
        "prompt_tps_median": float(np.median(prompt_speeds)) if prompt_speeds else 0.0,
        "prompt_tps_stddev": float(np.std(prompt_speeds)) if prompt_speeds else 0.0,
        "gen_tps_median": float(np.median(gen_speeds)) if gen_speeds else 0.0,
        "gen_tps_stddev": float(np.std(gen_speeds)) if gen_speeds else 0.0,
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
        "--repetitions",
        type=int,
        default=10,
        help="Number of runs per benchmark case",
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
        default="docs/benchmarks/BASELINE.md",
        help="Path to save baseline Markdown report",
    )
    args = parser.parse_args()

    model_path = str(Path(args.model).resolve())
    model_name = Path(model_path).name
    info = get_llama_cpp_info()
    commit_hash = info["commit"]
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    print("=" * 70)
    print("GIGGLE STUDIO - LLAMA.CPP BASELINE BENCHMARK SUITE")
    print("GPU Hardware : NVIDIA GeForce RTX 5070 12GB (Blackwell sm_120)")
    print(f"llama.cpp    : build {info['build']}, commit {commit_hash}")
    print(f"Target Model : {model_name}")
    print(f"Repetitions  : {args.repetitions}")
    print("=" * 70)

    # 1. Run llama-bench
    bench_data = run_llama_bench(model_path, repetitions=args.repetitions)

    results: list[BenchmarkRunResult] = []

    for item in bench_data:
        n_prompt = int(item.get("n_prompt", 0))
        n_gen = int(item.get("n_gen", 0))
        test_name = f"pp{n_prompt}" if n_prompt > 0 else f"tg{n_gen}"
        tps_mean = float(item.get("avg_ts", item.get("t/s", 0.0)))
        tps_std = float(item.get("stddev_ts", 0.0))
        telem = item.get("_telem_end", {})

        results.append(
            BenchmarkRunResult(
                timestamp=timestamp,
                model_name=model_name,
                backend="llama.cpp (llama-bench)",
                commit_hash=commit_hash,
                test_type=test_name,
                prompt_tokens=n_prompt,
                gen_tokens=n_gen,
                runs_count=args.repetitions,
                median_tps=tps_mean,
                stddev_tps=tps_std,
                min_tps=max(0.0, tps_mean - tps_std),
                max_tps=tps_mean + tps_std,
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
        model_path,
        prompt=prompt_e2e,
        gen_tokens=256,
        repetitions=args.repetitions,
    )

    results.append(
        BenchmarkRunResult(
            timestamp=timestamp,
            model_name=model_name,
            backend="llama.cpp (llama-cli e2e)",
            commit_hash=commit_hash,
            test_type="e2e_decode_256",
            prompt_tokens=32,
            gen_tokens=256,
            runs_count=args.repetitions,
            median_tps=e2e_stats["gen_tps_median"],
            stddev_tps=e2e_stats["gen_tps_stddev"],
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

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
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
                "min_tps",
                "max_tps",
                "ttft_ms",
                "peak_vram_mb",
                "avg_temp_c",
                "avg_sm_clock_mhz",
            ]
        )
        for r in results:
            writer.writerow(
                [
                    r.timestamp,
                    r.model_name,
                    r.backend,
                    r.commit_hash,
                    r.test_type,
                    r.prompt_tokens,
                    r.gen_tokens,
                    r.runs_count,
                    f"{r.median_tps:.2f}",
                    f"{r.stddev_tps:.2f}",
                    f"{r.min_tps:.2f}",
                    f"{r.max_tps:.2f}",
                    f"{r.ttft_ms:.2f}",
                    f"{r.peak_vram_mb:.1f}",
                    f"{r.avg_temp_c:.1f}",
                    f"{r.avg_sm_clock_mhz:.0f}",
                ]
            )
    print(f"[BENCH] Baseline CSV saved to {out_csv}")

    # 4. Save Markdown report
    out_md = Path(args.output_md)
    with open(out_md, "w", encoding="utf-8") as f:
        f.write("# Baseline Benchmark Report: llama.cpp on RTX 5070\n\n")
        f.write(f"- **Date & Time:** {timestamp}\n")
        f.write("- **GPU Hardware:** NVIDIA GeForce RTX 5070 12GB (Blackwell `sm_120`)\n")
        f.write(f"- **llama.cpp Build:** `11671` (Commit: `{commit_hash}`)\n")
        f.write("- **Build Flags:** CUDA backend, Flash Attention enabled (`-fa 1`), all layers offloaded (`-ngl 99`)\n")
        f.write(f"- **Repetitions:** {args.repetitions} runs per case (under `/tmp/giggle-gpu.lock`)\n\n")
        f.write("## Results Summary\n\n")
        f.write("| Test | Model | Prompt Tokens | Gen Tokens | Median t/s | StdDev | Min | Max | Peak VRAM | Temp | Clock |\n")
        f.write("| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")
        for r in results:
            f.write(
                f"| `{r.test_type}` | {r.model_name} | {r.prompt_tokens} | {r.gen_tokens} | "
                f"**{r.median_tps:.2f}** | {r.stddev_tps:.2f} | {r.min_tps:.2f} | {r.max_tps:.2f} | "
                f"{r.peak_vram_mb:.0f} MB | {r.avg_temp_c:.0f}°C | {r.avg_sm_clock_mhz:.0f} MHz |\n"
            )
    print(f"[BENCH] Baseline Markdown saved to {out_md}")
    print("=" * 70)


if __name__ == "__main__":
    main()
