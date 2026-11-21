"""Python ctypes bindings and high-level loader for Giggle Engine.

Provides direct access to Giggle Engine CUDA C++ inference engine.
"""

from __future__ import annotations

import ctypes
from ctypes import (
    POINTER,
    Structure,
    c_bool,
    c_char,
    c_char_p,
    c_float,
    c_int32,
    c_int64,
    c_size_t,
    c_void_p,
)
import logging
from pathlib import Path
from typing import Any

import numpy as np
import gguf

logger = logging.getLogger("giggle_engine")

# Locate libgiggle_engine.so
LIB_PATHS = [
    Path(__file__).resolve().parent.parent / "build" / "libgiggle_engine.so",
    Path(__file__).resolve().parent.parent / "lib" / "libgiggle_engine.so",
]

_lib = None
for p in LIB_PATHS:
    if p.is_file():
        try:
            _lib = ctypes.CDLL(str(p))
            break
        except Exception as e:
            logger.warning("Failed to load libgiggle_engine from %s: %s", p, e)


class GiggleConfig(Structure):
    _fields_ = [
        ("architecture", c_char * 32),
        ("hidden_size", c_int32),
        ("intermediate_size", c_int32),
        ("num_attention_heads", c_int32),
        ("num_key_value_heads", c_int32),
        ("head_dim", c_int32),
        ("num_hidden_layers", c_int32),
        ("vocab_size", c_int32),
        ("rms_norm_eps", c_float),
        ("rope_freq_base", c_float),
        ("max_seq_len", c_int32),
        ("has_qkv_bias", c_bool),
        ("quant_type", c_char * 16),
    ]

    def to_dict(self) -> dict[str, Any]:
        return {
            "architecture": self.architecture.decode("utf-8"),
            "hidden_size": self.hidden_size,
            "intermediate_size": self.intermediate_size,
            "num_attention_heads": self.num_attention_heads,
            "num_key_value_heads": self.num_key_value_heads,
            "head_dim": self.head_dim,
            "num_hidden_layers": self.num_hidden_layers,
            "vocab_size": self.vocab_size,
            "rms_norm_eps": self.rms_norm_eps,
            "rope_freq_base": self.rope_freq_base,
            "max_seq_len": self.max_seq_len,
            "has_qkv_bias": self.has_qkv_bias,
            "quant_type": self.quant_type.decode("utf-8"),
        }


if _lib is not None:
    _lib.giggle_create_model.argtypes = [POINTER(GiggleConfig), c_int32]
    _lib.giggle_create_model.restype = c_void_p

    _lib.giggle_set_tensor.argtypes = [
        c_void_p,
        c_char_p,
        c_int32,
        c_void_p,
        c_size_t,
        POINTER(c_int64),
        c_int32,
    ]
    _lib.giggle_set_tensor.restype = c_bool

    _lib.giggle_finalize_model.argtypes = [c_void_p]
    _lib.giggle_finalize_model.restype = c_bool

    _lib.giggle_free_model.argtypes = [c_void_p]
    _lib.giggle_free_model.restype = None

    _lib.giggle_get_config.argtypes = [c_void_p, POINTER(GiggleConfig)]
    _lib.giggle_get_config.restype = c_bool

    _lib.giggle_reset_kv_cache.argtypes = [c_void_p]
    _lib.giggle_reset_kv_cache.restype = None

    _lib.giggle_prefill.argtypes = [
        c_void_p,
        POINTER(c_int32),
        c_int32,
        POINTER(c_float),
    ]
    _lib.giggle_prefill.restype = c_bool

    _lib.giggle_decode_step.argtypes = [
        c_void_p,
        c_int32,
        c_int32,
        POINTER(c_float),
    ]
    _lib.giggle_decode_step.restype = c_int32

    _lib.giggle_get_vram_usage.argtypes = [c_void_p]
    _lib.giggle_get_vram_usage.restype = c_size_t


def _get_field(reader: gguf.GGUFReader, key: str, default: Any = None) -> Any:
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


