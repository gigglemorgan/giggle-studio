"""Loader to instantiate ReferenceCausalLM from a GGUF file.

Extracts architecture metadata, dequantizes quantized weights (Q4_K, Q6_K, Q8_0, etc.)
to FP32, and binds them into PyTorch parameters.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import gguf
import torch

from engine.reference.model import ModelConfig, ReferenceCausalLM

logger = logging.getLogger("giggle_engine.loader")


def get_field_val(reader: gguf.GGUFReader, key: str, default: Any = None) -> Any:
    """Extract a metadata field value from GGUFReader."""
    field = reader.get_field(key)
    if field is None:
        return default
    val = field.parts[-1]
    if isinstance(val, (bytes, bytearray)):
        return bytes(val).decode("utf-8", errors="replace")
    if hasattr(val, "dtype") and str(val.dtype).startswith("uint8"):
        try:
            return bytes(val).decode("utf-8", errors="replace")
        except Exception:
            pass
    if hasattr(val, "__len__") and len(val) == 1:
        return val[0]
    return val


def parse_model_config(reader: gguf.GGUFReader) -> ModelConfig:
    """Parse GGUF metadata into a ModelConfig instance."""
    arch = get_field_val(reader, "general.architecture", "qwen2")

    hidden_size = int(get_field_val(reader, f"{arch}.embedding_length", 896))
    num_heads = int(get_field_val(reader, f"{arch}.attention.head_count", 14))
    num_kv_heads = int(get_field_val(reader, f"{arch}.attention.head_count_kv", num_heads))
    intermediate_size = int(get_field_val(reader, f"{arch}.feed_forward_length", 4864))
    num_layers = int(get_field_val(reader, f"{arch}.block_count", 24))

    # Calculate or get head_dim
    head_dim = hidden_size // num_heads

    # Norm epsilon
    rms_eps = float(get_field_val(reader, f"{arch}.attention.layer_norm_rms_epsilon", 1e-6))

    # RoPE freq base
    rope_base = float(get_field_val(reader, f"{arch}.rope.freq_base", 1000000.0))

    # Context length
    ctx_len = int(get_field_val(reader, f"{arch}.context_length", 32768))

    # Check for QKV bias by checking if blk.0.attn_q.bias is in tensors
    tensor_names = {t.name for t in reader.tensors}
    has_qkv_bias = "blk.0.attn_q.bias" in tensor_names

    # Vocab size from token_embd.weight shape
    vocab_size = 151936
    for t in reader.tensors:
        if t.name == "token_embd.weight":
            vocab_size = int(t.shape[1] if len(t.shape) > 1 else t.shape[0])
            break

    return ModelConfig(
        architecture=arch,
        hidden_size=hidden_size,
        intermediate_size=intermediate_size,
        num_attention_heads=num_heads,
        num_key_value_heads=num_kv_heads,
        head_dim=head_dim,
        num_hidden_layers=num_layers,
        vocab_size=vocab_size,
        rms_norm_eps=rms_eps,
        rope_freq_base=rope_base,
        max_position_embeddings=ctx_len,
        has_qkv_bias=has_qkv_bias,
    )


def load_tensor_data(tensor: gguf.ReaderTensor) -> torch.Tensor:
    """Dequantize or copy tensor data into a float32 PyTorch tensor."""
    # tensor_type: 0 is F32, 1 is F16
    if tensor.tensor_type == 0:
        arr = tensor.data.astype("float32")
    elif tensor.tensor_type == 1:
        arr = tensor.data.astype("float16").astype("float32")
    else:
        # Quantized type (Q4_K, Q6_K, Q8_0, etc.)
        arr = gguf.quants.dequantize(tensor.data, tensor.tensor_type).astype("float32")

    return torch.from_numpy(arr)


def load_reference_model(
    model_path: str | Path,
    device: str = "cpu",
    dtype: torch.dtype = torch.float32,
    limit_layers: int | None = None,
) -> tuple[ReferenceCausalLM, ModelConfig]:
    """Load a GGUF file into the pure PyTorch ReferenceCausalLM model.

    Args:
        model_path: Path to the .gguf model file.
        device: PyTorch device ('cpu' or 'cuda').
        dtype: Desired parameter dtype.
        limit_layers: If set, only loads up to N layers (useful for testing).

    Returns:
        (model, config)
    """
    path = Path(model_path)
    if not path.is_file():
        raise FileNotFoundError(f"GGUF model file not found: {path}")

    reader = gguf.GGUFReader(str(path))
    config = parse_model_config(reader)

    if limit_layers is not None:
        config.num_hidden_layers = min(config.num_hidden_layers, limit_layers)

    model = ReferenceCausalLM(config)

    # Index tensors by name
    tensor_map = {t.name: t for t in reader.tensors}

    # Load Embeddings
    if "token_embd.weight" in tensor_map:
        data = load_tensor_data(tensor_map["token_embd.weight"])
        model.token_embd.weight.data.copy_(data.to(dtype))

    # Load Layers
    for i in range(config.num_hidden_layers):
        layer = model.layers[i]

        # Norms
        attn_norm_key = f"blk.{i}.attn_norm.weight"
        if attn_norm_key in tensor_map:
            layer.attn_norm.weight.data.copy_(
                load_tensor_data(tensor_map[attn_norm_key]).to(dtype)
            )

        ffn_norm_key = f"blk.{i}.ffn_norm.weight"
        if ffn_norm_key in tensor_map:
            layer.ffn_norm.weight.data.copy_(load_tensor_data(tensor_map[ffn_norm_key]).to(dtype))

        # Attention weights
        q_weight_key = f"blk.{i}.attn_q.weight"
        if q_weight_key in tensor_map:
            layer.attn.q_proj.weight.data.copy_(
                load_tensor_data(tensor_map[q_weight_key]).to(dtype)
            )

        k_weight_key = f"blk.{i}.attn_k.weight"
        if k_weight_key in tensor_map:
            layer.attn.k_proj.weight.data.copy_(
                load_tensor_data(tensor_map[k_weight_key]).to(dtype)
            )

        v_weight_key = f"blk.{i}.attn_v.weight"
        if v_weight_key in tensor_map:
            layer.attn.v_proj.weight.data.copy_(
                load_tensor_data(tensor_map[v_weight_key]).to(dtype)
            )

        o_weight_key = f"blk.{i}.attn_output.weight"
        if o_weight_key in tensor_map:
            layer.attn.o_proj.weight.data.copy_(
                load_tensor_data(tensor_map[o_weight_key]).to(dtype)
            )

        # Attention biases (if present)
        if config.has_qkv_bias:
            q_bias_key = f"blk.{i}.attn_q.bias"
            if q_bias_key in tensor_map and layer.attn.q_proj.bias is not None:
                layer.attn.q_proj.bias.data.copy_(
                    load_tensor_data(tensor_map[q_bias_key]).to(dtype)
                )

            k_bias_key = f"blk.{i}.attn_k.bias"
            if k_bias_key in tensor_map and layer.attn.k_proj.bias is not None:
                layer.attn.k_proj.bias.data.copy_(
                    load_tensor_data(tensor_map[k_bias_key]).to(dtype)
                )

            v_bias_key = f"blk.{i}.attn_v.bias"
            if v_bias_key in tensor_map and layer.attn.v_proj.bias is not None:
                layer.attn.v_proj.bias.data.copy_(
                    load_tensor_data(tensor_map[v_bias_key]).to(dtype)
                )

        # MLP weights
        gate_key = f"blk.{i}.ffn_gate.weight"
        if gate_key in tensor_map:
            layer.mlp.gate_proj.weight.data.copy_(load_tensor_data(tensor_map[gate_key]).to(dtype))

        up_key = f"blk.{i}.ffn_up.weight"
        if up_key in tensor_map:
            layer.mlp.up_proj.weight.data.copy_(load_tensor_data(tensor_map[up_key]).to(dtype))

        down_key = f"blk.{i}.ffn_down.weight"
        if down_key in tensor_map:
            layer.mlp.down_proj.weight.data.copy_(load_tensor_data(tensor_map[down_key]).to(dtype))

    # Output norm
    if "output_norm.weight" in tensor_map:
        model.output_norm.weight.data.copy_(
            load_tensor_data(tensor_map["output_norm.weight"]).to(dtype)
        )

    # LM Head (output.weight or tied to token_embd.weight)
    if "output.weight" in tensor_map:
        model.output.weight.data.copy_(load_tensor_data(tensor_map["output.weight"]).to(dtype))
    else:
        model.output.weight.data.copy_(model.token_embd.weight.data)

    model.to(device=device, dtype=dtype)
    model.eval()
    return model, config
