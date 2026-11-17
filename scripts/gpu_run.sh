#!/usr/bin/env bash
# scripts/gpu_run.sh
# Wraps GPU benchmarks and tests with flock /tmp/giggle-gpu.lock.
# Ensures one GPU job at a time and checks for high background load.
set -euo pipefail

LOCKFILE="/tmp/giggle-gpu.lock"

check_gpu_load() {
    if command -v nvidia-smi >/dev/null 2>&1; then
        local util
        util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ' || echo "0")
        if [ -n "$util" ] && [ "$util" -gt 35 ]; then
            echo "[WARN] GPU utilization is elevated (${util}%). Another process may be active." >&2
            echo "[INFO] Waiting 5 seconds for GPU load to settle..." >&2
            sleep 5
            util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ' || echo "0")
            if [ -n "$util" ] && [ "$util" -gt 50 ]; then
                echo "[ERROR] GPU utilization still too high (${util}%). Aborting benchmark to prevent contaminated numbers." >&2
                return 1
            fi
        fi
    fi
    return 0
}

(
    flock -x 200 || {
        echo "[ERROR] Failed to acquire lock on $LOCKFILE" >&2
        exit 1
    }
    check_gpu_load
    "$@"
) 200>"$LOCKFILE"
