# TASK: Build "giggle-engine": Giggle Studio's OWN LLM inference engine, goal = MATCH OR SLIGHTLY BEAT llama.cpp on an RTX 5070 (Blackwell sm_120, 12 GB VRAM)

FIRST ACTION: save this entire specification verbatim to docs/ENGINE_SPEC.md and commit it. In every later session, re-read docs/ENGINE_SPEC.md and docs/PROGRESS.md instead of relying on chat history, and continue from the last unfinished milestone.

Work autonomously in turbo mode under the same HARD LIMITS as before (stay in project dir and DATA_DIR, no sudo, no system changes, never push, no real credentials, nothing on disks/bootloader/drivers). If nvcc >= 12.8 is missing, write the exact need under "Needs user action" in docs/PROGRESS.md and build everything that does not need it first (reference implementation, harness, tests). Reply in Turkish; code/docs in English. llama.cpp stays as fallback backend and as the benchmark baseline; never remove it.

## SUCCESS CRITERIA (measured, not claimed)
Baseline = latest llama.cpp built from source by us with CUDA, flash attention ON, CUDA graphs ON, all layers on GPU, same GGUF file, same context size, greedy decoding, via llama-bench AND via end-to-end generation. Do not handicap the baseline: record its exact commit hash and build flags.
Model matrix: Qwen2.5-0.5B-Instruct Q4_K_M, Qwen2.5-3B-Instruct Q4_K_M, Llama-3.1-8B-Instruct Q4_K_M (fits 12 GB). Metrics: decode tokens/s (batch 1), prompt-processing tokens/s at 512 and 4096 tokens, time-to-first-token, peak VRAM.
Pass = decode tokens/s >= 100% of llama.cpp median on at least 2 of the 3 models and >= 95% on the third; prompt processing >= 90%; peak VRAM <= llama.cpp's + 5%. "Slightly beat" = a measured median above the baseline with non-overlapping run-to-run variance. If we miss, report plainly which kernels/stages are the bottleneck, with achieved-vs-peak memory bandwidth numbers.

## WHERE REAL SPEED COMES FROM (design for these on purpose)
Single-stream decode is memory-bandwidth-bound. Targets: >= 85-90% of the GPU's achievable bandwidth in the weight-streaming GEMVs, minimal launch/idle overhead, zero PCIe round trips per token.
1. Model-specialized kernels: templates with compile-time constants (hidden size, heads, head_dim, GQA ratio, intermediate size, quant block layout) for the supported architectures, instead of generic runtime-shaped kernels.
2. Load-time weight repacking: convert Q4_K_M/Q8_0 blocks into our own GPU-friendly interleaved layout (128-bit aligned loads, coalesced across a warp, scales/mins packed for vectorized access). Keep original GGUF as source of truth.
3. Fusion: RMSNorm+quant-activation, fused QKV, RoPE+KV-write, gate/up+SwiGLU, residual add fused into GEMV epilogue, final norm+lm_head+sampling.
4. Attention: flash-decoding with split-KV for long contexts, GQA-aware, q8 KV option.
5. Launch overhead removal: CUDA Graphs for the full decode step, then for small models (<= 3B, where launch/sync dominates) a persistent "megakernel" / per-layer fused kernel experiment. This is the most likely place to BEAT llama.cpp; measure it honestly against the graph version.
6. GPU sampling (temperature/top-k/top-p/min-p/repeat penalty): only the token id returns to the host; async token streaming over IPC.
7. Prefill: tensor-core GEMM path (cublasLt or CUTLASS, verify sm_120 support), chunked prefill, flash-attention prefill kernel.
8. Engine-level wins llama.cpp does not give by default: speculative decoding with a small draft model (same engine), prefix/prompt cache across chats (hash of token-prefix -> KV blocks, LRU).

## SCOPE v1
One architecture family (Qwen2.5 and Llama 3.x style decoder-only: RMSNorm, RoPE, GQA, SwiGLU), single GPU, batch-1 decode + batched prefill. Quant: Q4_K_M, Q8_0, F16 read via our existing GGUF parser. Anything else = clean "unsupported" error + automatic fallback to llama.cpp. Tokenizer: reuse a correct existing one and verify token-for-token equality with llama.cpp on a test corpus.

