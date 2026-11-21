#include "giggle_cuda_common.cuh"

// GEMV for FP16 weights and FP16 activations (batch=1 decode)
// Matrix W is [M, K] in row-major layout, x is [K], y is [M]
// Optional bias [M], optional residual [M]
__global__ void gemv_f16_kernel(
    const half* __restrict__ W,
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

    const half* row = W + (size_t)warp_id * K;

    float acc = 0.0f;
    for (int k = lane; k < K; k += WARP_SIZE) {
        float w_val = __half2float(row[k]);
        float x_val = __half2float(x[k]);
        acc += w_val * x_val;
    }

    acc = warp_reduce_sum(acc);

    if (lane == 0) {
        if (bias) {
            acc += __half2float(bias[warp_id]);
        }
        if (residual) {
            acc += __half2float(residual[warp_id]);
        }
        y[warp_id] = __float2half(acc);
    }
}

// GEMV writing directly to FP32 output (for LM head / logits)
__global__ void gemv_f16_f32_kernel(
    const half* __restrict__ W,
    const half* __restrict__ x,
    float* __restrict__ y,
    int M,
    int K
) {
    int warp_id = (blockIdx.x * blockDim.x + threadIdx.x) / WARP_SIZE;
    int lane = threadIdx.x % WARP_SIZE;

    if (warp_id >= M) return;

    const half* row = W + (size_t)warp_id * K;

    float acc = 0.0f;
    for (int k = lane; k < K; k += WARP_SIZE) {
        float w_val = __half2float(row[k]);
        float x_val = __half2float(x[k]);
        acc += w_val * x_val;
    }

    acc = warp_reduce_sum(acc);

    if (lane == 0) {
        y[warp_id] = acc;
    }
}

extern "C" {

void launch_gemv_f16(
    const half* W,
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

    gemv_f16_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W, x, bias, residual, y, M, K
    );
}

void launch_gemv_f16_f32(
    const half* W,
    const half* x,
    float* y,
    int M,
    int K,
    cudaStream_t stream
) {
    int threads_per_block = 256;
    int warps_per_block = threads_per_block / WARP_SIZE;
    int num_blocks = (M + warps_per_block - 1) / warps_per_block;

    gemv_f16_f32_kernel<<<num_blocks, threads_per_block, 0, stream>>>(
        W, x, y, M, K
    );
}

} // extern "C"
