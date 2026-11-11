# Giggle Studio - Master Architecture & Implementation Plan

> **Notice on Project Name & Registration:**
> Please check for name collisions for **"Giggle Studio"** / `giggle-studio` on GitHub, PyPI, npm, and Hugging Face before publishing. Do not claim unregistered trademarks.

---

## 1. System Overview & Component Diagram

Giggle Studio is a self-hosted, local-first, privacy-focused open-weight LLM studio and AI-assisted reverse engineering workbench. It is engineered specifically for constrained local resources (e.g., NVIDIA RTX 5070 12GB VRAM, Intel i5-10400F 6C/12T, 16GB System RAM) with strict multi-process isolation and deterministic memory cleanup.

```
+---------------------------------------------------------------------------------------+
|                                    Frontend (Web UI)                                  |
|   React 18 + Vite + TypeScript (strict) + Tailwind CSS + Zustand + TanStack Query    |
|   Monaco Editor + Recharts + Cytoscape/React Flow + i18n (tr default, extensible)     |
+-------------------------------------------+-------------------------------------------+
                                            | HTTP (REST) / SSE / WebSocket
                                            v
+---------------------------------------------------------------------------------------+
|                                FastAPI API Server (Async)                             |
|  - Request Validation (Pydantic v2)                                                   |
|  - Standard Error Envelope: {error: {code, message_tr, detail, hint}}                 |
|  - SQLite (WAL, FTS5) via SQLAlchemy 2.0 + Alembic                                    |
|  - Job Manager (persistent background tasks, SSE/WS broadcast, survives reload)       |
|  - Safety & Rate Limits, CORS, Localhost-only (127.0.0.1) bind default                 |
+------+----------------------+------------------------+-------------------+------------+
       |                      |                        |                   |
       | IPC (Unix Socket)    | Subprocess (CLI/Pipes) | Subprocess (bwrap)| Subprocess
       v                      v                        v                   v
+--------------+      +----------------+       +---------------+   +------------------+
|  Inference   |      |    Training    |       |   Sandboxed   |   | RE & Analysis    |
|    Worker    |      |     Worker     |       |   Execution   |   | Worker/Adapters  |
| (llama.cpp / |      |  (SFTTrainer,  |       | (Python/Shell |   | (pyelftools,     |
| Transformers)|      | QLoRA, PEFT,   |       |  bubblewrap / |   |  r2pipe, Ghidra, |
|              |      | bitsandbytes)  |       |  unshare /    |   |  capa, FLOSS,    |
| * Determin-  |      | * Checkpointed |       |  RLIMITs)     |   |  LIEF, YARA)     |
|   istic kill |      |   gracefully   |       |               |                  |
|   on unload  |      | * RAM guard    |       |               |                  |
+--------------+      +----------------+       +---------------+   +------------------+
```

---

## 2. Directory Layout

