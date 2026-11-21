#include "giggle_engine.h"
#include "giggle_cuda_common.cuh"
#include <vector>
#include <string>
#include <cstring>
#include <cstdio>
#include <iostream>

// Kernel declarations
extern "C" {
void launch_rmsnorm_fp16(const half* input, const half* weight, half* output, int batch_size, int hidden_size, float eps, cudaStream_t stream);
void launch_rope(half* q, half* k, const half* v, half* k_cache, half* v_cache, int pos, int num_q_heads, int num_kv_heads, int head_dim, float freq_base, cudaStream_t stream);
void launch_swiglu(const half* gate, const half* up, half* output, int total_elements, cudaStream_t stream);

void launch_gemv_f16(const half* W, const half* x, const half* bias, const half* residual, half* y, int M, int K, cudaStream_t stream);
void launch_gemv_f16_f32(const half* W, const half* x, float* y, int M, int K, cudaStream_t stream);

void launch_gemv_q5_0(const void* W_blocks, const half* x, const half* bias, const half* residual, half* y, int M, int K, cudaStream_t stream);
void launch_gemv_q5_0_f32(const void* W_blocks, const half* x, float* y, int M, int K, cudaStream_t stream);

void launch_gemv_q8_0(const void* W_blocks, const half* x, const half* bias, const half* residual, half* y, int M, int K, cudaStream_t stream);
void launch_gemv_q8_0_f32(const void* W_blocks, const half* x, float* y, int M, int K, cudaStream_t stream);

void launch_gemv_q4_k(const void* W_blocks, const half* x, const half* bias, const half* residual, half* y, int M, int K, cudaStream_t stream);
void launch_gemv_q4_k_f32(const void* W_blocks, const half* x, float* y, int M, int K, cudaStream_t stream);

void launch_gemv_q6_k(const void* W_blocks, const half* x, const half* bias, const half* residual, half* y, int M, int K, cudaStream_t stream);

void launch_decode_attention(const half* q, const half* k_cache, const half* v_cache, half* out, int cur_seq_len, int num_q_heads, int num_kv_heads, int head_dim, int max_ctx, cudaStream_t stream);
int launch_greedy_sample(const float* d_logits, int* d_out_token, int vocab_size, cudaStream_t stream);
}

struct TensorWeight {
    void* d_ptr = nullptr;
    int32_t type = 1; // 1 = F16, 6 = Q4_K, 8 = Q8_0, 14 = Q6_K
    int32_t M = 0;
    int32_t K = 0;
    size_t bytes = 0;
};

struct LayerWeights {
    half* d_attn_norm = nullptr;
    TensorWeight q_weight;
    half* d_q_bias = nullptr;
    TensorWeight k_weight;
    half* d_k_bias = nullptr;
    TensorWeight v_weight;
    half* d_v_bias = nullptr;
    TensorWeight o_weight;

    half* d_ffn_norm = nullptr;
    TensorWeight gate_weight;
    TensorWeight up_weight;
    TensorWeight down_weight;
};

struct GiggleModel {
    giggle_config_t config;
    cudaStream_t stream = nullptr;

    // Up-front unified scratch buffer and KV cache
    half* d_kv_k = nullptr;
    half* d_kv_v = nullptr;

    // Activations
    half* d_act_x = nullptr;
    half* d_act_norm = nullptr;
    half* d_act_q = nullptr;
    half* d_act_k = nullptr;
    half* d_act_v = nullptr;
    half* d_act_attn_out = nullptr;
    half* d_act_gate = nullptr;
    half* d_act_up = nullptr;
    half* d_act_mlp_out = nullptr;
    float* d_logits = nullptr;
    int* d_sample_out = nullptr;

    // Weights
    half* d_token_embd = nullptr;
    half* d_output_norm = nullptr;
    TensorWeight output_weight;
    std::vector<LayerWeights> layers;

    std::vector<void*> allocated_ptrs;
    size_t total_vram = 0;
};

