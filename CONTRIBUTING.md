# Contributing to Giggle Studio

Thank you for your interest in contributing to Giggle Studio! We welcome contributions that adhere to our code quality standards, security principles, and responsible use policies.

---

## 1. Development Environment Setup

1. **Prerequisites:**
   - Linux (tested on Pop!_OS / Ubuntu 24.04+)
   - Python 3.11 or 3.12
   - Node.js >= 20 and npm
   - NVIDIA GPU with CUDA drivers (optional for CPU-only dev/test, required for inference/training)
   - Bubblewrap (`bwrap`) for sandbox validation

2. **Clone & Setup:**
   ```bash
   git clone https://github.com/Sedat-gigglemorgan/giggle-studio.git
   cd giggle-studio
   ./scripts/setup.sh
   ```

3. **Running in Development Mode:**
   ```bash
   ./scripts/dev.sh
   ```
   This starts the FastAPI backend on `http://127.0.0.1:8420` and the Vite dev server with proxy on `http://localhost:5173`.

---

## 2. Code Quality & Pre-Commit Checks

Before submitting any Pull Request, ensure all checks pass locally:

```bash
./scripts/check.sh
```

This verifies:
- Python formatting and linting with `ruff check` and `ruff format --check`
- Strict type checking with `mypy backend/app`
- Test suite with `pytest backend/tests/unit -m "not gpu"`
- Frontend build and TypeScript check with `npm run build`

---

## 3. Git & Commit Guidelines

- We follow **Conventional Commits**:
  - `feat(chat): add streaming stop button`
  - `fix(offload): correctly calculate compute buffer in VRAM estimator`
  - `docs(re): document Ghidra headless integration`
  - `refactor(db): optimize chat query indices`
- Keep commits small, logical, and focused.
- **NEVER** commit personal paths, real names, passwords, tokens, or credentials.

---

## 4. Writing a Plugin

Plugins are placed in `data/plugins/<plugin-id>/plugin.json`.
1. Declare your plugin manifest with explicit permissions:
   ```json
   {
     "id": "giggle.my-tool",
     "name": "My Tool",
     "version": "1.0.0",
     "entrypoint": "main.py",
     "permissions": ["filesystem:read"]
   }
   ```
2. Implement tools using Python decorators and return structured outputs.
3. Keep permissions scoped to the minimum required capability.

---

## 5. Adding a Reverse Engineering Adapter

To add a new static analysis backend:
1. Inherit from `AnalysisBackend` in `backend/app/re/backends/base.py`.
2. Implement binary inspection methods: `parse_headers()`, `extract_strings()`, `list_functions()`.
3. Ensure no execution occurs on the host system.
4. Add auto-detection logic in `scripts/doctor.py`.