```
giggle-studio/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # CPU-only CI: ruff, mypy, tsc, eslint, vitest, pytest
│   │   └── release.yml            # Semantic release build & package
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml         # Structured bug report with redacted doctor output
│   │   ├── feature_request.yml
│   │   └── plugin_proposal.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml
│   └── CODEOWNERS
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                # FastAPI app bootstrap, lifespan, static mount
│   │   ├── api/                   # API routers (thin HTTP layer)
│   │   │   ├── v1/                # Optional OpenAI-compatible endpoints
│   │   │   └── router.py          # /api prefix aggregator
│   │   ├── core/                  # Configuration, logging, security, errors
│   │   │   ├── config.py          # Pydantic Settings (giggle.yaml + .env)
│   │   │   ├── logging.py         # Structured JSON logging with redaction
│   │   │   ├── security.py        # Token auth, CORS, Fernet / Keyring secrets
│   │   │   └── errors.py          # Unified exception handlers & standard envelope
│   │   ├── db/                    # SQLAlchemy models, engine, session, migrations
│   │   │   ├── base.py
│   │   │   ├── session.py
│   │   │   ├── models/            # All ORM entity declarations
│   │   │   └── migrations/        # Alembic environment & versions
│   │   ├── schemas/               # Pydantic v2 request/response schemas
│   │   ├── services/              # Business logic layer
│   │   │   ├── model_service.py
│   │   │   ├── chat_service.py
│   │   │   ├── job_service.py
│   │   │   └── system_service.py
│   │   ├── inference/             # Inference worker supervision & protocols
│   │   │   ├── base.py            # Abstract InferenceBackend
│   │   │   ├── worker.py          # Supervised worker process
│   │   │   ├── llama_backend.py   # llama.cpp (GGUF) backend
│   │   │   ├── hf_backend.py      # HuggingFace / bitsandbytes backend
│   │   │   └── offload.py         # Memory estimator & layer placement engine
│   │   ├── training/              # LoRA / QLoRA SFT worker
│   │   │   ├── preflight.py       # Memory dry-run & parameter auto-tuner
│   │   │   ├── dataset.py         # Dataset parser, validator, chat template applicator
│   │   │   ├── runner.py          # Subprocess trainer with graceful pause/resume
│   │   │   └── export.py          # Merge & GGUF quantize converter
│   │   ├── agent/                 # Built-in Agent engine
│   │   │   ├── loop.py            # Plan -> Tool -> Observe -> Reflect loop
│   │   │   ├── registry.py        # Tool registry with schemas & risk levels
│   │   │   ├── policy.py          # End-user approval policy & human-in-the-loop
│   │   │   ├── injection.py       # Prompt-injection defense & untrusted data delimiting
│   │   │   └── tools/             # Standard agent tool implementations
│   │   ├── sandbox/               # Bubblewrap / unshare / RLIMIT sandboxing
│   │   │   ├── bwrap.py
│   │   │   ├── fallback.py
│   │   │   └── paths.py           # Path-traversal & symlink escape guards
│   │   ├── integrations/
│   │   │   └── gmail/             # OAuth2 PKCE Desktop, typed client, audit
│   │   ├── plugins/               # Plugin loader, manifest validator, hooks, SDK
│   │   │   ├── manifest.py
│   │   │   ├── manager.py
│   │   │   ├── permissions.py
│   │   │   └── mcp/               # Model Context Protocol stdio/SSE client
│   │   ├── re/                    # Reverse Engineering engine
│   │   │   ├── quarantine.py      # SHA256 hashing, no-exec store, safe handling
│   │   │   ├── backends/          # pyelftools, pefile, r2pipe, Ghidra headless, capa
│   │   │   ├── context.py         # Function context builder with token budgeting
│   │   │   ├── callgraph.py       # Bottom-up summarizer & map-reduce
│   │   │   ├── ai.py              # Explain, rename, deobfuscate, YARA/Sigma drafts
│   │   │   └── report.py          # Structured report generator
│   │   └── utils/                 # Hardware detection (NVML), system utilities
│   └── tests/
│       ├── unit/
│       └── integration/
├── frontend/
│   ├── src/
│   │   ├── pages/                 # Models, Chat, Code, Agent, Training, Gmail, Plugins, RE, Resources, Doctor, Settings
│   │   ├── components/            # Reusable UI widgets (Layout, Navbar, Modals, Terminal, Metrics)
│   │   ├── features/              # Complex domain features (OffloadPlanner, HexViewer, CallGraph, LossChart)
│   │   ├── lib/                   # API client, SSE stream reader, websocket manager
│   │   ├── store/                 # Zustand state slices
│   │   └── i18n/                  # Turkish (tr.json) default + English (en.json)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
├── plugins/                       # First-party reference plugins
│   ├── hello-tool/
│   ├── filesystem-notes/
│   └── mcp-bridge/
├── scripts/
│   ├── setup.sh                   # Environment check, venv creation, dependency install
│   ├── run.sh                     # Launch FastAPI + frontend server
│   ├── dev.sh                     # Launch Vite dev server + Uvicorn reload
│   ├── check.sh                   # Code quality checks (lint, types, tests, audit)
│   ├── doctor.py                  # Hardware, CUDA, sandbox, RE tool diagnostics
│   ├── build_llamacpp.sh          # Native llama.cpp builder for Blackwell sm_120
│   └── make_re_fixtures.sh        # Safe benign C programs compilation for RE tests
├── docs/                          # Comprehensive user and architectural documentation
├── data/                          # Runtime data, models, datasets, workspaces (gitignored)
├── giggle.yaml                    # Default configuration
├── .env.example                   # Environment variable template
├── pyproject.toml                 # Backend project definition & dependencies
├── README.md                      # English README
├── README.tr.md                   # Turkish README
├── LICENSE                        # Apache 2.0
├── NOTICE
├── THIRD_PARTY_NOTICES.md
├── CITATION.cff
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── SUPPORT.md
├── CHANGELOG.md
└── RESPONSIBLE_USE.md
```

---

