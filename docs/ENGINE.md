# Giggle Engine (`giggle-engine`)

Giggle Engine is Giggle Studio's proprietary high-performance LLM inference engine, purpose-built and micro-optimized for **NVIDIA GeForce RTX 5070 (Blackwell `sm_120`, 12 GB VRAM)**.

---

## 1. Objectives & Success Criteria

- **Target Hardware:** NVIDIA GeForce RTX 5070 12GB VRAM (Blackwell `sm_120`, Compute Capability 12.0)
- **Primary Goal:** Match or slightly beat `llama.cpp` CUDA backend on single-stream decode tokens/s (batch 1, $\ge 100\%$ on 2 of 3 target models, $\ge 95\%$ on the third), prompt processing ($\ge 90\%$), and peak VRAM ($\le$ llama.cpp + 5%).
- **Permanent Fallback:** `llama.cpp` remains integrated as fallback backend and benchmark baseline.

---

## 2. llama.cpp Baseline Measurements (RTX 5070 sm_120)

- **llama.cpp Build:** `11671` (Git Commit: `ba3c05f71`)
- **Build Flags:** CUDA backend enabled, Flash Attention (`-fa 1`), all layers offloaded to GPU (`-ngl 99`)
- **Execution Environment:** Synchronized under `scripts/gpu_run.sh` (`flock /tmp/giggle-gpu.lock`), >= 10 timed runs per scenario.

| Scenario | Model | Prompt Tokens | Gen Tokens | Median t/s | StdDev | Min | Max | Peak VRAM | Temp | SM Clock |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `pp512` | Qwen2.5-0.5B-Instruct Q4_K_M | 512 | 0 | **36,367.48** | 4,552.16 | 31,815.32 | 40,919.63 | 1366 MB | 38°C | 3030 MHz |
| `pp4096` | Qwen2.5-0.5B-Instruct Q4_K_M | 4096 | 0 | **37,889.25** | 248.93 | 37,640.32 | 38,138.18 | 1366 MB | 38°C | 3030 MHz |
| `tg256` | Qwen2.5-0.5B-Instruct Q4_K_M | 0 | 256 | **573.60** | 6.38 | 567.21 | 579.98 | 1366 MB | 38°C | 3030 MHz |
| `e2e_decode_256` | Qwen2.5-0.5B-Instruct Q4_K_M | 32 | 256 | **431.00** | 19.94 | 376.10 | 437.60 | 1469 MB | 38°C | 3032 MHz |

Raw benchmark runs logged in `docs/benchmarks/baseline_llama_cpp.csv`.

---

## 3. Milestone M0 Ground Truth & Parity Verification

Milestone M0 delivers mathematical ground truth verification tools:

1. **PyTorch Reference Implementation (`engine/reference/model.py`):**
   - Pure PyTorch implementation of Qwen2 / Llama 3 decoder-only architecture:
     - `RMSNorm` layer normalization.
     - `RotaryEmbedding` (HuggingFace `rotate_half` RoPE with arbitrary frequency base).
     - `CausalSelfAttention` with Grouped Query Attention (GQA) head repetition and causal masking.
     - `SwiGLUMLP` feed-forward network ($w_2(\text{silu}(w_1(x)) \odot w_3(x))$).
     - Full residual connections and unembedding LM head.
2. **GGUF Direct Weight Loader (`engine/reference/loader.py`):**
   - Parses GGUF metadata, detects architecture configurations, and dequantizes weights (Q4_K, Q6_K, Q8_0, F16) into FP32 model tensors.
3. **Logits Parity Verification Tool (`engine/tools/compare_logits.py`):**
   - Compares token-by-token logits against llama.cpp.

### Measured Parity Verification (Qwen2.5-0.5B-Instruct Q4_K_M)

```text
============================================================
LOGITS COMPARISON & PARITY REPORT
============================================================
Tokens Evaluated : 7
Vocab Size       : 151936
Max Abs Diff     : 1.133974
Mean Abs Diff    : 0.112105
Median Abs Diff  : 0.086691
Cosine Similarity: 0.999013
Top-1 Agreement  : 100.00%
Top-5 Agreement  : 91.43%
Top-10 Agreement : 94.29%
Perplexity (A)   : 15.0072
Perplexity (B)   : 14.9729
Perplexity Diff  : 0.0343
Status           : PASSED
============================================================
```

4. **Tokenizer Parity (`engine/tools/verify_tokenizer.py`):**
   - 100% exact match across all 8 test cases (English, Turkish Unicode with diacritics, Python code, C++ CUDA code, JSON/Markdown, Whitespace, Emojis, and Special Chat Tokens).

---

## 4. Milestone Roadmap

| Milestone | Description | Status | Verification Gate |
| :--- | :--- | :---: | :--- |
| **M0** | Ground truth PyTorch reference, benchmark harness, baseline metrics, logits tool | **Completed** | PyTorch reference + logits parity ($\ge 99.9\%$ cosine similarity, 100% top-1 match), tokenizer parity verified, baseline benchmark recorded on RTX 5070. Tagged `engine-m0-done`. |
| **M1** | Naive CUDA engine (F16, Q8_0, Q4_K_M), parity pass, backend integration | *Next* | Logits parity vs reference, backend streaming in UI. |
| **M2** | Decode optimization (weight repacking, GEMV fusion, flash decoding, GPU sampling) | *Pending* | Individual kernel speedups measured vs achievable memory bandwidth. |
| **M3** | Launch overhead removal (CUDA Graphs, small-model megakernel experiment) | *Pending* | Measured against graph version. |
| **M4** | Prefill optimization (chunked prefill, tensor-core GEMM) | *Pending* | Prompt-processing speedup verification. |
| **M5** | Product integration (Giggle Engine vs llama.cpp UI comparison, Doctor checks, docs) | *Pending* | Live side-by-side benchmark button in Giggle Studio UI. |
