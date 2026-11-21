"""Giggle Studio native CUDA inference backend ("giggle-engine").

Directly executes GGUF models on Blackwell sm_120 using Giggle Engine.
"""

from __future__ import annotations

import gc
import logging
import time
from collections.abc import Generator
from pathlib import Path
from typing import Any

from app.inference.base import InferenceBackend

logger = logging.getLogger("giggle_backend")

try:
    from engine.python.giggle_engine import GiggleEngine

    HAS_GIGGLE_ENGINE = True
except Exception as e:
    logger.warning("Giggle Engine not available: %s", e)
    HAS_GIGGLE_ENGINE = False

try:
    from llama_cpp import Llama

    HAS_TOKENIZER = True
except ImportError:
    HAS_TOKENIZER = False


class GiggleBackend(InferenceBackend):
    """Executes models using Giggle Studio's proprietary CUDA C++ engine."""

    def __init__(self) -> None:
        super().__init__()
        self.engine: Any | None = None
        self.tokenizer: Any | None = None
        self.eos_token_ids: set[int] = {151643, 151644, 151645, 2, 0}

    def load(self, model_path: str, config: dict[str, Any]) -> dict[str, Any]:
        if not HAS_GIGGLE_ENGINE:
            raise RuntimeError(
                "giggle-engine is not built or unavailable. Build engine/ with CMake first."
            )

        self.unload()
        start_time = time.time()

        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        n_ctx = int(config.get("n_ctx", 2048))
        precision = str(config.get("precision", "native")).lower()

        logger.info(
            "Loading %s into Giggle Engine (precision=%s, max_ctx=%d)...",
            path.name,
            precision,
            n_ctx,
        )

        self.engine = GiggleEngine(
            model_path=str(path),
            precision=precision,
            max_seq_len=n_ctx,
        )

        # Load vocab-only tokenizer (CPU only, ~0 MB VRAM)
        if HAS_TOKENIZER:
            try:
                self.tokenizer = Llama(str(path), vocab_only=True, verbose=False)
                # Discover EOS tokens
                if hasattr(self.tokenizer, "token_eos"):
                    self.eos_token_ids.add(self.tokenizer.token_eos())
            except Exception as e:
                logger.warning("Failed to load GGUF tokenizer: %s", e)

        load_time = time.time() - start_time
        vram_bytes = self.engine.vram_usage_bytes

        self.is_active = True
        self.current_model_path = str(path)
        self.current_config = {
            **config,
            "backend": "giggle-engine",
            "vram_bytes": vram_bytes,
            "load_time_sec": load_time,
            "engine_config": self.engine.config,
        }

        logger.info(
            "Giggle Engine loaded %s in %.2fs (VRAM: %.1f MB)",
            path.name,
            load_time,
            vram_bytes / (1024 * 1024),
        )

        return {
            "model": path.name,
            "backend": "giggle-engine",
            "status": "loaded",
            "load_time": load_time,
            "vram_bytes": vram_bytes,
            "config": self.current_config,
        }

    def unload(self) -> None:
        if self.engine is not None:
            try:
                self.engine.close()
            except Exception:
                pass
            self.engine = None

        if self.tokenizer is not None:
            self.tokenizer = None

        self.is_active = False
        self.current_model_path = None
        self.current_config = {}
        gc.collect()

    def generate_stream(
        self,
        prompt: str,
        sampling_params: dict[str, Any],
    ) -> Generator[dict[str, Any], None, None]:
        if not self.is_active or self.engine is None:
            raise RuntimeError("Cannot generate: Giggle Engine model is not loaded.")

        if self.tokenizer is None:
            raise RuntimeError("Cannot generate: Tokenizer is not available.")

        # Tokenize prompt
        prompt_tokens: list[int] = self.tokenizer.tokenize(prompt.encode("utf-8"))
        if not prompt_tokens:
            prompt_tokens = [151643]

        max_tokens = int(sampling_params.get("max_tokens", 256))
        start_time = time.time()

        # Prefill prompt
        self.engine.reset_kv_cache()
        self.engine.prefill(prompt_tokens)
        ttft = time.time() - start_time

        cur_token = prompt_tokens[-1]
        cur_pos = len(prompt_tokens)
        generated_count = 0

        for _ in range(max_tokens):
            t0 = time.time()
            next_token, _ = self.engine.decode_step(cur_token, cur_pos - 1)
            generated_count += 1
            cur_token = next_token
            cur_pos += 1

            if next_token in self.eos_token_ids:
                break

            # Detokenize single token
            token_bytes = self.tokenizer.detokenize([next_token])
            token_str = token_bytes.decode("utf-8", errors="replace")

            dt = time.time() - t0
            tps = 1.0 / dt if dt > 0 else 0.0

            yield {
                "token": token_str,
                "token_id": next_token,
                "done": False,
                "stats": {
                    "ttft_ms": ttft * 1000.0,
                    "tokens_per_second": tps,
                    "tokens_generated": generated_count,
                },
            }

        total_time = time.time() - start_time
        avg_tps = generated_count / total_time if total_time > 0 else 0.0

        yield {
            "token": "",
            "done": True,
            "stats": {
                "total_tokens": generated_count,
                "total_time_sec": total_time,
                "tokens_per_second": avg_tps,
                "ttft_ms": ttft * 1000.0,
            },
        }

    def get_info(self) -> dict[str, Any]:
        if not self.is_active or self.engine is None:
            return {"active": False, "backend": "giggle-engine"}

        return {
            "active": True,
            "backend": "giggle-engine",
            "model_path": self.current_model_path,
            "vram_bytes": self.engine.vram_usage_bytes,
            "config": self.current_config,
        }