static void dispatch_gemv(
    const TensorWeight& w,
    const half* x,
    const half* bias,
    const half* residual,
    half* y,
    cudaStream_t stream
) {
    if (!w.d_ptr) return;
    if (w.type == 1) { // F16
        launch_gemv_f16((const half*)w.d_ptr, x, bias, residual, y, w.M, w.K, stream);
    } else if (w.type == 6) { // Q5_0
        launch_gemv_q5_0(w.d_ptr, x, bias, residual, y, w.M, w.K, stream);
    } else if (w.type == 8) { // Q8_0
        launch_gemv_q8_0(w.d_ptr, x, bias, residual, y, w.M, w.K, stream);
    } else if (w.type == 12) { // Q4_K
        launch_gemv_q4_k(w.d_ptr, x, bias, residual, y, w.M, w.K, stream);
    } else if (w.type == 14) { // Q6_K
        launch_gemv_q6_k(w.d_ptr, x, bias, residual, y, w.M, w.K, stream);
    } else {
        launch_gemv_f16((const half*)w.d_ptr, x, bias, residual, y, w.M, w.K, stream);
    }
}

static void dispatch_gemv_f32(
    const TensorWeight& w,
    const half* x,
    float* y,
    cudaStream_t stream
) {
    if (!w.d_ptr) return;
    if (w.type == 1) {
        launch_gemv_f16_f32((const half*)w.d_ptr, x, y, w.M, w.K, stream);
    } else if (w.type == 6) {
        launch_gemv_q5_0_f32(w.d_ptr, x, y, w.M, w.K, stream);
    } else if (w.type == 8) {
        launch_gemv_q8_0_f32(w.d_ptr, x, y, w.M, w.K, stream);
    } else if (w.type == 12) {
        launch_gemv_q4_k_f32(w.d_ptr, x, y, w.M, w.K, stream);
    } else {
        launch_gemv_f16_f32((const half*)w.d_ptr, x, y, w.M, w.K, stream);
    }
}

