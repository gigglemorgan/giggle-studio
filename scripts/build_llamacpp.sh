#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BUILD_DIR="${PROJECT_ROOT}/data/build/llama.cpp"
INSTALL_DIR="${PROJECT_ROOT}/data/bin/llamacpp"

echo "=========================================================="
echo "      Building llama.cpp from source for Blackwell sm_120"
echo "=========================================================="

mkdir -p "${PROJECT_ROOT}/data/build"
mkdir -p "${INSTALL_DIR}"

if [ ! -d "${BUILD_DIR}/.git" ]; then
    echo "Cloning llama.cpp repository..."
    git clone --depth 1 https://github.com/ggerganov/llama.cpp.git "${BUILD_DIR}"
else
    echo "Updating existing llama.cpp repository..."
    cd "${BUILD_DIR}"
    git pull
fi

cd "${BUILD_DIR}"
mkdir -p build && cd build

echo "Configuring CMake with CUDA architectures 120 (Blackwell)..."
cmake .. \
    -DGGML_CUDA=ON \
    -DCMAKE_CUDA_ARCHITECTURES=120 \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="${INSTALL_DIR}"

echo "Building binaries..."
cmake --build . --config Release -j"$(nproc)"
cmake --install .

echo "✅ llama.cpp built successfully into ${INSTALL_DIR}"
