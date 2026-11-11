import gc
import time
from collections.abc import Generator
from typing import Any

from app.inference.base import InferenceBackend

try:
    from llama_cpp import Llama

    HAS_LLAMA_CPP = True
except ImportError:
    HAS_LLAMA_CPP = False


class LlamaCppBackend(InferenceBackend):
    """Executes GGUF models via llama-cpp-python."""

    def __init__(self) -> None:
        super().__init__()
        self.llm: Any | None = None

    def load(self, model_path: str, config: dict[str, Any]) -> dict[str, Any]:
        if not HAS_LLAMA_CPP:
            raise RuntimeError("llama-cpp-python is not installed.")

        self.unload()
        start_time = time.time()

        n_gpu_layers = int(config.get("n_gpu_layers", 0))
        n_ctx = int(config.get("n_ctx", 4096))
        n_batch = int(config.get("n_batch", 512))
        n_ubatch = int(config.get("n_ubatch", 128))
        flash_attn = bool(config.get("flash_attention", True))
        n_threads = int(config.get("threads", 6))
        use_mmap = bool(config.get("use_mmap", True))
        use_mlock = bool(config.get("use_mlock", False))  # False by default for 16 GB safety

        # KV cache quantization map for llama_cpp
        type_k_str = str(config.get("kv_cache_k", "f16")).lower()
        type_v_str = str(config.get("kv_cache_v", "f16")).lower()
        # llama_cpp type enum: 0 for f16, 1 for q4_0, 2 for q8_0
        kv_type_map = {"f16": 0, "q4_0": 1, "q8_0": 2}
        type_k = kv_type_map.get(type_k_str, 0)
        type_v = kv_type_map.get(type_v_str, 0)

        kwargs: dict[str, Any] = {
            "model_path": model_path,
            "n_gpu_layers": n_gpu_layers,
            "n_ctx": n_ctx,
            "n_batch": n_batch,
            "n_threads": n_threads,
            "use_mmap": use_mmap,
            "use_mlock": use_mlock,
            "verbose": False,
        }

        # Try to pass flash_attn and ubatch if supported by llama_cpp version
        try:
            self.llm = Llama(
                flash_attn=flash_attn,
                n_ubatch=n_ubatch,
                type_k=type_k,
                type_v=type_v,
                **kwargs,
            )
        except TypeError:
            # Fallback for llama_cpp variants without specific kwarg
            self.llm = Llama(**kwargs)

        load_duration_s = round(time.time() - start_time, 2)
        self.is_active = True
        self.current_model_path = model_path
        self.current_config = config

        return {
            "status": "loaded",
            "model_path": model_path,
            "load_time_seconds": load_duration_s,
            "n_gpu_layers": n_gpu_layers,
            "n_ctx": n_ctx,
        }

    def unload(self) -> None:
        if self.llm is not None:
            del self.llm
            self.llm = None
        self.is_active = False
        self.current_model_path = None
        self.current_config = {}
        gc.collect()

    def generate_stream(
        self,
        prompt: str,
        sampling_params: dict[str, Any],
    ) -> Generator[dict[str, Any], None, None]:
        if self.llm is None or not self.is_active:
            raise RuntimeError("No model loaded in llama.cpp backend.")

        temp = float(sampling_params.get("temperature", 0.7))
        top_p = float(sampling_params.get("top_p", 0.95))
        top_k = int(sampling_params.get("top_k", 40))
        repeat_penalty = float(sampling_params.get("repeat_penalty", 1.1))
        max_tokens = int(sampling_params.get("max_tokens", 2048))
        stop_words = sampling_params.get("stop", ["</s>", "<|im_end|>", "<|endoftext|>"])

        start_time = time.time()
        first_token_time: float | None = None
        token_count = 0

        stream = self.llm(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temp,
            top_p=top_p,
            top_k=top_k,
            repeat_penalty=repeat_penalty,
            stop=stop_words,
            stream=True,
        )

        for chunk in stream:
            now = time.time()
            if first_token_time is None:
                first_token_time = now

            token_count += 1
            choice = chunk["choices"][0]
            token_text = choice.get("text", "")
            finish_reason = choice.get("finish_reason")

            ttft_ms = round((first_token_time - start_time) * 1000, 1) if first_token_time else 0.0
            elapsed = now - (first_token_time or start_time)
            tps = round(token_count / max(0.001, elapsed), 1)

            yield {
                "token": token_text,
                "done": finish_reason is not None,
                "finish_reason": finish_reason,
                "stats": {
                    "tokens_out": token_count,
                    "ttft_ms": ttft_ms,
                    "tps": tps,
                },
            }

    def get_info(self) -> dict[str, Any]:
        return {
            "active": self.is_active,
            "model_path": self.current_model_path,
            "config": self.current_config,
            "backend": "llama_cpp",
        }
