# Giggle Studio - Architectural & Engineering Decisions (ADR)

This document records the foundational architectural, security, and licensing decisions made for Giggle Studio.

---

## ADR-001: Open Source License Selection (Apache-2.0)
- **Status:** Accepted
- **Context:**
  We need a recognized open-source license that protects user freedom, provides patent grant protections, and remains compatible with the ecosystem of machine learning tools (PyTorch, Hugging Face Transformers, llama.cpp, PEFT, TRL).
- **Options Evaluated:**
  1. *MIT:* Highly permissive, but lacks explicit patent grant terms and contributor patent retaliation clauses.
  2. *AGPL-3.0:* Strong copyleft. While it prevents SaaS lock-in, it creates legal friction with third-party plugin authors, enterprise contributors, and downstream research integrations.
  3. *Apache-2.0:* Permissive with explicit contributor patent grants, trademark preservation, and straightforward attribution requirements.
- **Decision:**
  Choose **Apache-2.0**. It aligns with PyTorch and Hugging Face, guarantees clear patent indemnification, and enables community plugin authors to build extensions without fear of copyleft contamination.

---

## ADR-002: Process Model & Worker Supervised Isolation
- **Status:** Accepted
- **Context:**
  Loading LLM weights, executing CUDA kernels, and running GGUF/C++ inference bindings can cause segmentation faults, CUDA Out-Of-Memory (OOM) crashes, or memory fragmentation in Python's memory allocator.
- **Decision:**
  The main FastAPI web process NEVER runs heavy ML models directly.
  - Inference runs in a dedicated supervised worker process communicating over local IPC (Unix domain sockets / pipes with JSON / binary protocol).
  - Training runs in an independent managed subprocess.
  - Model Unload is implemented by gracefully terminating or killing the worker process (`SIGTERM` -> timeout -> `SIGKILL`). This guarantees 100% deterministic VRAM and RAM reclamation at the OS level without relying on PyTorch's `cuda.empty_cache()` or Python garbage collection.
  - If a worker crashes, the web server catches the exit status and displays a descriptive Turkish error in the UI with a 1-click restart button.

---

## ADR-003: Dual GPU Handling & Dedicated RTX 5070 Pinning
- **Status:** Accepted
- **Context:**
  The target host has an NVIDIA GeForce RTX 5070 (12 GB, Blackwell sm_120) and a secondary AMD Radeon RX 550. Mixing ROCm/CUDA or allowing PyTorch to discover the AMD card causes runtime failure or degraded performance.
- **Decision:**
  - Query NVML at startup to find the exact PCIe index of the NVIDIA GeForce RTX 5070.
  - In every worker subprocess (inference, training, RE, benchmarks), explicitly set the environment variable:
    ```bash
    CUDA_VISIBLE_DEVICES=<nvidia_index>
    ```
  - Display the resolved GPU name, index, driver version, and VRAM status prominently in the UI header and Doctor diagnostics page.

---

## ADR-004: Inference Backend Architecture (Hybrid llama.cpp & HF Transformers)
- **Status:** Accepted
- **Context:**
  GGUF format models provide superior memory efficiency, mmap loading, and quantized KV caching for consumer hardware. However, testing PEFT LoRA adapters directly before merging requires Hugging Face Transformers + bitsandbytes.
- **Decision:**
  Implement an abstract `InferenceBackend` base class with two concrete backends:
  1. `LlamaCppBackend`: For GGUF models. Uses `llama-cpp-python` built with CUDA sm_120 or a private self-built `llama.cpp` server process (`scripts/build_llamacpp.sh`).
  2. `HfTransformersBackend`: For raw Hugging Face Safetensors models, 4-bit NF4 loading with bitsandbytes, and adapter testing.

---

## ADR-005: Sandboxing Strategy for Code Mode, Agent, and RE
- **Status:** Accepted
- **Context:**
  Giggle Studio executes user-generated Python scripts, shell commands via Agent Mode, and inspects binary executables. Host isolation is paramount.
- **Decision:**
  - **Tier 1 (Preferred):** Bubblewrap (`bwrap`) with read-only root (`--ro-bind / /`), dedicated isolated writable workspace (`--bind <workspace> <workspace>`), network namespace isolation (`--unshare-net`), IPC/PID namespaces, and `--die-with-parent`.
  - **Tier 2 (Fallback):** `unshare -n` when bwrap is absent.
  - **Tier 3 (POSIX Fallback):** Subprocess with `setrlimit` (RLIMIT_AS, RLIMIT_CPU, RLIMIT_NPROC) and scrubbed environment variables (no tokens or keys passed).
  - Path traversal defense: All file accesses are resolved against canonical directory roots with symlink verification before reading or writing.

---

## ADR-006: Prompt-Injection Defense Architecture
- **Status:** Accepted
- **Context:**
  External content (incoming emails from Gmail, strings extracted from reverse-engineered binaries, web scraping results, and MCP server outputs) may contain malicious instructions designed to hijack the agent loop.
- **Decision:**
  - Delimit all untrusted inputs with custom XML-like tokens (`<untrusted_data source="..." hash="...">`).
  - System prompts instruct the LLM that content within untrusted blocks is purely passive data and must never be interpreted as commands.
  - Human-in-the-loop approval dialogs explicitly flag when a command or tool call was triggered following the ingestion of untrusted external content.

---

## ADR-007: Reverse Engineering Quarantine & Safety Policy
- **Status:** Accepted
- **Context:**
  The Reverse Engineering Suite analyzes unknown binaries and malware samples for legitimate defensive analysis.
- **Decision:**
  - Binary samples are uploaded directly into a quarantined directory with read-only permissions (`chmod 0400`) and the execution bit completely stripped.
  - Static analysis is default and mandatory.
  - Samples are NEVER executed directly on the host operating system.
  - Dynamic analysis is strictly opt-in and restricted to bubblewrap or VM backends with explicit UI warning banners.
