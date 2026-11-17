# Baseline Benchmark Report: llama.cpp on RTX 5070

- **Date & Time:** 2026-11-17 13:57:08
- **GPU Hardware:** NVIDIA GeForce RTX 5070 12GB (Blackwell `sm_120`)
- **llama.cpp Build:** `11671` (Commit: `ba3c05f71`)
- **Build Flags:** CUDA backend, Flash Attention enabled (`-fa 1`), all layers offloaded (`-ngl 99`)
- **Repetitions:** 10 runs per case (under `/tmp/giggle-gpu.lock`)

## Results Summary

| Test | Model | Prompt Tokens | Gen Tokens | Median t/s | StdDev | Min | Max | Peak VRAM | Temp | Clock |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `pp512` | qwen2.5-0.5b-instruct-q4_k_m.gguf | 512 | 0 | **36367.48** | 4552.16 | 31815.32 | 40919.63 | 1366 MB | 38°C | 3030 MHz |
| `pp4096` | qwen2.5-0.5b-instruct-q4_k_m.gguf | 4096 | 0 | **37889.25** | 248.93 | 37640.32 | 38138.18 | 1366 MB | 38°C | 3030 MHz |
| `tg256` | qwen2.5-0.5b-instruct-q4_k_m.gguf | 0 | 256 | **573.60** | 6.38 | 567.21 | 579.98 | 1366 MB | 38°C | 3030 MHz |
| `e2e_decode_256` | qwen2.5-0.5b-instruct-q4_k_m.gguf | 32 | 256 | **431.00** | 19.94 | 376.10 | 437.60 | 1469 MB | 38°C | 3032 MHz |