extern "C" {

giggle_model_handle_t giggle_create_model(
    const giggle_config_t* config,
    int32_t max_seq_len
) {
    if (!config) return nullptr;

    auto* model = new GiggleModel();
    model->config = *config;
    if (max_seq_len > 0) {
        model->config.max_seq_len = max_seq_len;
    }

    CUDA_CHECK(cudaStreamCreate(&model->stream));

    int hidden = model->config.hidden_size;
    int inter = model->config.intermediate_size;
    int max_ctx = model->config.max_seq_len;
    int num_q_heads = model->config.num_attention_heads;
    int num_kv_heads = model->config.num_key_value_heads;
    int head_dim = model->config.head_dim;
    int layers = model->config.num_hidden_layers;

    // 1. Allocate KV cache
    size_t kv_size = (size_t)layers * max_ctx * num_kv_heads * head_dim * sizeof(half);
    CUDA_CHECK(cudaMalloc(&model->d_kv_k, kv_size));
    CUDA_CHECK(cudaMalloc(&model->d_kv_v, kv_size));
    model->allocated_ptrs.push_back(model->d_kv_k);
    model->allocated_ptrs.push_back(model->d_kv_v);
    CUDA_CHECK(cudaMemsetAsync(model->d_kv_k, 0, kv_size, model->stream));
    CUDA_CHECK(cudaMemsetAsync(model->d_kv_v, 0, kv_size, model->stream));
    model->total_vram += 2 * kv_size;

    // 2. Allocate Activation Buffers (reused across all layers)
    CUDA_CHECK(cudaMalloc(&model->d_act_x, hidden * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_norm, hidden * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_q, num_q_heads * head_dim * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_k, num_kv_heads * head_dim * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_v, num_kv_heads * head_dim * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_attn_out, hidden * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_gate, inter * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_up, inter * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_act_mlp_out, hidden * sizeof(half)));
    CUDA_CHECK(cudaMalloc(&model->d_logits, model->config.vocab_size * sizeof(float)));
    CUDA_CHECK(cudaMalloc(&model->d_sample_out, sizeof(int)));

    model->allocated_ptrs.push_back(model->d_act_x);
    model->allocated_ptrs.push_back(model->d_act_norm);
    model->allocated_ptrs.push_back(model->d_act_q);
    model->allocated_ptrs.push_back(model->d_act_k);
    model->allocated_ptrs.push_back(model->d_act_v);
    model->allocated_ptrs.push_back(model->d_act_attn_out);
    model->allocated_ptrs.push_back(model->d_act_gate);
    model->allocated_ptrs.push_back(model->d_act_up);
    model->allocated_ptrs.push_back(model->d_act_mlp_out);
    model->allocated_ptrs.push_back(model->d_logits);
    model->allocated_ptrs.push_back(model->d_sample_out);

    size_t act_vram = (hidden * 3 + num_q_heads * head_dim + num_kv_heads * head_dim * 2 + inter * 2) * sizeof(half)
                    + model->config.vocab_size * sizeof(float) + sizeof(int);
    model->total_vram += act_vram;

    // 3. Initialize layers
    model->layers.resize(layers);

    CUDA_CHECK(cudaStreamSynchronize(model->stream));
    return (giggle_model_handle_t)model;
}

static void* upload_tensor_to_device(
    GiggleModel* model,
    int32_t tensor_type,
    const void* host_data,
    size_t data_bytes,
    size_t num_elements,
    bool force_f16 = false
) {
    if (!host_data) return nullptr;

    void* d_ptr = nullptr;
    if (force_f16 && tensor_type == 0) { // Host is F32, convert to F16
        size_t f16_bytes = num_elements * sizeof(half);
        std::vector<half> temp(num_elements);
        const float* src = (const float*)host_data;
        for (size_t i = 0; i < num_elements; ++i) {
            temp[i] = __float2half(src[i]);
        }
        CUDA_CHECK(cudaMalloc(&d_ptr, f16_bytes));
        CUDA_CHECK(cudaMemcpyAsync(d_ptr, temp.data(), f16_bytes, cudaMemcpyHostToDevice, model->stream));
        model->total_vram += f16_bytes;
    } else {
        CUDA_CHECK(cudaMalloc(&d_ptr, data_bytes));
        CUDA_CHECK(cudaMemcpyAsync(d_ptr, host_data, data_bytes, cudaMemcpyHostToDevice, model->stream));
        model->total_vram += data_bytes;
    }
    model->allocated_ptrs.push_back(d_ptr);
    return d_ptr;
}

bool giggle_set_tensor(
    giggle_model_handle_t handle,
    const char* tensor_name,
    int32_t tensor_type,
    const void* host_data,
    size_t data_bytes,
    const int64_t* shape,
    int32_t n_dims
) {
    if (!handle || !tensor_name || !host_data) return false;
    auto* model = (GiggleModel*)handle;

    std::string name(tensor_name);

    // Compute dimensions
    int32_t M = 1, K = 1;
    size_t num_elements = 1;
    for (int i = 0; i < n_dims; ++i) {
        num_elements *= (size_t)shape[i];
    }
    if (n_dims >= 2) {
        // GGUF stores 2D matrix shape as [K, M] in metadata, which corresponds to [M, K] in memory
        K = (int32_t)shape[0];
        M = (int32_t)shape[1];
    } else if (n_dims == 1) {
        M = (int32_t)shape[0];
        K = 1;
    }

    if (name == "token_embd.weight") {
        model->d_token_embd = (half*)upload_tensor_to_device(
            model, tensor_type, host_data, data_bytes, num_elements, true
        );
        return true;
    }
    if (name == "output_norm.weight") {
        model->d_output_norm = (half*)upload_tensor_to_device(
            model, tensor_type, host_data, data_bytes, num_elements, true
        );
        return true;
    }
    if (name == "output.weight") {
        model->output_weight.d_ptr = upload_tensor_to_device(
            model, tensor_type, host_data, data_bytes, num_elements, false
        );
        model->output_weight.type = tensor_type;
        model->output_weight.M = M;
        model->output_weight.K = K;
        model->output_weight.bytes = data_bytes;
        return true;
    }

    // Check layer tensors: "blk.{L}.{subname}"
    if (name.rfind("blk.", 0) == 0) {
        size_t dot1 = 4;
        size_t dot2 = name.find('.', dot1);
        if (dot2 != std::string::npos) {
            int layer_idx = std::stoi(name.substr(dot1, dot2 - dot1));
            if (layer_idx < 0 || layer_idx >= (int)model->layers.size()) return false;

            std::string sub = name.substr(dot2 + 1);
            auto& l = model->layers[layer_idx];

            if (sub == "attn_norm.weight") {
                l.d_attn_norm = (half*)upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, true);
                return true;
            }
            if (sub == "attn_q.weight") {
                l.q_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.q_weight.type = tensor_type;
                l.q_weight.M = M;
                l.q_weight.K = K;
                l.q_weight.bytes = data_bytes;
                return true;
            }
            if (sub == "attn_q.bias") {
                l.d_q_bias = (half*)upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, true);
                return true;
            }
            if (sub == "attn_k.weight") {
                l.k_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.k_weight.type = tensor_type;
                l.k_weight.M = M;
                l.k_weight.K = K;
                l.k_weight.bytes = data_bytes;
                return true;
            }
            if (sub == "attn_k.bias") {
                l.d_k_bias = (half*)upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, true);
                return true;
            }
            if (sub == "attn_v.weight") {
                l.v_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.v_weight.type = tensor_type;
                l.v_weight.M = M;
                l.v_weight.K = K;
                l.v_weight.bytes = data_bytes;
                return true;
            }
            if (sub == "attn_v.bias") {
                l.d_v_bias = (half*)upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, true);
                return true;
            }
            if (sub == "attn_output.weight") {
                l.o_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.o_weight.type = tensor_type;
                l.o_weight.M = M;
                l.o_weight.K = K;
                l.o_weight.bytes = data_bytes;
                return true;
            }
            if (sub == "ffn_norm.weight") {
                l.d_ffn_norm = (half*)upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, true);
                return true;
            }
            if (sub == "ffn_gate.weight") {
                l.gate_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.gate_weight.type = tensor_type;
                l.gate_weight.M = M;
                l.gate_weight.K = K;
                l.gate_weight.bytes = data_bytes;
                return true;
            }
            if (sub == "ffn_up.weight") {
                l.up_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.up_weight.type = tensor_type;
                l.up_weight.M = M;
                l.up_weight.K = K;
                l.up_weight.bytes = data_bytes;
                return true;
            }
            if (sub == "ffn_down.weight") {
                l.down_weight.d_ptr = upload_tensor_to_device(model, tensor_type, host_data, data_bytes, num_elements, false);
                l.down_weight.type = tensor_type;
                l.down_weight.M = M;
                l.down_weight.K = K;
                l.down_weight.bytes = data_bytes;
                return true;
            }
        }
    }

    return false;
}

