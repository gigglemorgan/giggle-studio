"""Unit tests for the logits comparison and perplexity calculation utilities."""

import numpy as np
import pytest

from engine.tools.compare_logits import compare_logits, compute_perplexity


def test_compare_logits_identical() -> None:
    # 5 tokens, 100 vocab
    logits = np.random.randn(5, 100).astype(np.float32)
    res = compare_logits(logits, logits, tolerance_max_abs=1e-5, tolerance_top1=0.99)

    assert res.passed
    assert res.max_abs_diff < 1e-5
    assert res.mean_abs_diff < 1e-5
    assert np.isclose(res.cosine_similarity, 1.0)
    assert np.isclose(res.top1_agreement, 1.0)
    assert np.isclose(res.top5_agreement, 1.0)
    assert np.isclose(res.top10_agreement, 1.0)


def test_compare_logits_small_perturbation() -> None:
    np.random.seed(42)
    logits_a = np.random.randn(10, 50).astype(np.float32) * 5.0
    # Add tiny perturbation
    logits_b = logits_a + np.random.randn(10, 50).astype(np.float32) * 0.01

    res = compare_logits(logits_a, logits_b, tolerance_max_abs=0.1, tolerance_top1=0.90)
    assert res.passed
    assert res.max_abs_diff < 0.1
    assert res.cosine_similarity > 0.99
    assert res.top1_agreement >= 0.90


def test_compare_logits_shape_mismatch() -> None:
    l1 = np.zeros((4, 20))
    l2 = np.zeros((5, 20))
    with pytest.raises(ValueError, match="Shape mismatch"):
        compare_logits(l1, l2)


def test_compute_perplexity() -> None:
    # Deterministic logits where token 2 is always predicted with high confidence
    seq_len = 5
    vocab_size = 10
    logits = np.zeros((seq_len, vocab_size), dtype=np.float32)
    logits[:, 2] = 20.0  # token 2 gets ~1.0 probability

    tokens = [0, 2, 2, 2, 2]
    ppl = compute_perplexity(logits, tokens)
    # Perplexity should be very close to 1.0
    assert 1.0 <= ppl < 1.05
