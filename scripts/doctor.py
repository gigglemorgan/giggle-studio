#!/usr/bin/env bash
""":"
# Bash wrapper to automatically use .venv if available
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [ -f "${PROJECT_ROOT}/.venv/bin/python3" ]; then
    PYTHON_EXEC="${PROJECT_ROOT}/.venv/bin/python3"
else
    PYTHON_EXEC="python3"
fi

export PYTHONPATH="${PROJECT_ROOT}/backend:${PYTHONPATH}"
exec "${PYTHON_EXEC}" "$0" "$@"
"""
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from giggle_studio.cli import run_doctor

if __name__ == "__main__":
    run_doctor()
