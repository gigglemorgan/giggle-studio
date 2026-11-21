"""Unit test for individual quantized GEMV CUDA kernels against GGML dequantization."""

import ctypes
from pathlib import Path
import numpy as np
import gguf

lib_path = Path("engine/build/libgiggle_engine.so")
lib = ctypes.CDLL(str(lib_path))

# Kernel signatures
lib.launch_gemv_f16.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_void_p]
lib.launch_gemv_q5_0.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_void_p]
lib.launch_gemv_q8_0.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_void_p]
lib.launch_gemv_q4_k.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_void_p]
lib.launch_gemv_q6_k.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int32, ctypes.c_int32, ctypes.c_void_p]

# cudaMalloc / cudaMemcpy helpers via ctypes
cudart = ctypes.CDLL("libcudart.so")

def cuda_malloc(size_bytes):
    ptr = ctypes.c_void_p()
    cudart.cudaMalloc(ctypes.byref(ptr), ctypes.c_size_t(size_bytes))
    return ptr

def cuda_memcpy_h2d(d_ptr, h_arr):
    cudart.cudaMemcpy(d_ptr, h_arr.ctypes.data_as(ctypes.c_void_p), ctypes.c_size_t(h_arr.nbytes), 1)

def cuda_memcpy_d2h(h_arr, d_ptr):
    cudart.cudaMemcpy(h_arr.ctypes.data_as(ctypes.c_void_p), d_ptr, ctypes.c_size_t(h_arr.nbytes), 2)

reader = gguf.GGUFReader("data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf")

for t in reader.tensors:
    if t.name in ["blk.0.attn_v.weight", "blk.0.attn_q.weight", "blk.0.ffn_down.weight", "blk.11.ffn_down.weight"]:
        t_type = int(t.tensor_type)
        shape = list(t.shape)
        K = shape[0]
        M = shape[1]
        print(f"\n--- Testing {t.name} (type={t_type}, shape={shape}, M={M}, K={K}) ---")

        # Dequantize with GGML for reference
        deq = gguf.quants.dequantize(t.data, t.tensor_type) # shape (M, K)
        x = np.ones(K, dtype=np.float16)

        # Reference CPU dot product
        ref_y = deq.dot(x.astype(np.float32)).astype(np.float32)

        # Allocate GPU memory
        d_w = cuda_malloc(t.data.nbytes)
        cuda_memcpy_h2d(d_w, np.ascontiguousarray(t.data))

        d_x = cuda_malloc(x.nbytes)
        cuda_memcpy_h2d(d_x, x)

        y_gpu = np.zeros(M, dtype=np.float16)
        d_y = cuda_malloc(y_gpu.nbytes)

        if t_type == 8: # Q8_0
            lib.launch_gemv_q8_0(d_w, d_x, None, None, d_y, M, K, None)
        elif t_type == 6: # Q5_0
            lib.launch_gemv_q5_0(d_w, d_x, None, None, d_y, M, K, None)
        elif t_type == 12: # Q4_K
            lib.launch_gemv_q4_k(d_w, d_x, None, None, d_y, M, K, None)
        elif t_type == 14: # Q6_K
            lib.launch_gemv_q6_k(d_w, d_x, None, None, d_y, M, K, None)

        cudart.cudaDeviceSynchronize()
        cuda_memcpy_d2h(y_gpu, d_y)

        y_gpu_f32 = y_gpu.astype(np.float32)
        has_nan = np.isnan(y_gpu_f32).any()
        print(f"GPU result has NaN: {has_nan}")
        if not has_nan:
            max_diff = np.abs(y_gpu_f32 - ref_y).max()
            cos = np.dot(y_gpu_f32, ref_y) / (np.linalg.norm(y_gpu_f32) * np.linalg.norm(ref_y))
            print(f"Max abs diff: {max_diff:.4f}, Cosine sim: {cos:.6f}")
        else:
            print("NaN elements:", np.isnan(y_gpu_f32).sum(), "out of", M)
