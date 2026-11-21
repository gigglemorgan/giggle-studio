#pragma once

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

typedef struct {
    char architecture[32];
    int32_t hidden_size;
    int32_t intermediate_size;
    int32_t num_attention_heads;
    int32_t num_key_value_heads;
    int32_t head_dim;
    int32_t num_hidden_layers;
    int32_t vocab_size;
    float rms_norm_eps;
    float rope_freq_base;
    int32_t max_seq_len;
    bool has_qkv_bias;
    char quant_type[16]; // "F16", "Q8_0", "Q4_K_M"
} giggle_config_t;

typedef void* giggle_model_handle_t;

/**
 * Create a new model instance with configuration and allocate KV cache and scratch buffers.
 */
giggle_model_handle_t giggle_create_model(
    const giggle_config_t* config,
    int32_t max_seq_len
);

/**
 * Register a tensor weight or bias from host memory into GPU memory pool.
 * tensor_type: 0=F32, 1=F16, 6=Q4_K, 8=Q8_0, 14=Q6_K
 */
bool giggle_set_tensor(
    giggle_model_handle_t handle,
    const char* tensor_name,
    int32_t tensor_type,
    const void* host_data,
    size_t data_bytes,
    const int64_t* shape,
    int32_t n_dims
);

/**
 * Finalize model setup, bind tied weights if needed, and verify readiness.
 */
bool giggle_finalize_model(giggle_model_handle_t handle);

/**
 * Free GPU memory pool, KV cache, and model weights.
 */
void giggle_free_model(giggle_model_handle_t handle);

/**
 * Query model configuration.
 */
bool giggle_get_config(giggle_model_handle_t handle, giggle_config_t* out_config);

/**
 * Reset KV cache to position 0.
 */
void giggle_reset_kv_cache(giggle_model_handle_t handle);

/**
 * Prefill pass: evaluates prompt tokens and populates KV cache.
 * If out_logits is non-NULL, writes last token FP32 logits [vocab_size].
 */
bool giggle_prefill(
    giggle_model_handle_t handle,
    const int32_t* tokens,
    int32_t n_tokens,
    float* out_logits
);

/**
 * Decode step: single token autoregressive step (batch=1).
 * If out_logits is non-NULL, writes output FP32 logits [vocab_size].
 * Returns predicted greedy token ID.
 */
int32_t giggle_decode_step(
    giggle_model_handle_t handle,
    int32_t token_id,
    int32_t pos,
    float* out_logits
);

/**
 * Get current GPU memory allocation in bytes for this model.
 */
size_t giggle_get_vram_usage(giggle_model_handle_t handle);

#ifdef __cplusplus
}
#endif