## 3. Database Schema (SQLite with WAL & FTS5)

1. `settings`: Key-value configuration overrides (JSON values, encrypted secrets indicator).
2. `models`: Registered local models (`id`, `name`, `path`, `format`, `architecture`, `quantization`, `context_length`, `parameters_count`, `chat_template`, `sha256`, `license`, `created_at`).
3. `model_profiles`: Saved offload configs (`id`, `model_id`, `name`, `n_gpu_layers`, `n_ctx`, `kv_cache_type_k`, `kv_cache_type_v`, `flash_attention`, `tensor_overrides_json`, `moe_cpu_layers`, `bench_prompt_tps`, `bench_gen_tps`, `bench_peak_vram_mb`, `created_at`).
4. `chats`: Conversations (`id`, `title`, `model_id`, `system_prompt`, `sampling_params_json`, `created_at`, `updated_at`).
5. `messages`: Chat turns (`id`, `chat_id`, `parent_id`, `role`, `content`, `tokens_in`, `tokens_out`, `ttft_ms`, `tps`, `tool_calls_json`, `created_at`). FTS5 virtual table on `content`.
6. `prompts`: Reusable prompt templates (`id`, `title`, `content`, `tags_json`, `created_at`).
7. `datasets`: Training datasets (`id`, `name`, `path`, `format`, `row_count`, `token_count`, `columns_json`, `license`, `created_at`).
8. `training_runs`: Fine-tuning runs (`id`, `name`, `base_model_id`, `dataset_id`, `status`, `config_json`, `output_path`, `started_at`, `finished_at`, `error_msg`).
9. `run_metrics`: Training progress metrics (`id`, `run_id`, `step`, `epoch`, `loss`, `eval_loss`, `lr`, `grad_norm`, `tokens_per_sec`, `vram_usage_mb`, `created_at`).
10. `agent_sessions`: Agent sessions (`id`, `title`, `workspace_id`, `status`, `max_steps`, `approval_policy`, `created_at`).
11. `agent_steps`: Execution trace steps (`id`, `session_id`, `step_index`, `thought`, `tool_name`, `tool_args_json`, `tool_output`, `risk_level`, `approved_by_user`, `duration_ms`, `created_at`).
12. `gmail_message_cache`: Metadata-only email index (`id`, `message_id`, `thread_id`, `subject`, `from_address`, `to_address`, `date`, `snippet`, `has_attachments`, `cached_at`).
13. `gmail_audit`: Audit trail for actions taken on Gmail (`id`, `action`, `target_id`, `details_json`, `approved`, `timestamp`).
14. `plugins`: Registered plugin instances (`id`, `name`, `version`, `enabled`, `manifest_json`, `permissions_json`, `installed_at`).
15. `mcp_servers`: Configured Model Context Protocol servers (`id`, `name`, `transport`, `command_or_url`, `env_json`, `enabled`, `status`, `created_at`).
16. `re_projects`: Reverse engineering workspaces (`id`, `name`, `description`, `created_at`).
17. `re_samples`: Quarantined binary samples (`id`, `project_id`, `sha256`, `md5`, `sha1`, `file_type`, `file_size`, `quarantine_filename`, `is_quarantined_ro`, `created_at`).
18. `re_functions`: Disassembled/decompiled functions (`id`, `sample_id`, `address`, `name`, `size`, `decompiled_code`, `assembly_json`, `callgraph_json`, `xrefs_json`, `hash`).
19. `re_annotations`: Human or AI annotations (`id`, `function_id`, `version`, `author`, `annotation_type`, `content`, `applied`, `created_at`).
20. `re_summaries`: Cached function-level summaries (`id`, `function_hash`, `summary_text`, `evidence_citations_json`, `confidence`, `created_at`).
21. `re_embeddings`: Vector store references for semantic search (`id`, `sample_id`, `entity_type`, `entity_id`, `embedding_vector`, `created_at`).
22. `re_reports`: Generated analysis reports (`id`, `project_id`, `sample_id`, `title`, `format`, `content`, `created_at`).

---

## 4. API Endpoints Specification

### 4.1 Error Envelope Standard
All non-2xx responses adhere to:
```json
{
  "error": {
    "code": "OUT_OF_VRAM_ERROR",
    "message_tr": "Model GPU belleğine sığmadı (12.2 GB VRAM gerekli, 9.8 GB boş).",
    "detail": "CUDA OOM in worker allocation step 4.",
    "hint": "GPU katman sayısını (n_gpu_layers) 32'den 24'e düşürün veya KV-cache quantization (q4_0) etkinleştirin."
  }
}
```

