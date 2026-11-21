"""Unit and integration tests for Giggle Engine inference backend."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.inference.giggle_backend import HAS_GIGGLE_ENGINE, GiggleBackend
from app.inference.supervisor import InferenceSupervisor

MODEL_PATH = Path("data/models/qwen2.5-0.5b-instruct-q4_k_m.gguf")
CAN_TEST = HAS_GIGGLE_ENGINE and MODEL_PATH.is_file()


@pytest.mark.skipif(not CAN_TEST, reason="Giggle Engine library or test model not found")
def test_giggle_backend_lifecycle() -> None:
    backend = GiggleBackend()
    assert not backend.is_active

    info = backend.load(str(MODEL_PATH), {"n_ctx": 512, "precision": "native"})
    assert backend.is_active
    assert info["status"] == "loaded"
    assert info["backend"] == "giggle-engine"
    assert info["vram_bytes"] > 0

    state = backend.get_info()
    assert state["active"] is True
    assert state["backend"] == "giggle-engine"

    backend.unload()
    assert not backend.is_active
    assert backend.get_info()["active"] is False


@pytest.mark.skipif(not CAN_TEST, reason="Giggle Engine library or test model not found")
def test_giggle_backend_stream_generation() -> None:
    backend = GiggleBackend()
    backend.load(str(MODEL_PATH), {"n_ctx": 512, "precision": "native"})

    chunks = list(backend.generate_stream("1 + 1 =", {"max_tokens": 10}))
    assert len(chunks) > 0
    assert any("token" in c for c in chunks)
    assert chunks[-1]["done"] is True
    assert "stats" in chunks[-1]
    assert chunks[-1]["stats"]["total_tokens"] > 0

    backend.unload()


@pytest.mark.asyncio
@pytest.mark.skipif(not CAN_TEST, reason="Giggle Engine library or test model not found")
async def test_supervisor_giggle_engine_roundtrip() -> None:
    supervisor = InferenceSupervisor()
    try:
        load_res = await supervisor.load_model(
            str(MODEL_PATH),
            {"n_ctx": 512, "backend": "giggle-engine", "precision": "native"},
        )
        assert load_res["status"] == "loaded"
        assert load_res["backend"] == "giggle-engine"

        # Stream generation
        received_tokens = []
        async for chunk in supervisor.generate_stream("Hello", {"max_tokens": 5}):
            if chunk.get("token"):
                received_tokens.append(chunk["token"])

        assert len(received_tokens) > 0

        # Unload
        await supervisor.unload_model()
        assert not supervisor.is_alive()
    finally:
        supervisor.stop_worker()
