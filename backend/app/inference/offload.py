from typing import Any

from app.core.config import settings
from app.utils.hardware import HardwareDetector


class OffloadEstimator:
    """Calculates projected VRAM and RAM footprint for model weights, KV cache,
    and compute buffers before loading, and provides layer placement maps.
    """

    # Approximate bytes per token per layer for KV cache element types
    KV_BYTES_MAP = {
        "f16": 2.0,
        "q8_0": 1.0,
        "q4_0": 0.5,
        "q4_1": 0.55,
    }

    @classmethod
    def estimate(
        cls,
        file_size_mb: float,
        layer_count: int,
        n_gpu_layers: int,
        n_ctx: int = 4096,
        kv_cache_k: str = "f16",
        kv_cache_v: str = "f16",
        batch_size: int = 512,
        moe_cpu_layers: int = 0,
        tensor_overrides: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Calculates split VRAM and RAM allocations and checks safety thresholds."""
        hardware = HardwareDetector.get_all_metrics()
        gpu_telemetry = hardware.get("gpu", {})
        sys_telemetry = hardware.get("system", {})

        total_vram_mb = gpu_telemetry.get("vram_total_mb", 12227.0)
        total_ram_mb = sys_telemetry.get("ram_total_mb", 15856.0)

        # 1. Weights memory estimation
        total_layers = max(1, layer_count)
        # 1 embedding + layer_count blocks + 1 output head = layer_count + 2 logical layers
        total_logical_layers = total_layers + 2
        mb_per_layer = file_size_mb / total_logical_layers

        # Effective GPU layers clamped between 0 and total_logical_layers
        eff_gpu_layers = min(max(0, n_gpu_layers), total_logical_layers)
        weights_vram_mb = eff_gpu_layers * mb_per_layer
        weights_ram_mb = (total_logical_layers - eff_gpu_layers) * mb_per_layer

        # 2. KV Cache memory estimation
        # KV cache size = 2 * n_ctx * n_layers * hidden_dim / num_heads * num_kv_heads * bytes
        # Rule of thumb based on context: ~0.5 MB per layer per 1024 tokens for f16
        k_factor = cls.KV_BYTES_MAP.get(kv_cache_k.lower(), 2.0) / 2.0
        v_factor = cls.KV_BYTES_MAP.get(kv_cache_v.lower(), 2.0) / 2.0
        avg_kv_factor = (k_factor + v_factor) / 2.0

        # Base KV cache per 1024 tokens per layer ~ 0.5 MB
        kv_cache_per_layer_mb = (n_ctx / 1024.0) * 0.5 * avg_kv_factor
        total_kv_mb = kv_cache_per_layer_mb * total_layers

        # KV cache resides in VRAM if at least 1 layer is offloaded to GPU
        if eff_gpu_layers > 0:
            kv_vram_mb = total_kv_mb
            kv_ram_mb = 0.0
        else:
            kv_vram_mb = 0.0
            kv_ram_mb = total_kv_mb

        # 3. Compute Buffers (Scratch / CUDA context)
        compute_vram_mb = 250.0 + (batch_size / 512.0) * 120.0 if eff_gpu_layers > 0 else 0.0
        compute_ram_mb = 350.0 + (batch_size / 512.0) * 100.0

        # Totals
        proj_vram_mb = weights_vram_mb + kv_vram_mb + compute_vram_mb
        proj_ram_mb = weights_ram_mb + kv_ram_mb + compute_ram_mb

        # Safety Check thresholds
        vram_margin = settings.hardware.vram_safety_margin_mb  # default 600 MB
        vram_limit_mb = total_vram_mb - vram_margin
        ram_ceiling_percent = settings.hardware.ram_ceiling_percent  # default 85%
        ram_limit_mb = total_ram_mb * (ram_ceiling_percent / 100.0)

        # Refusal checks
        vram_safe = proj_vram_mb <= vram_limit_mb
        ram_safe = proj_ram_mb <= (total_ram_mb - (total_ram_mb - ram_limit_mb))

        proposals = []
        if not vram_safe:
            excess_vram = proj_vram_mb - vram_limit_mb
            layers_to_reduce = int(excess_vram / mb_per_layer) + 1
            rec_gpu_layers = max(0, eff_gpu_layers - layers_to_reduce)
            proposals.append(
                {
                    "type": "reduce_gpu_layers",
                    "message_tr": f"GPU katman sayısını {eff_gpu_layers}'den {rec_gpu_layers}'e düşürün.",
                    "suggested_value": rec_gpu_layers,
                }
            )
            if kv_cache_k == "f16":
                proposals.append(
                    {
                        "type": "quantize_kv",
                        "message_tr": "KV Bellek Kuantizasyonunu 'q4_0' veya 'q8_0' yapın (yaklaşık 500-1500 MB VRAM tasarrufu).",
                        "suggested_kv_k": "q4_0",
                        "suggested_kv_v": "q4_0",
                    }
                )
            if n_ctx > 4096:
                proposals.append(
                    {
                        "type": "reduce_context",
                        "message_tr": f"Bağlam boyutunu (n_ctx) {n_ctx}'den 4096'ya indirin.",
                        "suggested_ctx": 4096,
                    }
                )

        if not ram_safe:
            proposals.append(
                {
                    "type": "ram_warning",
                    "message_tr": f"Model toplam sistem RAM tavanını (%{ram_ceiling_percent}) aşıyor. Lütfen daha küçük kuantize model tercih edin.",
                }
            )

        # Layer placement mapping
        layers_map = []
        # Layer 0: Embedding
        layers_map.append(
            {
                "index": 0,
                "type": "embedding",
                "name": "Token Embedding",
                "device": "GPU" if eff_gpu_layers >= 1 else "CPU",
            }
        )
        # Transformer Blocks
        for i in range(1, total_layers + 1):
            layers_map.append(
                {
                    "index": i,
                    "type": "block",
                    "name": f"Layer {i - 1}",
                    "device": "GPU" if eff_gpu_layers > i else "CPU",
                }
            )
        # Final Output Head
        layers_map.append(
            {
                "index": total_layers + 1,
                "type": "output",
                "name": "LM Head / Norm",
                "device": "GPU" if eff_gpu_layers >= total_logical_layers else "CPU",
            }
        )

        return {
            "safe": vram_safe and ram_safe,
            "vram": {
                "total_mb": round(total_vram_mb, 1),
                "projected_mb": round(proj_vram_mb, 1),
                "weights_mb": round(weights_vram_mb, 1),
                "kv_cache_mb": round(kv_vram_mb, 1),
                "compute_mb": round(compute_vram_mb, 1),
                "limit_mb": round(vram_limit_mb, 1),
                "free_after_load_mb": round(max(0, total_vram_mb - proj_vram_mb), 1),
                "safe": vram_safe,
            },
            "ram": {
                "total_mb": round(total_ram_mb, 1),
                "projected_mb": round(proj_ram_mb, 1),
                "weights_mb": round(weights_ram_mb, 1),
                "kv_cache_mb": round(kv_ram_mb, 1),
                "compute_mb": round(compute_ram_mb, 1),
                "limit_mb": round(ram_limit_mb, 1),
                "safe": ram_safe,
            },
            "settings": {
                "layer_count": total_layers,
                "n_gpu_layers": eff_gpu_layers,
                "n_ctx": n_ctx,
                "kv_cache_k": kv_cache_k,
                "kv_cache_v": kv_cache_v,
            },
            "proposals": proposals,
            "layers_map": layers_map,
        }

    @classmethod
    def get_presets(cls, file_size_mb: float, layer_count: int) -> dict[str, int]:
        """Provides instant layer placement presets."""
        total_layers = max(1, layer_count)
        # RTX 5070 has 12 GB VRAM
        # Safe VRAM ceiling ~ 11,000 MB
        mb_per_layer = file_size_mb / (total_layers + 2)

        # max_speed: all layers on GPU if fits, else max that fits
        max_gpu = min(total_layers + 2, int(11000.0 / mb_per_layer))
        # balanced: leave 3 GB VRAM headroom
        balanced_gpu = min(total_layers + 2, int(8500.0 / mb_per_layer))
        # max_context: reserve 4 GB for 32k KV cache
        max_ctx_gpu = min(total_layers + 2, int(7000.0 / mb_per_layer))
        # min_vram: minimum GPU offload
        min_vram_gpu = min(total_layers + 2, max(0, int(3000.0 / mb_per_layer)))

        return {
            "all_gpu": total_layers + 2,
            "max_speed": max_gpu,
            "balanced": balanced_gpu,
            "max_context": max_ctx_gpu,
            "min_vram": min_vram_gpu,
        }
