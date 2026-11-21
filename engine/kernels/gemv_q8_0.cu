#include "giggle_cuda_common.cuh"

#define QK8_0 32

struct block_q8_0 {
    half d;
    int8_t qs[QK8_0];
};

// GEMV for Q8_0 weights and FP16 activations (batch=1 decode)
__global__ void gemv_q8_0_kernel(
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

    int num_blocks = K / QK8_0;
    const block_q8_0* row_blocks = ((const block_q8_0*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;
    for (int b = 0; b < num_blocks; ++b) {
        float d = __half2float(row_blocks[b].d);
        float q = (float)row_blocks[b].qs[lane];
        float x_val = __half2float(x[b * QK8_0 + lane]);
        float prod = q * x_val;
        prod = warp_reduce_sum(prod);
        if (lane == 0) {
            acc += d * prod;
        }
    }

    if (lane == 0) {
        if (bias) acc += __half2float(bias[warp_id]);
        if (residual) acc += __half2float(residual[warp_id]);
        y[warp_id] = __float2half(acc);
    }
}

// GEMV for Q8_0 weights writing directly to FP32 logits
__global__ void gemv_q8_0_f32_kernel(
    const void* __restrict__ W_blocks,
    const half* __restrict__ x,
    float* __restrict__ y,
    int M,
    int K
) {
    int warp_id = (blockIdx.x * blockDim.x + threadIdx.x) / WARP_SIZE;
    int lane = threadIdx.x % WARP_SIZE;

    if (warp_id >= M) return;

    int num_blocks = K / QK8_0;
    const block_q8_0* row_blocks = ((const block_q8_0*)W_blocks) + (size_t)warp_id * num_blocks;

    float acc = 0.0f;
    for (int b = 0; b < num_blocks; ++b) {
        float d = __half2float(row_blocks[b].d);
        float q = (float)row_blocks[b].qs[lane];
        float x_val = __half2float(x[b * QK8_0 + lane]);
        float prod = q * x_val;
        prod = warp_reduce_sum(prod);
        if (lane == 0) {
            acc += d * prod;
        }
    }

    if (lane == 0) {
        y[warp_id] = acc;
    }
}

extern "C" {

void launch_gemv_q8_0(
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

    gemv_q8_0_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, bias, residual, y, M, K
    );
}

void launch_gemv_q8_0_f32(
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

    gemv_q8_0_f32_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W_blocks, x, y, M, K
    );
}

} // extern "C"
