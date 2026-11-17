"""Unit tests for the PyTorch reference decoder-only architecture."""

import pytest
import torch

from engine.reference.model import (
    CausalSelfAttention,
    DecoderLayer,
    ModelConfig,
    ReferenceCausalLM,
    RMSNorm,
    RotaryEmbedding,
    SwiGLUMLP,
    repeat_kv,
)


@pytest.fixture
def small_config() -> ModelConfig:
    return ModelConfig(
        architecture="qwen2",
        hidden_size=128,
        intermediate_size=256,
        num_attention_heads=4,
        num_key_value_heads=2,
        head_dim=32,
        num_hidden_layers=2,
        vocab_size=1000,
        rms_norm_eps=1e-6,
        rope_freq_base=10000.0,
        max_position_embeddings=512,
        has_qkv_bias=True,
    )


def test_rmsnorm_math() -> None:
    dim = 64
    norm = RMSNorm(dim=dim, eps=1e-6)
    x = torch.randn(2, 8, dim)
    out = norm(x)

    # Output shape check
    assert out.shape == x.shape

    # Manual RMSNorm calculation
    rms = torch.sqrt(torch.mean(x**2, dim=-1, keepdim=True) + 1e-6)
    expected = (x / rms) * norm.weight
    assert torch.allclose(out, expected, atol=1e-5)


def test_rotary_embedding_norm_preservation() -> None:
    """RoPE is an orthogonal rotation; it must preserve vector Euclidean L2 norm."""
    dim = 32
    rope = RotaryEmbedding(dim=dim, freq_base=10000.0)
    x = torch.randn(1, 2, 8, dim)  # [batch, heads, seq, dim]

    norm_before = torch.norm(x, p=2, dim=-1)
    x_rot = rope(x, pos_offset=5)
    norm_after = torch.norm(x_rot, p=2, dim=-1)

    assert torch.allclose(norm_before, norm_after, atol=1e-5)


def test_repeat_kv() -> None:
    batch, n_kv, seq_len, head_dim = 2, 2, 4, 32
    x = torch.randn(batch, n_kv, seq_len, head_dim)
    n_rep = 3

    repeated = repeat_kv(x, n_rep)
    assert repeated.shape == (batch, n_kv * n_rep, seq_len, head_dim)
    # Check that replicas match
    for rep in range(n_rep):
        assert torch.allclose(repeated[:, 0 * n_rep + rep], x[:, 0])
        assert torch.allclose(repeated[:, 1 * n_rep + rep], x[:, 1])


def test_causal_masking_in_attention(small_config: ModelConfig) -> None:
    """Future tokens must not influence past token representations."""
    attn = CausalSelfAttention(small_config)
    attn.eval()

    x = torch.randn(1, 4, small_config.hidden_size)
    with torch.no_grad():
        out1 = attn(x)

        # Mutate the last token
        x_mutated = x.clone()
        x_mutated[0, 3] += 10.0
        out2 = attn(x_mutated)

    # First 3 tokens must be completely unchanged by token 4 mutation
    assert torch.allclose(out1[0, :3], out2[0, :3], atol=1e-5)
    # 4th token must differ
    assert not torch.allclose(out1[0, 3], out2[0, 3], atol=1e-2)


def test_swiglu_mlp_shape(small_config: ModelConfig) -> None:
    mlp = SwiGLUMLP(small_config)
    x = torch.randn(2, 6, small_config.hidden_size)
    out = mlp(x)
    assert out.shape == x.shape


def test_decoder_layer_forward(small_config: ModelConfig) -> None:
    layer = DecoderLayer(small_config)
    x = torch.randn(1, 5, small_config.hidden_size)
    out = layer(x)
    assert out.shape == x.shape


def test_reference_model_logits_shape(small_config: ModelConfig) -> None:
    model = ReferenceCausalLM(small_config)
    model.eval()

    input_ids = torch.randint(0, small_config.vocab_size, (2, 8))
    with torch.no_grad():
        logits = model(input_ids)

    assert logits.shape == (2, 8, small_config.vocab_size)
    assert not torch.isnan(logits).any()
    assert not torch.isinf(logits).any()
