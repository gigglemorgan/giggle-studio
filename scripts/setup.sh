#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

echo "=========================================================="
echo "          Giggle Studio - Setup Environment"
echo "=========================================================="

# 1. Check Python version
PYTHON_BIN="python3"
if ! command -v "${PYTHON_BIN}" &>/dev/null; then
    echo "❌ Error: python3 is not installed."
    exit 1
fi

PY_VERSION=$(${PYTHON_BIN} -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "✓ Found Python ${PY_VERSION}"

# 2. Create virtual environment
VENV_DIR="${PROJECT_ROOT}/.venv"
if [ ! -d "${VENV_DIR}" ]; then
    echo "📦 Creating virtual environment at .venv..."
    ${PYTHON_BIN} -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"
pip install --upgrade pip setuptools wheel

# 3. Install backend dependencies
echo "📦 Installing backend packages in editable mode..."
pip install -e ".[dev]"

# 4. Initialize Data Directories & SQLite DB
echo "🔧 Running setup CLI..."
python -m giggle_studio.cli setup

# 5. Frontend dependency installation & build
if [ -d "${PROJECT_ROOT}/frontend" ] && command -v npm &>/dev/null; then
    echo "📦 Installing frontend dependencies..."
    cd "${PROJECT_ROOT}/frontend"
    npm install
    echo "🔨 Building frontend distribution..."
    npm run build || true
    cd "${PROJECT_ROOT}"
fi

echo "=========================================================="
echo "✅ Giggle Studio setup completed successfully!"
echo "Run 'scripts/run.sh' to start the application."
echo "=========================================================="