bool giggle_finalize_model(giggle_model_handle_t handle) {
    if (!handle) return false;
    auto* model = (GiggleModel*)handle;

    // Handle tied output weight (if output.weight is not provided, tie to token_embd)
    if (!model->output_weight.d_ptr && model->d_token_embd) {
        model->output_weight.d_ptr = model->d_token_embd;
        model->output_weight.type = 1; // F16
        model->output_weight.M = model->config.vocab_size;
        model->output_weight.K = model->config.hidden_size;
    }

    CUDA_CHECK(cudaStreamSynchronize(model->stream));
    return true;
}

void giggle_reset_kv_cache(giggle_model_handle_t handle) {
    if (!handle) return;
    auto* model = (GiggleModel*)handle;
    size_t kv_size = (size_t)model->config.num_hidden_layers * model->config.max_seq_len *
                     model->config.num_key_value_heads * model->config.head_dim * sizeof(half);
    CUDA_CHECK(cudaMemsetAsync(model->d_kv_k, 0, kv_size, model->stream));
    CUDA_CHECK(cudaMemsetAsync(model->d_kv_v, 0, kv_size, model->stream));
    CUDA_CHECK(cudaStreamSynchronize(model->stream));
}

void giggle_free_model(giggle_model_handle_t handle) {
    if (!handle) return;
    auto* model = (GiggleModel*)handle;

    if (model->stream) {
        cudaStreamSynchronize(model->stream);
    }

    for (void* ptr : model->allocated_ptrs) {
        if (ptr) cudaFree(ptr);
    }
    model->allocated_ptrs.clear();

    if (model->stream) {
        cudaStreamDestroy(model->stream);
        model->stream = nullptr;
    }

    delete model;
}

bool giggle_get_config(giggle_model_handle_t handle, giggle_config_t* out_config) {
    if (!handle || !out_config) return false;
    auto* model = (GiggleModel*)handle;
    *out_config = model->config;
    return true;
}

size_t giggle_get_vram_usage(giggle_model_handle_t handle) {
    if (!handle) return 0;
    auto* model = (GiggleModel*)handle;
    return model->total_vram;
}

bool giggle_prefill(
    giggle_model_handle_t handle,
    const int32_t* tokens,
    int32_t n_tokens,
    float* out_logits
) {
    if (!handle || !tokens || n_tokens <= 0) return false;

    for (int t = 0; t < n_tokens; ++t) {
        giggle_decode_step(handle, tokens[t], t, (t == n_tokens - 1) ? out_logits : nullptr);
    }
    return true;
}

