#include "giggle_cuda_common.cuh"

struct ArgMaxPair {
    float val;
    int idx;
};

__device__ __forceinline__ ArgMaxPair warp_reduce_argmax(ArgMaxPair p) {
    #pragma unroll
    for (int offset = WARP_SIZE / 2; offset > 0; offset /= 2) {
        float other_val = __shfl_down_sync(0xffffffff, p.val, offset);
        int other_idx = __shfl_down_sync(0xffffffff, p.idx, offset);
        if (other_val > p.val) {
            p.val = other_val;
            p.idx = other_idx;
        }
    }
    return p;
}

__global__ void argmax_kernel(
    const float* __restrict__ logits,
    int* __restrict__ out_token,
    int vocab_size
) {
    ArgMaxPair best = {-1e30f, 0};

    for (int i = threadIdx.x; i < vocab_size; i += blockDim.x) {
        float l = logits[i];
        if (l > best.val) {
            best.val = l;
            best.idx = i;
        }
    }

    __shared__ ArgMaxPair s_mem[32];
    best = warp_reduce_argmax(best);

    int lane = threadIdx.x % WARP_SIZE;
    int wid = threadIdx.x / WARP_SIZE;
    if (lane == 0) {
        s_mem[wid] = best;
    }
    __syncthreads();

    ArgMaxPair block_best = {-1e30f, 0};
    int num_warps = blockDim.x / WARP_SIZE;
    if (threadIdx.x < num_warps) {
        block_best = s_mem[threadIdx.x];
    }
    block_best = warp_reduce_argmax(block_best);

    if (threadIdx.x == 0) {
        *out_token = block_best.idx;
    }
}

extern "C" {

int launch_greedy_sample(
    const float* d_logits,
    int* d_out_token,
    int vocab_size,
    cudaStream_t stream
) {
    int threads = 512;
    argmax_kernel<<<1, threads, 0, stream>>>(d_logits, d_out_token, vocab_size);

    int h_token = 0;
    CUDA_CHECK(cudaMemcpyAsync(&h_token, d_out_token, sizeof(int), cudaMemcpyDeviceToHost, stream));
    CUDA_CHECK(cudaStreamSynchronize(stream));
    return h_token;
}

} // extern "C"
