"""Unit tests for individual Giggle Engine CUDA kernels against PyTorch CPU reference."""

from __future__ import annotations

import ctypes
from pathlib import Path
import pytest
import torch
import numpy as np

LIB_PATH = Path(__file__).resolve().parent.parent / "build" / "libgiggle_engine.so"

def check_cuda_available() -> bool:
    if not LIB_PATH.is_file():
        return False
    try:
        cudart = ctypes.CDLL("libcudart.so")
        cnt = ctypes.c_int()
        if cudart.cudaGetDeviceCount(ctypes.byref(cnt)) != 0:
            return False
        return cnt.value > 0
    except Exception:
        return False

HAVE_CUDA = check_cuda_available()

if HAVE_CUDA:
    lib = ctypes.CDLL(str(LIB_PATH))
    cudart = ctypes.CDLL("libcudart.so")

    lib.launch_rmsnorm_fp16.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_float, ctypes.c_void_p]
    lib.launch_swiglu.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_void_p]
    lib.launch_gemv_f16.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_void_p]
    lib.launch_greedy_sample.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_void_p]
    lib.launch_greedy_sample.restype = ctypes.c_int32

    def cuda_malloc(size_bytes: int) -> ctypes.c_void_p:
        ptr = ctypes.c_void_p()
        cudart.cudaMalloc(ctypes.byref(ptr), ctypes.c_size_t(size_bytes))
        return ptr

    def cuda_memcpy_h2d(d_ptr: ctypes.c_void_p, arr: np.ndarray) -> None:
        cudart.cudaMemcpy(d_ptr, arr.ctypes.data_as(ctypes.c_void_p), ctypes.c_size_t(arr.nbytes), 1)

    def cuda_memcpy_d2h(arr: np.ndarray, d_ptr: ctypes.c_void_p) -> None:
        cudart.cudaMemcpy(arr.ctypes.data_as(ctypes.c_void_p), d_ptr, ctypes.c_size_t(arr.nbytes), 2)

    def cuda_free(ptr: ctypes.c_void_p) -> None:
        cudart.cudaFree(ptr)


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or libgiggle_engine.so not available")
def test_rmsnorm_kernel_matches_pytorch() -> None:
    torch.manual_seed(42)
    hidden_size = 896
    eps = 1e-6

    # PyTorch CPU reference
    x_pt = torch.randn(1, hidden_size, dtype=torch.float32)
    w_pt = torch.randn(hidden_size, dtype=torch.float32)
    out_pt = (x_pt * torch.rsqrt(x_pt.pow(2).mean(dim=-1, keepdim=True) + eps) * w_pt).half().float().numpy()

    # GPU execution
    x_np = x_pt.half().numpy()
    w_np = w_pt.half().numpy()
    out_np = np.zeros_like(x_np)

    d_x = cuda_malloc(x_np.nbytes)
    d_w = cuda_malloc(w_np.nbytes)
    d_out = cuda_malloc(out_np.nbytes)

    cuda_memcpy_h2d(d_x, x_np)
    cuda_memcpy_h2d(d_w, w_np)

    lib.launch_rmsnorm_fp16(d_x, d_w, d_out, 1, hidden_size, ctypes.c_float(eps), None)
    cudart.cudaDeviceSynchronize()
    cuda_memcpy_d2h(out_np, d_out)

    cuda_free(d_x)
    cuda_free(d_w)
    cuda_free(d_out)

    diff = np.abs(out_pt - out_np.astype(np.float32)).max()
    assert diff < 0.01, f"RMSNorm max diff too high: {diff}"


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or libgiggle_engine.so not available")
def test_swiglu_kernel_matches_pytorch() -> None:
    torch.manual_seed(42)
    inter = 4864
    gate_pt = torch.randn(inter, dtype=torch.float32)
    up_pt = torch.randn(inter, dtype=torch.float32)

    # PyTorch CPU reference: silu(gate) * up
    ref = (torch.nn.functional.silu(gate_pt) * up_pt).half().float().numpy()

    gate_np = gate_pt.half().numpy()
    up_np = up_pt.half().numpy()
    out_np = np.zeros_like(gate_np)

    d_g = cuda_malloc(gate_np.nbytes)
    d_u = cuda_malloc(up_np.nbytes)
    d_out = cuda_malloc(out_np.nbytes)

    cuda_memcpy_h2d(d_g, gate_np)
    cuda_memcpy_h2d(d_u, up_np)

    lib.launch_swiglu(d_g, d_u, d_out, inter, None)
    cudart.cudaDeviceSynchronize()
    cuda_memcpy_d2h(out_np, d_out)

    cuda_free(d_g)
    cuda_free(d_u)
    cuda_free(d_out)

    diff = np.abs(ref - out_np.astype(np.float32)).max()
    assert diff < 0.005, f"SwiGLU max diff too high: {diff}"


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or libgiggle_engine.so not available")
def test_gemv_f16_kernel_matches_pytorch() -> None:
    torch.manual_seed(42)
    M = 896
    K = 896
    W_pt = torch.randn(M, K, dtype=torch.float32)
    x_pt = torch.randn(K, dtype=torch.float32)
    bias_pt = torch.randn(M, dtype=torch.float32)

    ref = (torch.matmul(W_pt, x_pt) + bias_pt).half().float().numpy()

    W_np = np.ascontiguousarray(W_pt.half().numpy())
    x_np = np.ascontiguousarray(x_pt.half().numpy())
    bias_np = np.ascontiguousarray(bias_pt.half().numpy())
    out_np = np.zeros(M, dtype=np.float16)

    d_W = cuda_malloc(W_np.nbytes)
    d_x = cuda_malloc(x_np.nbytes)
    d_b = cuda_malloc(bias_np.nbytes)
    d_out = cuda_malloc(out_np.nbytes)

    cuda_memcpy_h2d(d_W, W_np)
    cuda_memcpy_h2d(d_x, x_np)
    cuda_memcpy_h2d(d_b, bias_np)

    lib.launch_gemv_f16(d_W, d_x, d_b, None, d_out, M, K, None)
    cudart.cudaDeviceSynchronize()
    cuda_memcpy_d2h(out_np, d_out)

    cuda_free(d_W)
    cuda_free(d_x)
    cuda_free(d_b)
    cuda_free(d_out)

    out_f32 = out_np.astype(np.float32)
    cos = np.dot(ref, out_f32) / (np.linalg.norm(ref) * np.linalg.norm(out_f32))
    assert cos > 0.999, f"GEMV F16 cosine similarity too low: {cos}"


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or libgiggle_engine.so not available")
def test_greedy_sampler_matches_argmax() -> None:
    vocab_size = 151936
    logits = np.random.randn(vocab_size).astype(np.float32)
    target_idx = 4242
    logits[target_idx] = 100.0

    d_logits = cuda_malloc(logits.nbytes)
    d_out = cuda_malloc(4)
    cuda_memcpy_h2d(d_logits, logits)

    sampled = lib.launch_greedy_sample(d_logits, d_out, vocab_size, None)

    cuda_free(d_logits)
    cuda_free(d_out)
    assert sampled == target_idx
