#!/usr/bin/env bash
# scripts/gpu_run.sh
# Wraps GPU benchmarks and tests with flock /tmp/giggle-gpu.lock.
# Ensures one GPU job at a time, exports toolchain paths, and checks for high background load.
set -euo pipefail

LOCKFILE="/tmp/giggle-gpu.lock"

# Discover CUDA Toolkit via CUDA_HOME or fallback paths
if [ -z "${CUDA_HOME:-}" ]; then
    if [ -d "/usr/local/cuda-13.0" ]; then
        export CUDA_HOME="/usr/local/cuda-13.0"
    elif [ -d "/usr/local/cuda" ]; then
        export CUDA_HOME="/usr/local/cuda"
    fi
fi

if [ -n "${CUDA_HOME:-}" ] && [ -d "${CUDA_HOME}/bin" ]; then
    export PATH="${CUDA_HOME}/bin:${PATH}"
    if [ -d "${CUDA_HOME}/lib64" ]; then
        export LD_LIBRARY_PATH="${CUDA_HOME}/lib64:${LD_LIBRARY_PATH:-}"
    fi
fi

check_gpu_load() {
    if command -v nvidia-smi >/dev/null 2>&1; then
        local retry_count=0
        while [ $retry_count -lt 6 ]; do
            local util
            util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ' || echo "0")
            
            # Check for active heavy compute processes (excluding Xwayland / desktop compositor)
            local compute_procs
            compute_procs=$(nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>/dev/null | grep -v -E "cosmic|Xwayland" || true)

            if [ -n "$util" ] && [ "$util" -gt 30 ]; then
                echo "[WARN] GPU utilization is elevated (${util}%). Waiting 5s for GPU to settle (attempt $((retry_count+1))/6)..." >&2
                sleep 5
                retry_count=$((retry_count + 1))
            else
                break
            fi
        done

        local final_util
        final_util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1 | tr -d ' ' || echo "0")
        if [ -n "$final_util" ] && [ "$final_util" -gt 45 ]; then
            echo "[ERROR] GPU utilization still too high (${final_util}%). Aborting benchmark to prevent contaminated numbers." >&2
            return 1
        fi
    fi
    return 0
}

# Re-entrant check: if already holding the GPU lock in parent, execute directly
if [ "${GIGGLE_GPU_LOCKED:-0}" = "1" ]; then
    exec "$@"
fi

(
    flock -x 200 || {
        echo "[ERROR] Failed to acquire lock on $LOCKFILE" >&2
        exit 1
    }
    check_gpu_load
    export GIGGLE_GPU_LOCKED=1
    "$@"
) 200>"$LOCKFILE"
