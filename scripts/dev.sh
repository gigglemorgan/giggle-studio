#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

if [ -f "${PROJECT_ROOT}/.venv/bin/activate" ]; then
    source "${PROJECT_ROOT}/.venv/bin/activate"
fi

export PYTHONPATH="${PROJECT_ROOT}/backend:${PYTHONPATH}"
export GIGGLE_DEBUG=true

echo "🚀 Starting development servers (FastAPI + Vite)..."

# Trap SIGINT and SIGTERM to kill background children
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

# Start backend with reload
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8420 --reload --app-dir "${PROJECT_ROOT}/backend" &
BACKEND_PID=$!

# Start frontend Vite server
if [ -d "${PROJECT_ROOT}/frontend" ]; then
    cd "${PROJECT_ROOT}/frontend"
    npm run dev &
    FRONTEND_PID=$!
    cd "${PROJECT_ROOT}"
fi

wait
