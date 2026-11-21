#include "giggle_cuda_common.cuh"

#define QK_K 256

struct block_q4_K {
    half d;
    half dmin;
    uint8_t scales[12];
    uint8_t qs[QK_K / 2];
};

__device__ __forceinline__ void get_scale_min_k4(
    int j,
    const uint8_t* q,
    uint8_t* d,
    uint8_t* m
) {
    if (j < 4) {
        *d = q[j] & 63;
        *m = q[j + 4] & 63;
    } else {
        *d = (q[j + 4] & 0xF) | ((q[j - 4] >> 6) << 4);
        *m = (q[j + 4] >> 4) | ((q[j] >> 6) << 4);
    }
}

// GEMV for Q4_K_M weights and FP16 activations (batch=1 decode)
__global__ void gemv_q4_k_kernel(
    const void* __restrict__ W_blocks,
    const half* __restrict__ x,
    const half* __restrict__ bias,
    const half* __restrict__ residual,
    half* __restrict__ y,
    int M,
    int K
) {
    int warp_id = (blockIdx.x * blockDim.x + threadIdx.x) / WARP_SIZE;
    int lane = threadIdx.x % WARP_SIZE;

    if (warp_id >= M) return;

    int num_blocks = K / QK_K;
    const block_q4_K* row_blocks = ((const block_q4_K*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;

    for (int b = 0; b < num_blocks; ++b) {
        float d = __half2float(row_blocks[b].d);
        float dmin = __half2float(row_blocks[b].dmin);
        const uint8_t* scales = row_blocks[b].scales;
        const uint8_t* q_base = row_blocks[b].qs;

        int block_x_offset = b * QK_K;

        #pragma unroll
        for (int j = 0; j < 4; ++j) {
            int is = j * 2;
            uint8_t sc1, m1, sc2, m2;
            get_scale_min_k4(is + 0, scales, &sc1, &m1);
            get_scale_min_k4(is + 1, scales, &sc2, &m2);

            float d1 = d * (float)sc1;
            float min1 = dmin * (float)m1;
            float d2 = d * (float)sc2;
            float min2 = dmin * (float)m2;

            const uint8_t* q = q_base + j * 32;
            int x_offset = block_x_offset + j * 64;

            uint8_t q_byte = q[lane];
            float w1 = d1 * (float)(q_byte & 0x0F) - min1;
            float w2 = d2 * (float)(q_byte >> 4) - min2;

            float x1 = __half2float(x[x_offset + lane]);
            float x2 = __half2float(x[x_offset + 32 + lane]);

            float prod = w1 * x1 + w2 * x2;
            prod = warp_reduce_sum(prod);
            if (lane == 0) {
                acc += prod;
            }
        }
    }

    if (lane == 0) {
        if (bias) acc += __half2float(bias[warp_id]);
        if (residual) acc += __half2float(residual[warp_id]);
        y[warp_id] = __float2half(acc);
    }
}

// GEMV for Q4_K_M weights writing directly to FP32 logits
__global__ void gemv_q4_k_f32_kernel(
    const void* __restrict__ W_blocks,
    const half* __restrict__ x,
    float* __restrict__ y,
    int M,
    int K
) {
    int warp_id = (blockIdx.x * blockDim.x + threadIdx.x) / WARP_SIZE;
    int lane = threadIdx.x % WARP_SIZE;

    if (warp_id >= M) return;

    int num_blocks = K / QK_K;
    const block_q4_K* row_blocks = ((const block_q4_K*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;

    for (int b = 0; b < num_blocks; ++b) {
        float d = __half2float(row_blocks[b].d);
        float dmin = __half2float(row_blocks[b].dmin);
        const uint8_t* scales = row_blocks[b].scales;
        const uint8_t* q_base = row_blocks[b].qs;

        int block_x_offset = b * QK_K;

        #pragma unroll
        for (int j = 0; j < 4; ++j) {
            int is = j * 2;
            uint8_t sc1, m1, sc2, m2;
            get_scale_min_k4(is + 0, scales, &sc1, &m1);
            get_scale_min_k4(is + 1, scales, &sc2, &m2);

            float d1 = d * (float)sc1;
            float min1 = dmin * (float)m1;
            float d2 = d * (float)sc2;
            float min2 = dmin * (float)m2;

            const uint8_t* q = q_base + j * 32;
            int x_offset = block_x_offset + j * 64;

            uint8_t q_byte = q[lane];
            float w1 = d1 * (float)(q_byte & 0x0F) - min1;
            float w2 = d2 * (float)(q_byte >> 4) - min2;

            float x1 = __half2float(x[x_offset + lane]);
            float x2 = __half2float(x[x_offset + 32 + lane]);

            float prod = w1 * x1 + w2 * x2;
            prod = warp_reduce_sum(prod);
            if (lane == 0) {
                acc += prod;
            }
        }
    }

    if (lane == 0) {
        y[warp_id] = acc;
    }
}

extern "C" {

void launch_gemv_q4_k(
    const void* W_blocks,
    const half* x,
    const half* bias,
    const half* residual,
    half* y,
    int M,
    int K,
    cudaStream_t stream
) {
    int threads_per_block = 256;
    int warps_per_block = threads_per_block / WARP_SIZE;
    int num_blocks = (M + warps_per_block - 1) / warps_per_block;

    gemv_q4_k_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, bias, residual, y, M, K
    );
}

void launch_gemv_q4_k_f32(
    const void* W_blocks,
    const half* x,
    float* y,
    int M,
    int K,
    cudaStream_t stream
) {
    int threads_per_block = 256;
    int warps_per_block = threads_per_block / WARP_SIZE;
    int num_blocks = (M + warps_per_block - 1) / warps_per_block;

    gemv_q4_k_f32_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, y, M, K
    );
}

} // extern "C"
