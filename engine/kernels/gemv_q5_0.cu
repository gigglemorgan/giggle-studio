#include "giggle_cuda_common.cuh"

#define QK5_0 32

struct __align__(2) block_q5_0 {
    half d;
    uint8_t qh[4];
    uint8_t qs[QK5_0 / 2];
};

// GEMV for Q5_0 weights and FP16 activations (batch=1 decode)
__global__ void gemv_q5_0_kernel(
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

    int num_blocks = K / QK5_0;
    const block_q5_0* row_blocks = ((const block_q5_0*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;

    for (int b = 0; b < num_blocks; b += 2) {
        int b_idx = b + (lane / 16);
        int j = lane % 16;

        float d = 0.0f;
        float prod = 0.0f;

        if (b_idx < num_blocks) {
            d = __half2float(row_blocks[b_idx].d);

            uint32_t qh;
            memcpy(&qh, row_blocks[b_idx].qh, sizeof(uint32_t));

            uint8_t xh_0 = ((qh >> (j +  0)) << 4) & 0x10;
            uint8_t xh_1 = ((qh >> (j + 12))     ) & 0x10;

            int32_t x0 = ((row_blocks[b_idx].qs[j] & 0x0F) | xh_0) - 16;
            int32_t x1 = ((row_blocks[b_idx].qs[j] >>   4) | xh_1) - 16;

            float x0_val = __half2float(x[b_idx * QK5_0 + j]);
            float x1_val = __half2float(x[b_idx * QK5_0 + j + 16]);

            prod = d * ((float)x0 * x0_val + (float)x1 * x1_val);
        }

        acc += warp_reduce_sum(prod);
    }

    if (lane == 0) {
        if (bias) acc += __half2float(bias[warp_id]);
        if (residual) acc += __half2float(residual[warp_id]);
        y[warp_id] = __float2half(acc);
    }
}

// GEMV for Q5_0 weights writing directly to FP32 logits
__global__ void gemv_q5_0_f32_kernel(
    const void* __restrict__ W_blocks,
    const half* __restrict__ x,
    float* __restrict__ y,
    int M,
    int K
) {
    int warp_id = (blockIdx.x * blockDim.x + threadIdx.x) / WARP_SIZE;
    int lane = threadIdx.x % WARP_SIZE;

    if (warp_id >= M) return;

    int num_blocks = K / QK5_0;
    const block_q5_0* row_blocks = ((const block_q5_0*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;

    for (int b = 0; b < num_blocks; b += 2) {
        int b_idx = b + (lane / 16);
        int j = lane % 16;

        float d = 0.0f;
        float prod = 0.0f;

        if (b_idx < num_blocks) {
            d = __half2float(row_blocks[b_idx].d);

            uint32_t qh;
            memcpy(&qh, row_blocks[b_idx].qh, sizeof(uint32_t));

            uint8_t xh_0 = ((qh >> (j +  0)) << 4) & 0x10;
            uint8_t xh_1 = ((qh >> (j + 12))     ) & 0x10;

            int32_t x0 = ((row_blocks[b_idx].qs[j] & 0x0F) | xh_0) - 16;
            int32_t x1 = ((row_blocks[b_idx].qs[j] >>   4) | xh_1) - 16;

            float x0_val = __half2float(x[b_idx * QK5_0 + j]);
            float x1_val = __half2float(x[b_idx * QK5_0 + j + 16]);

            prod = d * ((float)x0 * x0_val + (float)x1 * x1_val);
        }

        acc += warp_reduce_sum(prod);
    }

    if (lane == 0) {
        y[warp_id] = acc;
    }
}

extern "C" {

void launch_gemv_q5_0(
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

    gemv_q5_0_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, bias, residual, y, M, K
    );
}

void launch_gemv_q5_0_f32(
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

    gemv_q5_0_f32_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, y, M, K
    );
}

} // extern "C"
