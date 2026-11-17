"""Pure PyTorch Reference Implementation of Qwen2 / Llama 3 Decoder-Only Architecture.

Used as mathematical ground truth for logits parity tests against llama.cpp and giggle-engine.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F  # noqa: N812


@dataclass
class ModelConfig:
    """Model hyperparameters for decoder-only LLMs."""

    architecture: str = "qwen2"
    hidden_size: int = 896
    intermediate_size: int = 4864
    num_attention_heads: int = 14
    num_key_value_heads: int = 2
    head_dim: int = 64
    num_hidden_layers: int = 24
    vocab_size: int = 151936
    rms_norm_eps: float = 1e-6
    rope_freq_base: float = 1000000.0
    max_position_embeddings: int = 32768
    has_qkv_bias: bool = True  # True for Qwen2, False for Llama 3

    @property
    def num_queries_per_kv(self) -> int:
        return self.num_attention_heads // self.num_key_value_heads


class RMSNorm(nn.Module):
    """Root Mean Square Layer Normalization."""

    def __init__(self, dim: int, eps: float = 1e-6) -> None:
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        variance = x.pow(2).mean(dim=-1, keepdim=True)
        normed = x * torch.rsqrt(variance + self.eps)
        return normed * self.weight


def rotate_half(x: torch.Tensor) -> torch.Tensor:
    """Rotates half the hidden dims of the input."""
    half = x.shape[-1] // 2
    x1 = x[..., :half]
    x2 = x[..., half:]
    return torch.cat((-x2, x1), dim=-1)


class RotaryEmbedding(nn.Module):
    """Rotary Positional Embeddings (RoPE) matching Qwen2 and Llama 3."""

    def __init__(self, dim: int, max_seq_len: int = 32768, freq_base: float = 10000.0) -> None:
        super().__init__()
        self.dim = dim
        self.max_seq_len = max_seq_len
        self.freq_base = freq_base

        dim_indices = torch.arange(0, dim, 2, dtype=torch.float32)
        inv_freq = 1.0 / (freq_base ** (dim_indices / dim))
        self.register_buffer("inv_freq", inv_freq, persistent=False)

    def forward(self, x: torch.Tensor, pos_offset: int = 0) -> torch.Tensor:
        # x shape: [batch, num_heads, seq_len, head_dim]
        seq_len = x.shape[-2]
        device = x.device
        positions = torch.arange(
            pos_offset, pos_offset + seq_len, dtype=torch.float32, device=device
        )
        inv_freq = self.inv_freq.to(device)

        # angles shape: [seq_len, dim // 2]
        angles = torch.outer(positions, inv_freq)
        emb = torch.cat((angles, angles), dim=-1)
        cos = emb.cos().unsqueeze(0).unsqueeze(0)  # [1, 1, seq_len, head_dim]
        sin = emb.sin().unsqueeze(0).unsqueeze(0)

        return (x * cos) + (rotate_half(x) * sin)


def repeat_kv(x: torch.Tensor, n_rep: int) -> torch.Tensor:
    """Repeat Key/Value heads across Query heads for Grouped Query Attention."""
    if n_rep == 1:
        return x
    batch, n_kv_heads, seq_len, head_dim = x.shape
    x = x[:, :, None, :, :].expand(batch, n_kv_heads, n_rep, seq_len, head_dim)
    return x.reshape(batch, n_kv_heads * n_rep, seq_len, head_dim)


class CausalSelfAttention(nn.Module):
    """Grouped-Query Attention (GQA) with RoPE and optional QKV bias."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.config = config
        self.hidden_size = config.hidden_size
        self.num_heads = config.num_attention_heads
        self.num_kv_heads = config.num_key_value_heads
        self.head_dim = config.head_dim
        self.num_queries_per_kv = config.num_queries_per_kv

        q_dim = self.num_heads * self.head_dim
        kv_dim = self.num_kv_heads * self.head_dim

        self.q_proj = nn.Linear(self.hidden_size, q_dim, bias=config.has_qkv_bias)
        self.k_proj = nn.Linear(self.hidden_size, kv_dim, bias=config.has_qkv_bias)
        self.v_proj = nn.Linear(self.hidden_size, kv_dim, bias=config.has_qkv_bias)
        self.o_proj = nn.Linear(q_dim, self.hidden_size, bias=False)

        self.rotary_emb = RotaryEmbedding(
            dim=self.head_dim,
            max_seq_len=config.max_position_embeddings,
            freq_base=config.rope_freq_base,
        )

    def forward(
        self,
        x: torch.Tensor,
        pos_offset: int = 0,
        mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        batch, seq_len, _ = x.shape

        q = self.q_proj(x)
        k = self.k_proj(x)
        v = self.v_proj(x)

        # Reshape to [batch, num_heads, seq_len, head_dim]
        q = q.view(batch, seq_len, self.num_heads, self.head_dim).transpose(1, 2)
        k = k.view(batch, seq_len, self.num_kv_heads, self.head_dim).transpose(1, 2)
        v = v.view(batch, seq_len, self.num_kv_heads, self.head_dim).transpose(1, 2)

        # Apply RoPE
        q = self.rotary_emb(q, pos_offset=pos_offset)
        k = self.rotary_emb(k, pos_offset=pos_offset)

        # Repeat KV for GQA
        k = repeat_kv(k, self.num_queries_per_kv)
        v = repeat_kv(v, self.num_queries_per_kv)

        # Scaled dot-product attention
        scale = 1.0 / math.sqrt(self.head_dim)
        scores = torch.matmul(q, k.transpose(-2, -1)) * scale

        if mask is not None:
            scores = scores + mask
        elif seq_len > 1:
            causal_mask = torch.triu(
                torch.full((seq_len, seq_len), float("-inf"), device=x.device), diagonal=1
            )
            scores = scores + causal_mask

        probs = F.softmax(scores, dim=-1, dtype=torch.float32).to(x.dtype)
        attn_out = torch.matmul(probs, v)

        # Reshape back to [batch, seq_len, hidden_size]
        attn_out = attn_out.transpose(1, 2).contiguous().view(batch, seq_len, -1)
        return self.o_proj(attn_out)


class SwiGLUMLP(nn.Module):
    """Feed-Forward Network with SwiGLU activation (gate, up, down)."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.gate_proj = nn.Linear(config.hidden_size, config.intermediate_size, bias=False)
        self.up_proj = nn.Linear(config.hidden_size, config.intermediate_size, bias=False)
        self.down_proj = nn.Linear(config.intermediate_size, config.hidden_size, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # SwiGLU: down_proj(silu(gate_proj(x)) * up_proj(x))
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


class DecoderLayer(nn.Module):
    """Single transformer decoder block with pre-RMSNorm and residual connections."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.attn_norm = RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.attn = CausalSelfAttention(config)
        self.ffn_norm = RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.mlp = SwiGLUMLP(config)

    def forward(
        self,
        x: torch.Tensor,
        pos_offset: int = 0,
        mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        # Pre-norm Self-Attention with residual
        h = x + self.attn(self.attn_norm(x), pos_offset=pos_offset, mask=mask)
        # Pre-norm MLP with residual
        out = h + self.mlp(self.ffn_norm(h))
        return out


class ReferenceCausalLM(nn.Module):
    """Complete Decoder-Only Model matching Qwen2 and Llama 3 architectures."""

    def __init__(self, config: ModelConfig) -> None:
        super().__init__()
        self.config = config
        self.token_embd = nn.Embedding(config.vocab_size, config.hidden_size)
        self.layers = nn.ModuleList([DecoderLayer(config) for _ in range(config.num_hidden_layers)])
        self.output_norm = RMSNorm(config.hidden_size, eps=config.rms_norm_eps)
        self.output = nn.Linear(config.hidden_size, config.vocab_size, bias=False)

    def forward(
        self,
        input_ids: torch.Tensor,
        pos_offset: int = 0,
        mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        # input_ids shape: [batch, seq_len]
        h = self.token_embd(input_ids)

        for layer in self.layers:
            h = layer(h, pos_offset=pos_offset, mask=mask)

        h = self.output_norm(h)
        logits = self.output(h)
        return logits