### 4.2 REST Endpoints (`/api`)
- **System & Doctor:**
  - `GET /api/system/status` -> Hardware status (RTX 5070 VRAM, RAM, swap, CPU, thermals, processes).
  - `GET /api/system/doctor` -> Comprehensive diagnostic suite with auto-redacted output.
  - `POST /api/system/free-memory` -> Drop caches, force worker garbage collection.
- **Models & Inference:**
  - `GET /api/models` -> List local scanned models + parsed GGUF metadata.
  - `POST /api/models/scan` -> Trigger filesystem scan in `DATA_DIR/models`.
  - `POST /api/models/download` -> Download from HuggingFace (resumable, progress via SSE).
  - `POST /api/models/estimate-offload` -> Compute projected VRAM/RAM for given layer & ctx settings.
  - `POST /api/models/load` -> Spawn/respawn inference worker with settings.
  - `POST /api/models/unload` -> Terminate inference worker, reclaim VRAM.
  - `POST /api/models/benchmark` -> Run auto-tuner benchmark ladder.
  - `GET /api/models/profiles/{model_id}` -> List/save offload profiles.
- **Chat:**
  - `GET /api/chats`, `POST /api/chats`, `GET /api/chats/{id}`, `DELETE /api/chats/{id}`
  - `POST /api/chats/{id}/messages` -> Send message. Streams SSE tokens `data: {"token": "...", "stats": {...}}`.
  - `POST /api/chats/{id}/regenerate`, `POST /api/chats/{id}/stop`
- **Code Mode & Sandbox:**
  - `GET /api/workspaces`, `POST /api/workspaces`
  - `POST /api/workspaces/{id}/execute` -> Sandboxed execution (bwrap/unshare).
  - `POST /api/workspaces/{id}/apply-diff` -> Apply patch with user review.
- **Agent Mode:**
  - `POST /api/agent/sessions` -> Start agent task.
  - `GET /api/agent/sessions/{id}/stream` -> SSE stream of thoughts, tool invocations, approvals.
  - `POST /api/agent/sessions/{id}/approve` -> Submit human approval decision.
- **Training Studio:**
  - `GET /api/training/datasets`, `POST /api/training/datasets/import`
  - `POST /api/training/preflight` -> Dry run VRAM check & validation.
  - `POST /api/training/runs` -> Start fine-tuning run.
  - `GET /api/training/runs/{id}/stream` -> Live metrics & loss SSE stream.
  - `POST /api/training/runs/{id}/pause`, `POST /api/training/runs/{id}/resume`, `POST /api/training/runs/{id}/stop`
  - `POST /api/training/export/merge`, `POST /api/training/export/gguf`
- **Gmail Integration:**
  - `GET /api/gmail/status` -> OAuth status & granted scopes.
  - `POST /api/gmail/auth/start` -> Start OAuth PKCE loopback listener.
  - `POST /api/gmail/auth/disconnect` -> Revoke token & wipe local data.
  - `GET /api/gmail/messages`, `GET /api/gmail/threads/{id}`
  - `POST /api/gmail/drafts`, `POST /api/gmail/send` (strictly requires approval)
  - `GET /api/gmail/audit` -> Audit trail.
- **Plugins & MCP:**
  - `GET /api/plugins`, `POST /api/plugins/install`, `POST /api/plugins/{id}/toggle`
  - `GET /api/mcp/servers`, `POST /api/mcp/servers`
- **Reverse Engineering Suite:**
  - `GET /api/re/projects`, `POST /api/re/projects`
  - `POST /api/re/projects/{id}/samples` -> Upload sample (quarantined, no-exec, sha256).
  - `GET /api/re/samples/{id}/functions` -> List functions with metadata.
  - `GET /api/re/functions/{id}/decompilation`
  - `POST /api/re/functions/{id}/explain` -> LLM explanation with evidence links.
  - `POST /api/re/analysis/summarize-all` -> Bottom-up call graph map-reduce job.
  - `POST /api/re/proposals/apply` -> Review and apply rename/type patch.
  - `GET /api/re/samples/{id}/report` -> Export analysis report.

### 4.3 Optional OpenAI-Compatible Endpoints (`/v1`)
- `GET /v1/models`
- `POST /v1/chat/completions` (Disabled by default, toggleable in Settings, binds to 127.0.0.1 only).

---

## 5. Dependency Management & Verified Versions

