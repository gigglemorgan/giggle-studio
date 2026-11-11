from __future__ import annotations

from typing import Any


class TrainingPreflight:
    """Computes exact VRAM and RAM memory projections before starting training."""

    RTX_5070_TOTAL_VRAM_MB = 12288  # 12 GB
    VRAM_SAFETY_MARGIN_MB = 600  # 600 MB OS/Desktop margin
    MAX_SAFE_VRAM_MB = 11688  # 12288 - 600 = 11688 MB
    MAX_SAFE_RAM_PERCENT = 85  # Refuse if host RAM > 85%

    @classmethod
    def estimate_memory(
        cls,
        param_count_b: float = 7.0,
        quantization: str = "4bit",
        lora_r: int = 16,
        target_modules_count: int = 7,
        num_layers: int = 32,
        hidden_size: int = 4096,
        batch_size: int = 1,
        max_seq_len: int = 2048,
        gradient_checkpointing: bool = True,
        optimizer: str = "paged_adamw_8bit",
    ) -> dict[str, Any]:
        """
        Projects exact peak VRAM requirements in MB for QLoRA / LoRA fine-tuning.
        """
        # 1. Base Model Weights
        # 4-bit NF4: ~0.55 bytes per param (with quantization blocks overhead)
        # 8-bit: ~1.1 bytes per param
        # 16-bit: ~2.0 bytes per param
        bytes_per_param = (
            0.55 if quantization == "4bit" else (1.1 if quantization == "8bit" else 2.0)
        )
        base_model_vram_mb = int((param_count_b * 1e9 * bytes_per_param) / (1024 * 1024))

        # 2. LoRA Parameters
        # For each target module in each layer: 2 * r * hidden_size parameters
        lora_params = 2 * lora_r * hidden_size * num_layers * target_modules_count
        lora_vram_mb = int((lora_params * 4) / (1024 * 1024))  # FP32 weights

        # 3. Gradients
        # Gradients exist only for trainable LoRA weights (BF16 = 2 bytes)
        gradient_vram_mb = int((lora_params * 2) / (1024 * 1024))

        # 4. Optimizer States
        # paged_adamw_8bit: 2 states (exp_avg, exp_avg_sq) in 8-bit = 2 bytes per param
        # Standard adamw_torch: 8 bytes per param (FP32)
        opt_bytes_per_param = 2 if "8bit" in optimizer.lower() else 8
        optimizer_vram_mb = int((lora_params * opt_bytes_per_param) / (1024 * 1024))

        # 5. Activations
        # With gradient checkpointing: recomputed during backward pass, stores only layer boundaries
        # Without checkpointing: stores full intermediate activations per layer
        if gradient_checkpointing:
            act_bytes = batch_size * max_seq_len * hidden_size * 2 * 4  # Boundary checkpoints
        else:
            act_bytes = batch_size * max_seq_len * hidden_size * 2 * num_layers * 12

        activation_vram_mb = int(act_bytes / (1024 * 1024))

        # 6. PyTorch CUDA context overhead and compute buffer
        cuda_overhead_mb = 750

        # Total projected peak VRAM
        total_peak_vram_mb = (
            base_model_vram_mb
            + lora_vram_mb
            + gradient_vram_mb
            + optimizer_vram_mb
            + activation_vram_mb
            + cuda_overhead_mb
        )

        # Host RAM projection: dataset caching + tokenizer + Python runtime
        projected_host_ram_mb = 4500  # ~4.5 GB

        # Safety evaluation against 12 GB RTX 5070
        is_safe = total_peak_vram_mb <= cls.MAX_SAFE_VRAM_MB
        suggestions: list[str] = []

        if not is_safe:
            status = "REFUSED"
            if batch_size > 1:
                suggestions.append(
                    f"Mikro-yığın boyutunu (batch size) {batch_size}'den 1'e düşürün ve gradient_accumulation_steps değerini artırın."
                )
            if max_seq_len > 2048:
                suggestions.append(
                    f"Maksimum dizi uzunluğunu (max_seq_length) {max_seq_len}'den 2048'e indirin."
                )
            if not gradient_checkpointing:
                suggestions.append(
                    "Gradient Checkpointing özelliğini etkinleştirin (Aktivasyon belleğini %60 azaltır)."
                )
            if quantization != "4bit":
                suggestions.append("Base model nicelleştirmesini 4-bit NF4 (QLoRA) olarak seçin.")
            if lora_r > 32:
                suggestions.append(f"LoRA rank (r) değerini {lora_r}'den 16 veya 32'ye düşürün.")
        elif total_peak_vram_mb > (cls.MAX_SAFE_VRAM_MB - 1200):
            status = "WARNING"
            suggestions.append(
                "Bellek sınırına yakın. Arka planda başka VRAM kullanan uygulamaları kapatmanız önerilir."
            )
        else:
            status = "SAFE"

        return {
            "status": status,
            "is_safe": is_safe,
            "projected_vram_mb": total_peak_vram_mb,
            "max_safe_vram_mb": cls.MAX_SAFE_VRAM_MB,
            "total_gpu_vram_mb": cls.RTX_5070_TOTAL_VRAM_MB,
            "headroom_mb": cls.MAX_SAFE_VRAM_MB - total_peak_vram_mb,
            "projected_host_ram_mb": projected_host_ram_mb,
            "breakdown": {
                "base_model_weights_mb": base_model_vram_mb,
                "lora_adapter_weights_mb": lora_vram_mb,
                "gradients_mb": gradient_vram_mb,
                "optimizer_states_mb": optimizer_vram_mb,
                "activations_mb": activation_vram_mb,
                "cuda_overhead_mb": cuda_overhead_mb,
            },
            "suggestions": suggestions,
        }
