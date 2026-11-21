#pragma once

#include <cuda_runtime.h>
#include <cuda_fp16.h>
#include <cstdint>
#include <stdint.h>
#include <cstdio>
#include <cstdlib>
#include <cmath>

#define CUDA_CHECK(call)                                                      \
    do {                                                                      \
        cudaError_t err = call;                                               \
        if (err != cudaSuccess) {                                             \
            fprintf(stderr, "CUDA error at %s:%d: %s\n", __FILE__, __LINE__,  \
                    cudaGetErrorString(err));                                 \
            exit(EXIT_FAILURE);                                               \
        }                                                                     \
    } while (0)

#define WARP_SIZE 32

// Warp reduction primitives
__device__ __forceinline__ float warp_reduce_sum(float val) {
    #pragma unroll
    for (int offset = WARP_SIZE / 2; offset > 0; offset /= 2) {
        val += __shfl_down_sync(0xffffffff, val, offset);
    }
    return val;
}

__device__ __forceinline__ float warp_reduce_max(float val) {
    #pragma unroll
    for (int offset = WARP_SIZE / 2; offset > 0; offset /= 2) {
        val = fmaxf(val, __shfl_down_sync(0xffffffff, val, offset));
    }
    return val;
}

// Block reduction primitives (requires shared memory of at least 32 floats)
__device__ __forceinline__ float block_reduce_sum(float val, float* shared_mem) {
    int lane = threadIdx.x % WARP_SIZE;
    int wid = threadIdx.x / WARP_SIZE;
    val = warp_reduce_sum(val);
    if (lane == 0) {
        shared_mem[wid] = val;
    }
    __syncthreads();

    float block_sum = 0.0f;
    int num_warps = blockDim.x / WARP_SIZE;
    if (threadIdx.x < num_warps) {
        block_sum = shared_mem[threadIdx.x];
    }
    block_sum = warp_reduce_sum(block_sum);
    return block_sum;
}

__device__ __forceinline__ float block_reduce_max(float val, float* shared_mem) {
    int lane = threadIdx.x % WARP_SIZE;
    int wid = threadIdx.x / WARP_SIZE;
    val = warp_reduce_max(val);
    if (lane == 0) {
        shared_mem[wid] = val;
    }
    __syncthreads();

    float block_max = -1e30f;
    int num_warps = blockDim.x / WARP_SIZE;
    if (threadIdx.x < num_warps) {
        block_max = shared_mem[threadIdx.x];
    }
    block_max = warp_reduce_max(block_max);
    return block_max;
}
