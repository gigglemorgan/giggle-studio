#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

if [ -f "${PROJECT_ROOT}/.venv/bin/activate" ]; then
    source "${PROJECT_ROOT}/.venv/bin/activate"
fi

export PYTHONPATH="${PROJECT_ROOT}/backend:${PYTHONPATH}"

echo "=========================================================="
echo "          Giggle Studio - Quality & Security Checks"
echo "=========================================================="

echo "🔍 1. Running Ruff (Linter & Formatter)..."
ruff check backend/
ruff format --check backend/

echo "🔍 2. Running Mypy (Type Checker)..."
mypy backend/app

echo "🔍 3. Running Pytest (Unit Tests)..."
pytest backend/tests/unit -v -m "not gpu"

if [ -d "${PROJECT_ROOT}/frontend/node_modules" ]; then
    echo "🔍 4. Checking Frontend (TypeScript & Lint)..."
    cd "${PROJECT_ROOT}/frontend"
    npm run build
    cd "${PROJECT_ROOT}"
fi

echo "=========================================================="
echo "✅ All checks passed successfully!"
echo "=========================================================="