## ARCHITECTURE
C++17 + CUDA (CMake, arch 120, verify nvcc flags), nanobind or pybind11 bindings. Triton only for quick prototypes and only if it supports sm_120 on this machine (verify). Runs inside the existing supervised inference WORKER (same IPC; unload = kill worker; VRAM returns to baseline). New InferenceBackend "giggle-engine"; UI change limited to a backend selector and engine stats. Memory: one up-front GPU pool (no cudaMalloc in the hot path), preallocated KV cache, refuse to load if the plan exceeds VRAM/RAM ceilings (reuse our estimator). Layout: engine/{include,src,kernels,python,tests,bench}.

## MILESTONES (in order; each ends with tests, real benchmark numbers, commit, tag engine-mN-done)
M0 Ground truth: PyTorch reference of the architecture + logits-comparison tool vs llama.cpp and vs reference (max abs diff, top-k agreement, perplexity on a fixed text). Build llama.cpp baseline + the benchmark harness (see below) BEFORE writing engine kernels, and record baseline numbers.
M1 Correct naive CUDA engine, F16 then Q8_0 then Q4_K_M. Pass parity. Integrated as a backend, streaming in the UI.
M2 Decode optimization items 1-4 and 6, each kernel measured individually (cudaEvent; ncu/Nsight only if usable without sudo) with achieved GB/s vs peak. Record the speedup of each change in docs/benchmarks/changelog.csv.
M3 Launch-overhead removal (CUDA Graphs; megakernel/per-layer fusion experiment for small models). Keep only what measurably helps.
M4 Prefill optimization (item 7).
M5 Engine features (item 8) + product integration: "Giggle Engine vs llama.cpp" benchmark button in Models UI (same prompt/seed/quant, median+stddev over N runs), Doctor checks (nvcc, engine build, kernel self-test, parity test), docs/ENGINE.md with the support matrix, benchmark tables and honest limitations, README section "Giggle Engine (experimental)".
M6 (stretch, only after M1-M5 verified): Q5_K/Q6_K, more architectures, simple continuous batching.

## BENCHMARK PROTOCOL (non-negotiable)
- ONE GPU job at a time: wrap every benchmark/test that uses the GPU in `flock /tmp/giggle-gpu.lock <cmd>` (create scripts/gpu_run.sh for this). Before each benchmark check nvidia-smi: if another process is using the GPU noticeably (I may be gaming or using other apps), wait and retry, and mark any result taken under load as invalid.
- Warm-up runs, then >= 10 timed runs per case, report median, stddev, min/max; log GPU clocks and temperature; discard runs affected by thermal throttling and say so. Fixed seeds and prompts (short, 512-token, 4096-token), 256 generated tokens for decode.
- Store raw results as CSV in docs/benchmarks/ and a markdown table in docs/ENGINE.md; include exact commands and the llama.cpp commit hash so I can reproduce them on my machine. If we are slower anywhere, say so in the table.
- Correctness gate: a milestone is not done if logits parity fails the documented tolerance (state tolerances for F16 and for each quant explicitly), or a >= 1000-token greedy generation diverges into garbage versus the reference.

## SINGLE-AGENT MODE (I am on a quota-limited plan)
- Do NOT spawn sub-agents and do not run work in parallel. One agent, one task at a time, strictly in milestone order.
- Be quota-efficient: do not re-read large files repeatedly, keep tool output short (tail/grep), batch edits, no polish passes. Prefer one correct implementation over many exploratory rewrites. If you must stop early, leave docs/PROGRESS.md in a state from which the next session can resume exactly at the next unfinished step.

## RULES
- Write our own code. If you study llama.cpp or another project for ideas, do NOT copy code verbatim unless you keep the license notices; list derived pieces in THIRD_PARTY_NOTICES.md and record adopted ideas in docs/DECISIONS.md.
- Robustness: no OOM crashes (check before allocating), debug-build bounds checks, compute-sanitizer where available without sudo, clean unload with VRAM back to baseline (verified), a worker crash never takes down the API.
- Tests: each kernel vs a CPU/PyTorch reference on random inputs, repacking round-trip, sampler distribution, KV/prefix cache logic, end-to-end generation parity (GPU-marked). CI stays CPU-only; the Python package must install and run without nvcc (engine backend reports "not built").
- After every milestone update docs/PROGRESS.md with: verified (commands + real numbers), NOT verified, Needs user action. Never write "done/verified" without the command output that shows it. Conventional Commits, tags engine-mN-done, no push. Run scripts/check.sh at the end of each milestone.
Begin with saving the spec, then M0.
