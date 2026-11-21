#include "giggle_cuda_common.cuh"

// Decode attention with KV cache (batch=1, GQA aware)
// Each CUDA block computes one attention query head
__global__ void decode_attention_kernel(
    const half* __restrict__ q,       // [num_q_heads, head_dim]
    const half* __restrict__ k_cache, // [max_ctx, num_kv_heads, head_dim]
    const half* __restrict__ v_cache, // [max_ctx, num_kv_heads, head_dim]
    half* __restrict__ out,           // [num_q_heads, head_dim]
    int cur_seq_len,                  // pos + 1
    int num_q_heads,
    int num_kv_heads,
    int head_dim,
    int max_ctx
) {
    int q_head = blockIdx.x;
    if (q_head >= num_q_heads) return;

    int gqa_ratio = num_q_heads / num_kv_heads;
    int kv_head = q_head / gqa_ratio;
    float scale = rsqrtf((float)head_dim);

    const half* q_vec = q + q_head * head_dim;

    extern __shared__ float s_mem[];
    float* scores = s_mem; // size: cur_seq_len
    float* s_warp_buf = s_mem + cur_seq_len; // size: 32

    // 1. Compute dot-product with cached K
    for (int t = threadIdx.x; t < cur_seq_len; t += blockDim.x) {
        const half* k_vec = k_cache + ((size_t)t * num_kv_heads + kv_head) * head_dim;
        float dot = 0.0f;
        #pragma unroll
        for (int d = 0; d < head_dim; ++d) {
            dot += __half2float(q_vec[d]) * __half2float(k_vec[d]);
        }
        scores[t] = dot * scale;
    }
    __syncthreads();

    // 2. Softmax: max reduction across block
    float thread_max = -1e30f;
    for (int t = threadIdx.x; t < cur_seq_len; t += blockDim.x) {
        thread_max = fmaxf(thread_max, scores[t]);
    }
    float block_max = block_reduce_max(thread_max, s_warp_buf);

    __shared__ float s_max_val;
    if (threadIdx.x == 0) {
        s_max_val = block_max;
    }
    __syncthreads();
    block_max = s_max_val;

    // Sum reduction
    float thread_sum = 0.0f;
    for (int t = threadIdx.x; t < cur_seq_len; t += blockDim.x) {
        float exp_val = __expf(scores[t] - block_max);
        scores[t] = exp_val;
        thread_sum += exp_val;
    }
    float block_sum = block_reduce_sum(thread_sum, s_warp_buf);

    __shared__ float s_inv_sum;
    if (threadIdx.x == 0) {
        s_inv_sum = 1.0f / (block_sum + 1e-12f);
    }
    __syncthreads();
    float inv_sum = s_inv_sum;

    // 3. Weighted sum of V
    half* out_head = out + q_head * head_dim;
    for (int d = threadIdx.x; d < head_dim; d += blockDim.x) {
        float weighted_v = 0.0f;
        for (int t = 0; t < cur_seq_len; ++t) {
            const half* v_vec = v_cache + ((size_t)t * num_kv_heads + kv_head) * head_dim;
            weighted_v += (scores[t] * inv_sum) * __half2float(v_vec[d]);
        }
        out_head[d] = __float2half(weighted_v);
    }
}

extern "C" {

void launch_decode_attention(
    const half* q,
    const half* k_cache,
    const half* v_cache,
    half* out,
    int cur_seq_len,
    int num_q_heads,
    int num_kv_heads,
    int head_dim,
    int max_ctx,
    cudaStream_t stream
) {
    int threads = 256;
    size_t shmem_bytes = (cur_seq_len + 32) * sizeof(float);
    decode_attention_kernel<<<num_q_heads, threads, shmem_bytes, stream>>>(
        q, k_cache, v_cache, out, cur_seq_len, num_q_heads, num_kv_heads, head_dim, max_ctx
    );
}

} // extern "C"