### 5.1 Python Backend
- `python >= 3.11, < 3.13` (Current runtime: Python 3.12.3)
- `fastapi >= 0.115.0`, `uvicorn[standard] >= 0.30.0`, `pydantic >= 2.8.0`, `pydantic-settings >= 2.4.0`
- `sqlalchemy >= 2.0.30`, `alembic >= 1.13.0`, `aiosqlite >= 0.20.0`
- `sse-starlette >= 2.1.0`, `httpx >= 0.27.0`
- `pyyaml >= 6.0.1`, `cryptography >= 43.0.0`, `keyring >= 25.3.0`
- `pynvml >= 11.5.0` (or `nvidia-ml-py`) for device discovery & RTX 5070 index resolution
- `pyelftools >= 0.31`, `pefile >= 2023.2.7`, `capstone >= 5.0.0`, `r2pipe >= 1.9.0`
- Hardware & ML Stack (cu128 / Blackwell sm_120 compatible):
  - `torch`, `transformers`, `peft`, `trl`, `datasets`, `accelerate`, `bitsandbytes`
  - `llama-cpp-python` (with CUDA sm_120 compilation support or standalone managed llama.cpp child process)

### 5.2 Frontend
- `react >= 18.3.0`, `react-dom >= 18.3.0`, `vite >= 5.4.0`, `typescript >= 5.5.0`
- `tailwindcss >= 3.4.0`, `lucide-react >= 0.400.0`, `zustand >= 4.5.0`
- `@tanstack/react-query >= 5.50.0`, `recharts >= 2.12.0`, `@monaco-editor/react >= 4.6.0`
- `react-markdown >= 9.0.0`, `cytoscape >= 3.30.0`

---

## 6. Risk Register & Mitigation Matrix

| Risk | Severity | Impact | Mitigation Strategy |
| :--- | :---: | :--- | :--- |
| **Blackwell / sm_120 CUDA Compatibility** | High | PyTorch or llama.cpp failing to run on RTX 5070 | Resolve NVIDIA index via NVML. Use official cu128 PyTorch wheels; fallback to private compiled `llama.cpp` binary with `-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=120` inside `scripts/build_llamacpp.sh`. |
| **Dual GPU Setup (AMD RX 550 present)** | High | App attempting to use ROCm/OpenCL on RX 550 and failing | Hardcode detection of NVIDIA RTX 5070 PCI device index; export `CUDA_VISIBLE_DEVICES=<index>` in all worker subprocesses; explicitly show resolved device in UI. |
| **16 GB RAM Pressure** | High | System desktop freeze (COSMIC + browser + app + model = OOM swap thrash) | Refuse any model/training config where projected RAM exceeds 85% of total. Enforce mmap GGUF; avoid mlock. Deterministically kill worker on model unload; invoke garbage collection. |
| **12 GB VRAM Limit** | Medium | OOM when loading large models or context | Accurate pre-allocation calculator (weights + KV cache + compute buffers). Enforce default 600 MB margin. Offer KV quantization (q8_0, q4_0) and layer offload presets. |
| **Dynamic Analysis / Binary Sandbox** | High | Accidental execution of untrusted sample on host | Quarantine samples with read-only permissions (`chmod 0400`) and NO execution bit (`no-exec`). Static analysis by default. Dynamic analysis strictly inside bubblewrap/seccomp without network, requiring explicit UI user confirmation. |
| **Context Limits for RE Functions** | Medium | Large decompiled functions exceeding LLM context | Overlapping basic-block chunking; bottom-up map-reduce call graph summarization with local caching by function SHA256. |
| **Prompt Injection from Untrusted Data** | High | Binary strings or incoming emails hijacking Agent | Strict structural delimitation (`<untrusted_content source="...">`); explicit system instructions prohibiting instruction execution inside data; pattern scanner; origin transparency on approval dialogs. |
| **Gmail Token Lifetime & Scopes** | Medium | Testing consent refresh tokens expiring in 7 days; scope verification | Clear documentation in `docs/GMAIL_SETUP.md` and UI warnings explaining Google OAuth 2.0 Testing limitations. Start with read-only scopes; request sensitive scopes incrementally. |
| **Secret Leakage in Public Git Repo** | Critical | Accidental publishing of API keys, tokens, or personal paths | Extensive `.gitignore`; pre-commit hooks with ruff and gitleaks; startup integrity check refusing to launch if tracked files contain secrets; sanitized placeholder identities in git. |
