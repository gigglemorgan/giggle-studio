#include "giggle_cuda_common.cuh"

#define QK_K 256

struct block_q6_K {
    uint8_t ql[QK_K / 2];
    uint8_t qh[QK_K / 4];
    int8_t  scales[QK_K / 16];
    half    d;
};

// GEMV for Q6_K weights and FP16 activations (batch=1 decode)
__global__ void gemv_q6_k_kernel(
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
    const block_q6_K* row_blocks = ((const block_q6_K*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;

    for (int b = 0; b < num_blocks; ++b) {
        float d = __half2float(row_blocks[b].d);
        const uint8_t* ql_base = row_blocks[b].ql;
        const uint8_t* qh_base = row_blocks[b].qh;
        const int8_t*  sc_base = row_blocks[b].scales;

        int block_x_offset = b * QK_K;

        #pragma unroll
        for (int n = 0; n < 2; ++n) {
            const uint8_t* ql = ql_base + n * 64;
            const uint8_t* qh = qh_base + n * 32;
            const int8_t*  sc = sc_base + n * 8;
            int x_offset = block_x_offset + n * 128;

            int is = lane / 16;
            int8_t q1 = (int8_t)((ql[lane +  0] & 0xF) | (((qh[lane] >> 0) & 3) << 4)) - 32;
            int8_t q2 = (int8_t)((ql[lane + 32] & 0xF) | (((qh[lane] >> 2) & 3) << 4)) - 32;
            int8_t q3 = (int8_t)((ql[lane +  0]  >> 4) | (((qh[lane] >> 4) & 3) << 4)) - 32;
            int8_t q4 = (int8_t)((ql[lane + 32]  >> 4) | (((qh[lane] >> 6) & 3) << 4)) - 32;

            float w1 = d * (float)sc[is + 0] * (float)q1;
            float w2 = d * (float)sc[is + 2] * (float)q2;
            float w3 = d * (float)sc[is + 4] * (float)q3;
            float w4 = d * (float)sc[is + 6] * (float)q4;

            float x1 = __half2float(x[x_offset + lane +  0]);
            float x2 = __half2float(x[x_offset + lane + 32]);
            float x3 = __half2float(x[x_offset + lane + 64]);
            float x4 = __half2float(x[x_offset + lane + 96]);

            float prod = w1 * x1 + w2 * x2 + w3 * x3 + w4 * x4;
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

extern "C" {

void launch_gemv_q6_k(
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

    gemv_q6_k_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, bias, residual, y, M, K
    );
}

} // extern "C"
