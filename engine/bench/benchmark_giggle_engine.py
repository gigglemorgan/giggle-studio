"""Benchmark harness for GiggleEngine on NVIDIA GeForce RTX 5070 (Blackwell sm_120).

Measures M1 naive CUDA engine performance:
- Decode generation (tg256 / e2e_decode_256)
- Prompt processing (pp512)
- Peak VRAM footprint
- TTFT (Time-To-First-Token)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np

from engine.python.giggle_engine import GiggleEngine


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


@dataclass
class EngineBenchmarkResult:
    timestamp: str
    model_name: str
    backend: str
    precision: str
    test_type: str
    prompt_tokens: int
    gen_tokens: int
    runs_count: int
    median_tps: float
    stddev_tps: float
    cv_percent: float
    min_tps: float
    max_tps: float
    ttft_ms: float
    peak_vram_mb: float
    engine_allocated_mb: float
    avg_temp_c: float
    avg_sm_clock_mhz: float


def run_benchmark(
    model_path: str,
    precision: str = "native",
    runs: int = 10,
    output_json: str | None = None,
    output_csv: str | None = None,
) -> list[EngineBenchmarkResult]:
    model_file = Path(model_path)
    model_name = model_file.name

    print(f"=== GiggleEngine M1 Benchmark: {model_name} (precision={precision}) ===")
    telem_start = get_gpu_telemetry()
    print(f"Initial GPU State: VRAM={telem_start['vram_mb']}MB, Temp={telem_start['temp_c']}C, SM={telem_start['sm_clock_mhz']}MHz")

    engine = GiggleEngine(model_path, precision=precision)
    engine_vram_mb = engine.vram_usage_bytes / (1024 * 1024)
    telem_loaded = get_gpu_telemetry()
    print(f"Loaded into GiggleEngine: Internal Pool={engine_vram_mb:.1f} MB, nvidia-smi VRAM={telem_loaded['vram_mb']:.1f} MB")

    results: list[EngineBenchmarkResult] = []
    ts = time.strftime("%Y-%m-%d %H:%M:%S")

    # 1. Warm-up
    print("\nWarming up engine (16 tokens)...")
    warmup_tokens = [1, 150, 2500, 300]
    engine.generate(warmup_tokens, max_new_tokens=16)

    # 2. Decode Benchmark (e2e_decode_256)
    # Prompt: 32 tokens, generate: 256 tokens
    prompt_32 = [100 + i * 7 for i in range(32)]
    gen_tokens_count = 256
    print(f"\n--- Running e2e_decode_256 ({runs} runs, 32 prompt tokens -> 256 generated tokens) ---")
    decode_tps_list: list[float] = []
    ttft_list: list[float] = []
    temps: list[float] = []
    clocks: list[float] = []
    peak_vram = telem_loaded["vram_mb"]

    for r in range(runs):
        t0 = time.perf_counter()
        # Prefill prompt
        engine.reset_kv_cache()
        engine.prefill(prompt_32, return_logits=False)
        t_ttft = time.perf_counter()
        ttft_ms = (t_ttft - t0) * 1000.0

        # Decode tokens
        curr_token = prompt_32[-1]
        start_decode_pos = len(prompt_32)
        t_dec_start = time.perf_counter()
        for step in range(gen_tokens_count):
            curr_token, _ = engine.decode_step(curr_token, start_decode_pos + step, return_logits=False)
        t_dec_end = time.perf_counter()

        decode_dur = t_dec_end - t_dec_start
        tps = gen_tokens_count / decode_dur if decode_dur > 0 else 0.0

        decode_tps_list.append(tps)
        ttft_list.append(ttft_ms)

        telem = get_gpu_telemetry()
        temps.append(telem["temp_c"])
        clocks.append(telem["sm_clock_mhz"])
        if telem["vram_mb"] > peak_vram:
            peak_vram = telem["vram_mb"]

        print(f"  Run {r+1:2d}/{runs:2d}: {tps:6.2f} tok/s, TTFT: {ttft_ms:6.2f} ms")

    med_tps = float(np.median(decode_tps_list))
    std_tps = float(np.std(decode_tps_list))
    cv_pct = (std_tps / med_tps) * 100.0 if med_tps > 0 else 0.0
    min_tps = float(np.min(decode_tps_list))
    max_tps = float(np.max(decode_tps_list))
    med_ttft = float(np.median(ttft_list))

    res_decode = EngineBenchmarkResult(
        timestamp=ts,
        model_name=model_name,
        backend="giggle-engine",
        precision=precision,
        test_type="e2e_decode_256",
        prompt_tokens=32,
        gen_tokens=gen_tokens_count,
        runs_count=runs,
        median_tps=round(med_tps, 2),
        stddev_tps=round(std_tps, 2),
        cv_percent=round(cv_pct, 2),
        min_tps=round(min_tps, 2),
        max_tps=round(max_tps, 2),
        ttft_ms=round(med_ttft, 2),
        peak_vram_mb=peak_vram,
        engine_allocated_mb=round(engine_vram_mb, 1),
        avg_temp_c=round(float(np.mean(temps)), 1),
        avg_sm_clock_mhz=round(float(np.mean(clocks)), 1),
    )
    results.append(res_decode)
    print(f"Decode Median: {med_tps:.2f} tok/s (std: {std_tps:.2f}, CV: {cv_pct:.2f}%)")

    # 3. Prompt Processing Benchmark (pp512)
    prompt_512 = [50 + (i * 13) % 1000 for i in range(512)]
    print(f"\n--- Running pp512 ({runs} runs, 512 prompt tokens) ---")
    pp_tps_list: list[float] = []

    for r in range(runs):
        engine.reset_kv_cache()
        t0 = time.perf_counter()
        engine.prefill(prompt_512, return_logits=False)
        dur = time.perf_counter() - t0
        tps = 512.0 / dur if dur > 0 else 0.0
        pp_tps_list.append(tps)
        print(f"  Run {r+1:2d}/{runs:2d}: {tps:7.2f} tok/s (dur: {dur*1000.0:6.2f} ms)")

    pp_med = float(np.median(pp_tps_list))
    pp_std = float(np.std(pp_tps_list))
    pp_cv = (pp_std / pp_med) * 100.0 if pp_med > 0 else 0.0

    res_pp = EngineBenchmarkResult(
        timestamp=ts,
        model_name=model_name,
        backend="giggle-engine",
        precision=precision,
        test_type="pp512",
        prompt_tokens=512,
        gen_tokens=0,
        runs_count=runs,
        median_tps=round(pp_med, 2),
        stddev_tps=round(pp_std, 2),
        cv_percent=round(pp_cv, 2),
        min_tps=round(float(np.min(pp_tps_list)), 2),
        max_tps=round(float(np.max(pp_tps_list)), 2),
        ttft_ms=0.0,
        peak_vram_mb=peak_vram,
        engine_allocated_mb=round(engine_vram_mb, 1),
        avg_temp_c=round(float(np.mean(temps)), 1),
        avg_sm_clock_mhz=round(float(np.mean(clocks)), 1),
    )
    results.append(res_pp)
    print(f"Prefill 512 Median: {pp_med:.2f} tok/s (std: {pp_std:.2f}, CV: {pp_cv:.2f}%)")

    engine.close()

    # Save results
    if output_json:
        out_p = Path(output_json)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump([asdict(r) for r in results], f, indent=2)
        print(f"\nSaved benchmark JSON to {output_json}")

    if output_csv:
        out_c = Path(output_csv)
        out_c.parent.mkdir(parents=True, exist_ok=True)
        file_exists = out_c.exists()
        with open(out_c, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(asdict(results[0]).keys()))
            if not file_exists:
                writer.writeheader()
            for r in results:
                writer.writerow(asdict(r))
        print(f"Saved benchmark CSV to {output_csv}")

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark GiggleEngine M1 Naive Implementation")
    parser.add_argument("--model", type=str, default="data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf")
    parser.add_argument("--precision", type=str, default="native", choices=["native", "f16"])
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--output-json", type=str, default="docs/benchmarks/m1_giggle_engine_benchmark.json")
    parser.add_argument("--output-csv", type=str, default="docs/benchmarks/m1_benchmark_results.csv")
    args = parser.parse_args()

    run_benchmark(
        model_path=args.model,
        precision=args.precision,
        runs=args.runs,
        output_json=args.output_json,
        output_csv=args.output_csv,
    )


if __name__ == "__main__":
    main()