int32_t giggle_decode_step(
    giggle_model_handle_t handle,
    int32_t token_id,
    int32_t pos,
    float* out_logits
) {
    if (!handle) return 0;
    auto* model = (GiggleModel*)handle;

    int hidden = model->config.hidden_size;
    int inter = model->config.intermediate_size;
    int max_ctx = model->config.max_seq_len;
    int num_q_heads = model->config.num_attention_heads;
    int num_kv_heads = model->config.num_key_value_heads;
    int head_dim = model->config.head_dim;
    float eps = model->config.rms_norm_eps;
    float rope_base = model->config.rope_freq_base;
    cudaStream_t st = model->stream;

    // 1. Embedding lookup: x_0 = token_embd[token_id]
    if (model->d_token_embd) {
        CUDA_CHECK(cudaMemcpyAsync(
            model->d_act_x,
            model->d_token_embd + (size_t)token_id * hidden,
            hidden * sizeof(half),
            cudaMemcpyDeviceToDevice,
            st
        ));
    }

    // 2. Transformer layers
    for (int l = 0; l < model->config.num_hidden_layers; ++l) {
        auto& layer = model->layers[l];

        // 2a. Pre-attention RMSNorm
        launch_rmsnorm_fp16(
            model->d_act_x,
            layer.d_attn_norm,
            model->d_act_norm,
            1, hidden, eps, st
        );

        // 2b. Q, K, V projections
        dispatch_gemv(layer.q_weight, model->d_act_norm, layer.d_q_bias, nullptr, model->d_act_q, st);
        dispatch_gemv(layer.k_weight, model->d_act_norm, layer.d_k_bias, nullptr, model->d_act_k, st);
        dispatch_gemv(layer.v_weight, model->d_act_norm, layer.d_v_bias, nullptr, model->d_act_v, st);

        // 2c. RoPE + write K and V into KV cache
        half* layer_k_cache = model->d_kv_k + (size_t)l * max_ctx * num_kv_heads * head_dim;
        half* layer_v_cache = model->d_kv_v + (size_t)l * max_ctx * num_kv_heads * head_dim;

        launch_rope(
            model->d_act_q,
            model->d_act_k,
            model->d_act_v,
            layer_k_cache,
            layer_v_cache,
            pos,
            num_q_heads,
            num_kv_heads,
            head_dim,
            rope_base,
            st
        );

        // 2d. Decode Attention (GQA)
        launch_decode_attention(
            model->d_act_q,
            layer_k_cache,
            layer_v_cache,
            model->d_act_attn_out,
            pos + 1,
            num_q_heads,
            num_kv_heads,
            head_dim,
            max_ctx,
            st
        );

        // 2e. Output projection + Residual addition: d_act_x += attn_out @ W_o
        dispatch_gemv(layer.o_weight, model->d_act_attn_out, nullptr, model->d_act_x, model->d_act_x, st);

        // 2f. Pre-FFN RMSNorm
        launch_rmsnorm_fp16(
            model->d_act_x,
            layer.d_ffn_norm,
            model->d_act_norm,
            1, hidden, eps, st
        );

        // 2g. Gate and Up projections
        dispatch_gemv(layer.gate_weight, model->d_act_norm, nullptr, nullptr, model->d_act_gate, st);
        dispatch_gemv(layer.up_weight, model->d_act_norm, nullptr, nullptr, model->d_act_up, st);

        // 2h. SwiGLU activation
        launch_swiglu(
            model->d_act_gate,
            model->d_act_up,
            model->d_act_mlp_out,
            inter,
            st
        );

        // 2i. Down projection + Residual addition: d_act_x += mlp_out @ W_down
        dispatch_gemv(layer.down_weight, model->d_act_mlp_out, nullptr, model->d_act_x, model->d_act_x, st);
    }

    // 3. Final Output Norm
    launch_rmsnorm_fp16(
        model->d_act_x,
        model->d_output_norm,
        model->d_act_norm,
        1, hidden, eps, st
    );

    // 4. LM Head projection to FP32 logits
    dispatch_gemv_f32(
        model->output_weight,
        model->d_act_norm,
        model->d_logits,
        st
    );

    // 5. Greedy sampling on GPU
    int next_token = launch_greedy_sample(
        model->d_logits,
        model->d_sample_out,
        model->config.vocab_size,
        st
    );

    // 6. Copy logits if requested
    if (out_logits) {
        CUDA_CHECK(cudaMemcpyAsync(
            out_logits,
            model->d_logits,
            model->config.vocab_size * sizeof(float),
            cudaMemcpyDeviceToHost,
            st
        ));
        CUDA_CHECK(cudaStreamSynchronize(st));
    }

    return next_token;
}

} // extern "C"
