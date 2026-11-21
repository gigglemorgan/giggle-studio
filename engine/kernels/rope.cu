#include "giggle_cuda_common.cuh"

// Rotary Positional Embedding kernel (rotate_half layout matching Qwen2 and Llama 3)
// Optionally writes rotated K and unrotated V directly into the KV cache.
__global__ void rope_rotate_half_kernel(
    half* __restrict__ q,
    half* __restrict__ k,
    const half* __restrict__ v,
    half* __restrict__ k_cache,
    half* __restrict__ v_cache,
    int pos,
    int num_q_heads,
    int num_kv_heads,
    int head_dim,
    float freq_base
) {
    int half_dim = head_dim / 2;
    int head_idx = blockIdx.y;
    int i = threadIdx.x; // index in 0..half_dim-1

    if (i >= half_dim) return;

    float theta = (float)pos * __expf(-((float)(2 * i) / (float)head_dim) * __logf(freq_base));
    float cos_th = __cosf(theta);
    float sin_th = __sinf(theta);

    // Apply to Q heads
    if (head_idx < num_q_heads) {
        int q_offset = head_idx * head_dim;
        float x1 = __half2float(q[q_offset + i]);
        float x2 = __half2float(q[q_offset + i + half_dim]);

        q[q_offset + i] = __float2half(x1 * cos_th - x2 * sin_th);
        q[q_offset + i + half_dim] = __float2half(x1 * sin_th + x2 * cos_th);
    }

    // Apply to K heads and optionally write to k_cache
    if (head_idx < num_kv_heads) {
        int k_offset = head_idx * head_dim;
        float x1 = __half2float(k[k_offset + i]);
        float x2 = __half2float(k[k_offset + i + half_dim]);

        half rot1 = __float2half(x1 * cos_th - x2 * sin_th);
        half rot2 = __float2half(x1 * sin_th + x2 * cos_th);

        k[k_offset + i] = rot1;
        k[k_offset + i + half_dim] = rot2;

        if (k_cache) {
            int cache_offset = (pos * num_kv_heads + head_idx) * head_dim;
            k_cache[cache_offset + i] = rot1;
            k_cache[cache_offset + i + half_dim] = rot2;
        }

        if (v && v_cache) {
            int cache_offset = (pos * num_kv_heads + head_idx) * head_dim;
            v_cache[cache_offset + i] = v[k_offset + i];
            v_cache[cache_offset + i + half_dim] = v[k_offset + i + half_dim];
        }
    }
}

extern "C" {

void launch_rope(
    half* q,
    half* k,
    const half* v,
    half* k_cache,
    half* v_cache,
    int pos,
    int num_q_heads,
    int num_kv_heads,
    int head_dim,
    float freq_base,
    cudaStream_t stream
) {
    dim3 grid(1, max(num_q_heads, num_kv_heads));
    int half_dim = head_dim / 2;
    int threads = ((half_dim + 31) / 32) * 32;

    rope_rotate_half_kernel<<<grid, threads, 0, stream>>>(
        q, k, v, k_cache, v_cache, pos, num_q_heads, num_kv_heads, head_dim, freq_base
    );
}

} // extern "C"
