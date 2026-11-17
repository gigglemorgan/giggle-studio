# Giggle Studio — Architecture Documentation

This document describes the high-level architecture, design decisions, and component implementations of Giggle Studio.

---

## 1. High-Level System Architecture

Giggle Studio is designed as a local-first, privacy-respecting LLM studio and AI-assisted reverse engineering workbench engineered for resource-constrained systems (e.g., NVIDIA RTX 5070 12GB VRAM, Intel 6C/12T CPU, 16GB RAM).

```
+---------------------------------------------------------------------------------------+
|                                    Frontend (Web UI)                                  |
|   React 18 + Vite + TypeScript (strict) + Tailwind CSS + Zustand + TanStack Query    |
|   Monaco Editor + Recharts + Cytoscape/React Flow + Radix UI + cmdk + i18n            |
+-------------------------------------------+-------------------------------------------+
                                            | HTTP (REST) / SSE / WebSocket
                                            v
+---------------------------------------------------------------------------------------+
|                                FastAPI API Server (Async)                             |
|  - Request Validation (Pydantic v2)                                                   |
|  - Structured Error Envelope: {error: {code, message_tr, detail, hint}}               |
|  - SQLite (WAL mode, FTS5) via SQLAlchemy 2.0 + Alembic migrations                    |
|  - Persistent Job Manager (SSE broadcast, background execution)                       |
|  - Security Sandbox Guard (Bubblewrap bwrap / landlock / seccomp)                     |
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

## 2. Backend & Worker Process Architecture

1. **Process Isolation**: Heavy ML frameworks (PyTorch, bitsandbytes, llama.cpp bindings, Ghidra/radare2) never run inside the FastAPI web server process. They are launched in dedicated child worker processes.
2. **Deterministic Memory Cleanup**: When a model is unloaded or switched, the worker process is explicitly terminated and reclaimed. This prevents PyTorch CUDA context retention and memory leaks on 12GB VRAM hardware.
3. **IPC & Streaming**: Real-time token generation streams over Unix domain sockets or SSE (Server-Sent Events) from inference workers through FastAPI to the browser.
4. **Sandboxed Code Execution**: Code execution in the Code and Agent modules uses Bubblewrap (`bwrap`) to enforce read-only system mounts, isolated `/tmp`, restricted network access, and memory/process RLIMITs.

---

## 3. Frontend Architecture

The Giggle Studio frontend is built with React 18, Vite 5, TypeScript in strict mode, Tailwind CSS, Radix UI primitives, and Zustand. It implements a Linear/Raycast-grade dark graphite design system with electric lime accents.

### 3.1 Design System & Design Tokens
- **Theme Palette**:
  - Dark Mode (primary): Deep graphite canvas (`#0B0E15`), card background (`#111622`), elevated surface (`#161C2C`), refined graphite borders (`#1F293D`).
  - Vivid Accent: High-contrast Electric Lime (`#D4FF00` dark, `#65A30D` light) committed across navigation indicators, primary buttons, and metric highlights.
  - Semantic Status: Defined tokens for Success (`#10B981`), Warning (`#F59E0B`), Danger (`#EF4444`), and Informational badges.
  - Light Mode: Fully styled counterpart respecting system preference (`prefers-color-scheme`) with instant manual toggle (`Ctrl+M`).
- **Design Tokens**: Standardized CSS variables defined in `frontend/src/index.css` and mapped to utility classes in `frontend/tailwind.config.js`:
  - Surfaces: `--bg-canvas`, `--bg-card`, `--bg-surface`, `--bg-elevated`, `--bg-hover`
  - Foregrounds: `--text-main`, `--text-muted`, `--text-faint`
  - Accents: `--accent`, `--accent-hover`, `--accent-fg`, `--accent-glow`
  - Borders: `--border-subtle`, `--border-default`, `--border-highlight`
- **Zero External CDNs (Self-Hosted Privacy)**:
  - Typography is 100% self-hosted via `@fontsource/inter` and `@fontsource/jetbrains-mono`.
  - Fonts are bundled directly into `dist/assets/`, guaranteeing complete offline capability and zero third-party network telemetry.

### 3.2 Code Splitting & Performance Optimization
- **Dynamic Imports (`React.lazy`)**: All 10 major pages are dynamically imported on demand with fallback suspense skeletons (`SkeletonLoader`).
- **Vite `manualChunks` Optimization**: Chunk size warning limit configured to 600 kB, with logical vendor splitting:
  - `vendor-react`: `react`, `react-dom`
  - `vendor-radix`: `@radix-ui/react-*` primitive suite
  - `vendor-monaco`: `@monaco-editor/react`
  - `vendor-recharts`: `recharts`
  - `vendor-icons`: `lucide-react`
