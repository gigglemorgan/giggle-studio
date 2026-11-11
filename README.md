# Giggle Studio

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha_0.1.0-orange.svg)](CHANGELOG.md)
[![Python: 3.11+](https://img.shields.io/badge/Python-3.11_|_3.12-blue.svg)](pyproject.toml)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux_(Pop!_OS/Ubuntu)-green.svg)](docs/PLAN.md)

> **Giggle Studio** is a self-hosted, local-first, privacy-focused open-weight LLM studio, fine-tuning environment, and AI-assisted defensive reverse engineering workbench. It unifies high-performance GGUF and Transformers inference, LoRA/QLoRA training, sandboxed code execution, autonomous agent tooling, and binary analysis in a single polished application.

---

## Key Features

- **Resource-Aware Inference Engine:** Dedicated worker process with deterministic memory cleanup. GGUF execution via `llama.cpp` and Safetensors via Hugging Face Transformers & `bitsandbytes`.
- **Advanced GPU/CPU Placement & Offload:** Interactive layer-by-layer offload planner, VRAM/RAM allocation predictor, KV-cache quantization (f16, q8_0, q4_0), MoE CPU expert offload, and auto-tuning benchmark ladder.
- **Autonomous Agent & Code Mode:** Sandboxed execution via Linux Bubblewrap (`bwrap`), multi-file Monaco editor, step-by-step human approval policies, and strict prompt-injection defenses.
- **Training Studio (LoRA / QLoRA SFT):** 4-bit NF4 training, automated memory preflight dry-runs, RAM safety guards, live loss curves, checkpointing, and GGUF quantization export.
- **Defensive Reverse Engineering Suite:** Quarantined no-exec sample store, static inspection (ELF/PE/mach-o), bottom-up call-graph summarization with evidence citations, and YARA/Sigma rule drafting.
- **Gmail Integration:** Private OAuth 2.0 PKCE desktop flow, encrypted token storage in OS keyring, granular read/write permissions, and human-verified send actions.

---

## Hardware Requirements & Tested Baseline

Giggle Studio is engineered specifically to operate reliably on constrained modern hardware:

| Component | Tested Primary System | Minimum Supported |
| :--- | :--- | :--- |
| **Operating System** | Pop!_OS 24.04 (Linux x86_64) | Linux (kernel >= 5.15) with bubblewrap |
| **GPU** | NVIDIA GeForce RTX 5070 (12 GB VRAM, sm_120) | NVIDIA GPU (8 GB+ VRAM) or CPU fallback |
| **CPU** | Intel Core i5-10400F (6C / 12T, AVX2) | 4-core x86_64 CPU with AVX2 |
| **System RAM** | 16 GB DDR4 | 16 GB recommended (never holds duplicate weights) |
| **Storage** | NVMe SSD (fast) + HDD (data store) | 20 GB free disk space for models |

*Note on other platforms:* macOS and Windows WSL2 are currently untested and unsupported in this alpha release.

---

## Quick Start (Linux)

```bash
# 1. Clone the repository
git clone https://github.com/Sedat-gigglemorgan/giggle-studio.git
cd giggle-studio

# 2. Run the automated setup script
./scripts/setup.sh

# 3. Check system diagnostics
python3 scripts/doctor.py

# 4. Start Giggle Studio
./scripts/run.sh
```
Open your web browser at `http://127.0.0.1:8420`.

---

## Architecture

Giggle Studio isolates memory-heavy machine learning runtimes from the core web service:

```
+-----------------------------------------------------------+
|               Web Browser (React + Vite UI)               |
+-----------------------------+-----------------------------+
                              | REST / SSE / WebSocket
                              v
+-----------------------------------------------------------+
|               FastAPI Server (127.0.0.1:8420)             |
|   - SQLite (WAL) + SQLAlchemy 2.0                         |
|   - Job Manager & Streaming Handlers                      |
+-------+--------------------+---------------------+--------+
        | IPC                | Subprocess          | Subprocess
        v                    v                     v
+---------------+    +----------------+    +----------------+
| Inference     |    | Training       |    | Bubblewrap     |
| Worker        |    | Subprocess     |    | Sandbox        |
| (llama.cpp)   |    | (SFT / QLoRA)  |    | (Agent & RE)   |
+---------------+    +----------------+    +----------------+
```

---

## Limitations & Alpha Notice

- This is a pre-alpha preview (`v0.1.0`). APIs and database schemas may evolve.
- Only legitimate, authorized defensive binary analysis is supported. Please review [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md).
- To preserve system stability, memory allocations exceeding 85% of physical RAM or projected VRAM exceeding 11.4 GB are blocked by default.

---

## License

Giggle Studio is licensed under the [Apache-2.0 License](LICENSE).
Copyright © 2026 Sedat-gigglemorgan.
