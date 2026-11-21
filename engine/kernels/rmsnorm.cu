#include "giggle_cuda_common.cuh"

// RMSNorm kernel: handles FP16 activations and FP16 weights
__global__ void rmsnorm_fp16_kernel(
    const half* __restrict__ input,
    const half* __restrict__ weight,
    half* __restrict__ output,
    int hidden_size,
    float eps
) {
    int row = blockIdx.x;
    const half* row_in = input + (size_t)row * hidden_size;
    half* row_out = output + (size_t)row * hidden_size;

    float sum_sq = 0.0f;
    for (int i = threadIdx.x; i < hidden_size; i += blockDim.x) {
        float val = __half2float(row_in[i]);
        sum_sq += val * val;
    }

    __shared__ float s_warp_sums[32];
    float total_sum = block_reduce_sum(sum_sq, s_warp_sums);

    __shared__ float rsqrt_scale;
    if (threadIdx.x == 0) {
        rsqrt_scale = rsqrtf((total_sum / (float)hidden_size) + eps);
    }
    __syncthreads();

    float r = rsqrt_scale;
    for (int i = threadIdx.x; i < hidden_size; i += blockDim.x) {
        float val = __half2float(row_in[i]);
        float w = __half2float(weight[i]);
        row_out[i] = __float2half(val * r * w);
    }
}

extern "C" {

void launch_rmsnorm_fp16(
    const half* input,
    const half* weight,
    half* output,
    int batch_size,
    int hidden_size,
    float eps,
    cudaStream_t stream
) {
    int threads = 256;
    if (hidden_size > 2048) threads = 512;
    rmsnorm_fp16_kernel<<<batch_size, threads, 0, stream>>>(
        input, weight, output, hidden_size, eps
    );
}

} // extern "C"
