# Baseline Benchmark Report: llama.cpp on RTX 5070

- **Last Updated:** 2026-11-21 16:07:52
- **GPU Hardware:** NVIDIA GeForce RTX 5070 12GB (Blackwell `sm_120a`, cc 12.0)
- **Primary Baseline Build:** llama.cpp built from source (`data/third_party/llama.cpp`, Commit: `b019be0`)
- **CMake Build Flags:** `-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=120a -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_COMPILER=$CUDA_HOME/bin/nvcc`
- **Benchmark Protocol:** Synchronized via `scripts/gpu_run.sh` under `/tmp/giggle-gpu.lock`, 10 timed runs (warm-up=2)

## 1. Primary Baseline (Source Build on Blackwell `sm_120a`)

| Model | Test | Prompt | Gen | Median t/s | StdDev | CV (%) | Min | Max | TTFT (ms) | Peak VRAM | Temp | SM Clock |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `pp512` | 512 | 0 | **43239.30** | 4116.54 | **9.52%** | 29991.20 | 44769.40 | 0.00 | 3060.0 MB | 41.0°C | 2992 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `pp4096` | 4096 | 0 | **36299.35** | 2146.69 | **5.91%** | 33489.90 | 40436.00 | 0.00 | 3060.0 MB | 41.0°C | 2992 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `tg128` | 0 | 128 | **503.51** | 38.42 | **7.63%** | 389.61 | 514.60 | 0.00 | 3073.0 MB | 42.0°C | 3030 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `tg256` | 0 | 256 | **507.19** | 3.33 | **0.66%** | 498.72 | 511.23 | 0.00 | 3073.0 MB | 42.0°C | 3030 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `e2e_decode_256` | 32 | 256 | **371.60** | 39.99 | **10.76%** | 347.50 | 466.30 | 506.28 | 3343.0 MB | 38.4°C | 3036 MHz |
| **qwen2.5-3b-instruct-q4_k_m.gguf** | `pp512` | 512 | 0 | **9406.33** | 801.92 | **8.53%** | 7406.05 | 10080.60 | 0.00 | 3064.0 MB | 60.0°C | 2970 MHz |
| **qwen2.5-3b-instruct-q4_k_m.gguf** | `pp4096` | 4096 | 0 | **9339.60** | 41.31 | **0.44%** | 9295.21 | 9419.58 | 0.00 | 3064.0 MB | 60.0°C | 2970 MHz |
| **qwen2.5-3b-instruct-q4_k_m.gguf** | `tg128` | 0 | 128 | **199.33** | 10.25 | **5.14%** | 168.15 | 200.01 | 0.00 | 3064.0 MB | 56.0°C | 3007 MHz |
| **qwen2.5-3b-instruct-q4_k_m.gguf** | `tg256` | 0 | 256 | **179.21** | 17.07 | **9.53%** | 153.06 | 200.48 | 0.00 | 3064.0 MB | 56.0°C | 3007 MHz |
| **qwen2.5-3b-instruct-q4_k_m.gguf** | `e2e_decode_256` | 32 | 256 | **150.45** | 17.17 | **11.41%** | 138.20 | 181.10 | 409.98 | 3110.0 MB | 53.2°C | 3024 MHz |

## 2. Secondary Baseline Reference (Prebuilt Binary: Hermes `b11671`, Commit `ba3c05f71`)

| Model | Test | Prompt | Gen | Median t/s | StdDev | CV (%) | Min | Max | TTFT (ms) | Peak VRAM | Temp | SM Clock |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `pp512` | 512 | 0 | **36367.48** | 4552.16 | **12.52%** | 31815.32 | 40919.63 | 0.00 | 1366.0 MB | 38.0°C | 3030 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `pp4096` | 4096 | 0 | **37889.25** | 248.93 | **0.66%** | 37640.32 | 38138.18 | 0.00 | 1366.0 MB | 38.0°C | 3030 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `tg256` | 0 | 256 | **573.60** | 6.38 | **1.11%** | 567.21 | 579.98 | 0.00 | 1366.0 MB | 38.0°C | 3030 MHz |
| **qwen2.5-0.5b-instruct-q4_k_m.gguf** | `e2e_decode_256` | 32 | 256 | **431.00** | 19.94 | **4.63%** | 376.10 | 437.60 | 295.00 | 1469.0 MB | 38.0°C | 3032 MHz |
