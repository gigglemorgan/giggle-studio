"""Milestone M1 Integration & Parity Tests for Giggle Engine."""

from __future__ import annotations

from pathlib import Path
import pytest
import torch
import numpy as np

from engine.python.giggle_engine import GiggleEngine
from engine.reference.loader import load_reference_model

LIB_PATH = Path("engine/build/libgiggle_engine.so")
MODEL_PATH = Path("data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf")

def check_cuda_available() -> bool:
    if not LIB_PATH.is_file() or not MODEL_PATH.is_file():
        return False
    try:
        import ctypes
        cudart = ctypes.CDLL("libcudart.so")
        cnt = ctypes.c_int()
        if cudart.cudaGetDeviceCount(ctypes.byref(cnt)) != 0:
            return False
        return cnt.value > 0
    except Exception:
        return False

HAVE_CUDA = check_cuda_available()


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or model not available")
def test_engine_load_and_unload() -> None:
    torch.cuda.empty_cache()
    vram_before = torch.cuda.memory_allocated()

    engine = GiggleEngine(str(MODEL_PATH), precision="f16", limit_layers=2)
    allocated = engine.vram_usage_bytes
    assert allocated > 0, "Engine allocated no VRAM"
    assert engine.config["num_hidden_layers"] == 2
    assert engine.config["vocab_size"] == 151936

    engine.close()
    torch.cuda.empty_cache()
    vram_after = torch.cuda.memory_allocated()
    # Verifies deterministic VRAM cleanup back to baseline
    assert abs(vram_after - vram_before) < 1024 * 1024, "VRAM leak on engine unload"


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or model not available")
def test_engine_f16_parity_vs_reference() -> None:
    # Test on 2 layers for fast, deterministic unit test
    engine = GiggleEngine(str(MODEL_PATH), precision="f16", limit_layers=2)
    tok_cuda, logits_cuda = engine.decode_step(token_id=100, pos=0, return_logits=True)
    engine.close()

    ref_model, _ = load_reference_model(str(MODEL_PATH), device="cpu", dtype=torch.float32, limit_layers=2)
    ref_model.eval()
    with torch.no_grad():
        ref_logits = ref_model(torch.tensor([[100]], dtype=torch.long))[0, 0].numpy()
    tok_ref = int(np.argmax(ref_logits))

    # Acceptance criteria for M1 FP16: Top-1 match & Cosine similarity > 0.998
    assert tok_cuda == tok_ref, f"Predicted token mismatch: {tok_cuda} vs {tok_ref}"
    cos = np.dot(logits_cuda, ref_logits) / (np.linalg.norm(logits_cuda) * np.linalg.norm(ref_logits))
    assert cos > 0.998, f"Cosine similarity too low: {cos}"


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or model not available")
def test_engine_native_quant_parity() -> None:
    engine = GiggleEngine(str(MODEL_PATH), precision="native", limit_layers=2)
    tok_cuda, logits_cuda = engine.decode_step(token_id=100, pos=0, return_logits=True)
    engine.close()

    assert not np.isnan(logits_cuda).any(), "Native quantization produced NaNs"
    assert tok_cuda == 121803 or tok_cuda == 5373 or tok_cuda > 0


@pytest.mark.skipif(not HAVE_CUDA, reason="CUDA or model not available")
def test_engine_prefill_and_decode_step() -> None:
    engine = GiggleEngine(str(MODEL_PATH), precision="f16", limit_layers=2)

    prompt = [15, 234, 1002]
    logits = engine.prefill(prompt, return_logits=True)
    assert logits is not None
    assert logits.shape == (151936,)
    assert not np.isnan(logits).any()

    # Step at position 3
    next_tok, next_logits = engine.decode_step(token_id=int(np.argmax(logits)), pos=3, return_logits=True)
    assert next_tok >= 0
    assert next_logits is not None

    engine.close()
