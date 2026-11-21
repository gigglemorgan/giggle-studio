#include "giggle_cuda_common.cuh"

__global__ void swiglu_kernel(
    const half* __restrict__ gate,
    const half* __restrict__ up,
    half* __restrict__ output,
    int total_elements
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < total_elements) {
        float g = __half2float(gate[idx]);
        float u = __half2float(up[idx]);
        // silu(g) * u = (g / (1.0f + expf(-g))) * u
        float silu_g = g / (1.0f + __expf(-g));
        output[idx] = __float2half(silu_g * u);
    }
}

extern "C" {

void launch_swiglu(
    const half* gate,
    const half* up,
    half* output,
    int total_elements,
    cudaStream_t stream
) {
    int threads = 256;
    int blocks = (total_elements + threads - 1) / threads;
    swiglu_kernel<<<blocks, threads, 0, stream>>>(gate, up, output, total_elements);
}

} // extern "C"