class GiggleEngine:
    """High-level Python wrapper for Giggle Engine inference."""

    def __init__(
        self,
        model_path: str | Path,
        precision: str = "f16",
        max_seq_len: int = 2048,
        limit_layers: int | None = None,
    ) -> None:
        if _lib is None:
            raise RuntimeError(
                "libgiggle_engine.so not found or failed to load. Run CMake build first."
            )

        self.model_path = Path(model_path)
        if not self.model_path.is_file():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")

        self.precision = precision.lower()
        self.max_seq_len = max_seq_len

        # Parse GGUF metadata
        reader = gguf.GGUFReader(str(self.model_path))
        arch = _get_field(reader, "general.architecture", "qwen2")

        hidden_size = int(_get_field(reader, f"{arch}.embedding_length", 896))
        num_heads = int(_get_field(reader, f"{arch}.attention.head_count", 14))
        num_kv_heads = int(_get_field(reader, f"{arch}.attention.head_count_kv", num_heads))
        intermediate_size = int(_get_field(reader, f"{arch}.feed_forward_length", 4864))
        num_layers = int(_get_field(reader, f"{arch}.block_count", 24))
        head_dim = hidden_size // num_heads

        rms_eps = float(_get_field(reader, f"{arch}.attention.layer_norm_rms_epsilon", 1e-6))
        rope_base = float(_get_field(reader, f"{arch}.rope.freq_base", 1000000.0))

        if limit_layers is not None:
            num_layers = min(num_layers, limit_layers)

        # Check for QKV bias
        tensor_names = {t.name for t in reader.tensors}
        has_qkv_bias = "blk.0.attn_q.bias" in tensor_names

        # Vocab size
        vocab_size = 151936
        for t in reader.tensors:
            if t.name == "token_embd.weight":
                vocab_size = int(t.shape[1] if len(t.shape) > 1 else t.shape[0])
                break

        cfg = GiggleConfig()
        cfg.architecture = arch.encode("utf-8")
        cfg.hidden_size = hidden_size
        cfg.intermediate_size = intermediate_size
        cfg.num_attention_heads = num_heads
        cfg.num_key_value_heads = num_kv_heads
        cfg.head_dim = head_dim
        cfg.num_hidden_layers = num_layers
        cfg.vocab_size = vocab_size
        cfg.rms_norm_eps = rms_eps
        cfg.rope_freq_base = rope_base
        cfg.max_seq_len = max_seq_len
        cfg.has_qkv_bias = has_qkv_bias
        cfg.quant_type = precision.upper().encode("utf-8")

        self._handle = _lib.giggle_create_model(ctypes.byref(cfg), max_seq_len)
        if not self._handle:
            raise RuntimeError(f"Failed to create model in Giggle Engine: {self.model_path}")

        self.config = cfg.to_dict()

        # Load tensors into device memory pool
        self._load_tensors(reader, num_layers)

        # Finalize setup
        ok = _lib.giggle_finalize_model(self._handle)
        if not ok:
            raise RuntimeError("Failed to finalize Giggle Engine model setup")

    def _load_tensors(self, reader: gguf.GGUFReader, num_layers: int) -> None:
        """Upload all model tensors to the unified GPU pool."""
        keep_data_alive = []

        for t in reader.tensors:
            name = t.name

            # Skip tensors from layers beyond limit_layers
            if name.startswith("blk."):
                parts = name.split(".")
                if len(parts) > 1 and parts[1].isdigit():
                    l_idx = int(parts[1])
                    if l_idx >= num_layers:
                        continue

            t_type = int(t.tensor_type)
            shape = list(t.shape)
            shape_arr = (c_int64 * len(shape))(*shape)

            if self.precision == "f16":
                # Dequantize everything to float16
                if t_type == 0:  # F32
                    data_f16 = np.ascontiguousarray(t.data.astype(np.float16))
                elif t_type == 1:  # F16
                    data_f16 = np.ascontiguousarray(t.data)
                else:
                    deq = gguf.quants.dequantize(t.data, t.tensor_type)
                    data_f16 = np.ascontiguousarray(deq.astype(np.float16))

                keep_data_alive.append(data_f16)
                data_ptr = data_f16.ctypes.data
                data_bytes = data_f16.nbytes
                actual_type = 1  # F16
            else:
                # Native quantization mode (Q4_K, Q8_0, Q6_K, etc.)
                if name == "token_embd.weight" or t_type in (0, 1):
                    # Keep embeddings, norms and biases in FP16 for zero-overhead
                    if t_type == 0:
                        data_f16 = np.ascontiguousarray(t.data.astype(np.float16))
                    elif t_type == 1:
                        data_f16 = np.ascontiguousarray(t.data)
                    else:
                        deq = gguf.quants.dequantize(t.data, t.tensor_type)
                        data_f16 = np.ascontiguousarray(deq.astype(np.float16))
                    keep_data_alive.append(data_f16)
                    data_ptr = data_f16.ctypes.data
                    data_bytes = data_f16.nbytes
                    actual_type = 1
                elif t_type in (6, 8, 12, 14):
                    # Native supported types: Q5_0 (6), Q8_0 (8), Q4_K (12), Q6_K (14)
                    raw_data = np.ascontiguousarray(t.data)
                    keep_data_alive.append(raw_data)
                    data_ptr = raw_data.ctypes.data
                    data_bytes = raw_data.nbytes
                    actual_type = t_type
                else:
                    # Fallback dequantize unsupported quant types (e.g. Q5_K) to FP16
                    deq = gguf.quants.dequantize(t.data, t.tensor_type)
                    data_f16 = np.ascontiguousarray(deq.astype(np.float16))
                    keep_data_alive.append(data_f16)
                    data_ptr = data_f16.ctypes.data
                    data_bytes = data_f16.nbytes
                    actual_type = 1

            _lib.giggle_set_tensor(
                self._handle,
                name.encode("utf-8"),
                c_int32(actual_type),
                c_void_p(data_ptr),
                c_size_t(data_bytes),
                shape_arr,
                c_int32(len(shape)),
            )

    def __del__(self) -> None:
        self.close()

    def close(self) -> None:
        if hasattr(self, "_handle") and self._handle:
            _lib.giggle_free_model(self._handle)
            self._handle = None

    @property
    def vram_usage_bytes(self) -> int:
        if not self._handle:
            return 0
        return int(_lib.giggle_get_vram_usage(self._handle))

    def reset_kv_cache(self) -> None:
        if not self._handle:
            raise RuntimeError("Model is closed")
        _lib.giggle_reset_kv_cache(self._handle)

    def prefill(self, tokens: list[int], return_logits: bool = False) -> np.ndarray | None:
        if not self._handle:
            raise RuntimeError("Model is closed")
        arr = (c_int32 * len(tokens))(*tokens)
        out_logits = None
        logits_ptr = None
        if return_logits:
            out_logits = np.zeros(self.config["vocab_size"], dtype=np.float32)
            logits_ptr = out_logits.ctypes.data_as(POINTER(c_float))

        ok = _lib.giggle_prefill(self._handle, arr, len(tokens), logits_ptr)
        if not ok:
            raise RuntimeError("Prefill failed")
        return out_logits

    def decode_step(
        self, token_id: int, pos: int, return_logits: bool = False
    ) -> tuple[int, np.ndarray | None]:
        if not self._handle:
            raise RuntimeError("Model is closed")

        out_logits = None
        logits_ptr = None
        if return_logits:
            out_logits = np.zeros(self.config["vocab_size"], dtype=np.float32)
            logits_ptr = out_logits.ctypes.data_as(POINTER(c_float))

        next_tok = _lib.giggle_decode_step(
            self._handle, c_int32(token_id), c_int32(pos), logits_ptr
        )
        return int(next_tok), out_logits

    def generate(self, prompt_tokens: list[int], max_new_tokens: int = 128) -> list[int]:
        """Generate tokens autoregressively from a prompt."""
        if not prompt_tokens:
            return []

        self.reset_kv_cache()
        # Prefill prompt
        self.prefill(prompt_tokens)

        # Autoregressive decode
        generated = []
        cur_pos = len(prompt_tokens)
        cur_token = prompt_tokens[-1]

        for _ in range(max_new_tokens):
            next_tok, _ = self.decode_step(cur_token, cur_pos - 1)
            generated.append(next_tok)
            cur_token = next_tok
            cur_pos += 1

        return generated
