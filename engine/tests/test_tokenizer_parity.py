"""Unit test wrapper for tokenizer parity verification."""

from pathlib import Path

import pytest

from engine.tools.verify_tokenizer import verify_tokenizer_parity

MODEL_PATH = Path("data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf")


def test_tokenizer_parity_on_corpus() -> None:
    if not MODEL_PATH.is_file():
        pytest.skip(f"Model file {MODEL_PATH} not present")

    success = verify_tokenizer_parity(MODEL_PATH)
    assert success is True