- **Bundle Efficiency**: Main index bundle size reduced from >820 kB to **61 kB**, eliminating all Vite chunk size warnings.

### 3.3 State Management (Zustand)
- **`themeStore`**: Manages `dark`, `light`, or `system` mode, persistent in `localStorage`, with SSR-safe `window.matchMedia` fallback listeners.
- **`toastStore`**: Global toast messaging system supporting success, warning, error, and info toasts with auto-dismiss timers.
- **`modelStore`**: Real-time telemetry store tracking loaded model parameters, quantizations, VRAM utilization, and generation speed (tokens/sec).

### 3.4 Key Features & Views
1. **Sohbet (Chat)**: Multi-threaded chat with conversation search, collapsible `<think>` reasoning traces, Shiki-style syntax-highlighted code blocks (copy, wrap, language tags), per-message actions (copy, edit, branch, regenerate), live context window utilization meter, auto-growing composer, attachments preview, sampling drawer, and prompt inspection panel.
2. **Modeller (Model Manager)**: Grid/list view, VRAM fit indicators (green/amber/red), Hugging Face download dialog with progress. Hero **Offload/Yerleşim Planlayıcı** with draggable GPU-layer slider, live stacked VRAM/RAM bar, layer block map, presets, KV cache options, and Auto-tuner performance benchmark chart.
3. **Kod (Code Studio)**: IDE layout with workspace file tree, Monaco tabs, side-by-side diff view, custom `giggle-dark` and `giggle-light` editor themes, Bubblewrap sandboxed terminal execution, and contextual AI code assistance.
4. **Agent (Autonomous Agent)**: Session history, configurable safety policy (Strict/Balanced/Permissive), execution trace timeline with thought and tool-call cards, duration metrics, risk badges, and interactive approval cards (`A` to approve, `D` to deny).
5. **Eğitim (Training Studio)**: 5-step wizard (Dataset -> Config -> Preflight -> Train -> Export), dataset dropzone with format auto-detection, token distribution histogram, analytical VRAM preflight card, live training loss chart with EMA smoothing toggle, log tail, and export checkpoint management.
6. **Tersine Mühendislik (Reverse Engineering)**: Authorized-use security banner, 3-column workbench (Functions | Disassembly & Decompiler | AI Assistant), Shannon section entropy strip, offset jump navigation, SVG topological call graph, automated defensive YARA synthesis, and address citation chips.
7. **Gmail**: OAuth2 connection status with active scopes, split inbox and thread viewer, draft compose drawer, audit trail log, and mandatory approval modal before sending.
8. **Eklentiler (Plugins & MCP)**: Plugin gallery cards with granular permissions badges, installation dialog with permission approval flow, and MCP servers monitor with live health status dots.
9. **Kaynaklar (Hardware & Resources)**: Live telemetry gauges and sparkline area charts for GPU VRAM, temperature, power, RAM, and CPU utilization; per-process memory table; and one-click "Belleği Boşalt" action.
10. **Ayarlar & Doctor**: Categorized system configuration with search, Doctor checklist with automated health checks and copyable fix commands, and About modal.
11. **Onboarding & Shell**: Collapsible sidebar (`Ctrl+B`), top bar with model status and telemetry indicators, Command Palette (`Ctrl+K`), Keyboard Shortcuts modal (`?`), and first-run hardware detection onboarding flow.

---

## 4. Verification, Testing & CI/CD Pipeline

The project enforces quality and security verification via `scripts/check.sh`:
- **Python Backend**:
  - Ruff: Strict linting and formatting verification (`ruff check`, `ruff format --check`).
  - Mypy: Strict static type checking on all 67 backend modules (`mypy backend/app`).
  - Pytest: 42 unit and integration tests passing (`pytest backend/tests/unit -v -m "not gpu"`).
- **Frontend**:
  - TypeScript: Strict compilation with zero unused locals/parameters (`tsc`).
  - Vite: Production asset build with zero chunk warnings (`npm run build`).
  - Vitest: 10 unit tests covering stores and UI components (`npm test`).
  - Playwright: End-to-end smoke tests and automated screenshot capture (`npx playwright test`).
