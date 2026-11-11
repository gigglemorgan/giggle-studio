# Third-Party Notices & Dependency License Audit

Giggle Studio interfaces with and depends on open-source libraries and optional external tools. None of the external binary tools (such as Ghidra or radare2) are bundled or redistributed inside this repository; they are detected dynamically on the host system.

## 1. Direct Python & Runtime Dependencies

| Package / Project | Upstream License | Purpose in Giggle Studio | Compatibility Note |
| :--- | :--- | :--- | :--- |
| **FastAPI** | MIT | Core HTTP API Server | Permissive |
| **Uvicorn** | BSD-3-Clause | ASGI Server Implementation | Permissive |
| **Pydantic** | MIT | Data Validation & Settings Management | Permissive |
| **SQLAlchemy** | MIT | Database ORM & Connection Pool | Permissive |
| **Alembic** | MIT | Database Schema Migrations | Permissive |
| **PyTorch** | BSD-3-Clause | Machine Learning Tensor Engine | Permissive |
| **Hugging Face Transformers** | Apache-2.0 | Model Architecture & Tokenizers | Permissive |
| **PEFT** | Apache-2.0 | Parameter-Efficient Fine-Tuning (LoRA) | Permissive |
| **TRL** | Apache-2.0 | Supervised Fine-Tuning Trainer (SFT) | Permissive |
| **Datasets** | Apache-2.0 | Dataset Streaming & Processing | Permissive |
| **Accelerate** | Apache-2.0 | Multi-device memory offloading | Permissive |
| **bitsandbytes** | MIT | 4-bit / 8-bit Quantization Kernels | Permissive |
| **llama-cpp-python** | MIT | Python bindings for llama.cpp | Permissive |
| **llama.cpp** | MIT | High-performance C++ LLM inference | Permissive |
| **pyelftools** | Public Domain / MIT | ELF Binary Inspection | Permissive |
| **pefile** | MIT | Windows Portable Executable Parsing | Permissive |
| **capstone** | BSD-3-Clause | Disassembly Engine | Permissive |
| **r2pipe** | MIT | radare2 / rizin IPC pipe | Permissive |
| **pynvml** | BSD-3-Clause | NVIDIA GPU Telemetry | Permissive |
| **cryptography** | Apache-2.0 / BSD-3 | Credential & Token Encryption | Permissive |
| **keyring** | MIT | OS Secret Store Access | Permissive |

## 2. Frontend Libraries

| Package | Upstream License | Purpose |
| :--- | :--- | :--- |
| **React & React DOM** | MIT | Web User Interface Core |
| **Vite** | MIT | Frontend Build Tooling & Dev Server |
| **Tailwind CSS** | MIT | Utility-first CSS Styling |
| **Zustand** | MIT | Lightweight State Management |
| **TanStack Query** | MIT | Asynchronous Data Synchronization |
| **Monaco Editor** | MIT | In-browser Multi-file Code Editor |
| **Recharts** | MIT | Real-time Metric & Telemetry Visualizations |
| **Cytoscape.js** | MIT | Call Graph & Network Visualizations |
| **Lucide React** | ISC | Modern Iconography |

## 3. Optional External Analysis Adapters (Host-Installed Only)

The following tools are detected on the host if installed by the user. Giggle Studio interacts with them strictly via isolated subprocesses or CLI flags; they are NEVER redistributed:

- **Ghidra Headless:** Apache-2.0
- **radare2 / rizin:** LGPL-3.0 (Subprocess IPC only; no code linkage)
- **capa:** Apache-2.0
- **FLOSS:** Apache-2.0
- **YARA:** BSD-3-Clause
- **Frida:** wxWidgets / LGPL (Isolated dynamic inspection agent)
