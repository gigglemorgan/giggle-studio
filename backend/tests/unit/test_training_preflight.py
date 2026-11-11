from __future__ import annotations

from app.training.preflight import TrainingPreflight


def test_preflight_7b_qlora_is_safe():
    # 7B base model, 4-bit NF4, LoRA r=16, batch_size=1, seq_len=2048, gradient checkpointing
    res = TrainingPreflight.estimate_memory(
        param_count_b=7.0,
        quantization="4bit",
        lora_r=16,
        batch_size=1,
        max_seq_len=2048,
        gradient_checkpointing=True,
    )

    assert res["status"] in ("SAFE", "WARNING")
    assert res["is_safe"] is True
    # Must fit well within 11.4 GB (11688 MB)
    assert res["projected_vram_mb"] < 11688
    assert res["breakdown"]["base_model_weights_mb"] > 0
    assert res["breakdown"]["lora_adapter_weights_mb"] > 0


def test_preflight_refusal_on_oversized_configuration():
    # 70B model or FP16 unquantized on 12 GB GPU must be REFUSED
    res = TrainingPreflight.estimate_memory(
        param_count_b=70.0,
        quantization="16bit",
        lora_r=64,
        batch_size=8,
        max_seq_len=4096,
        gradient_checkpointing=False,
    )

    assert res["status"] == "REFUSED"
    assert res["is_safe"] is False
    assert len(res["suggestions"]) > 0
    # Suggestions should advise reducing batch size, using 4-bit, etc.
    sug_text = " ".join(res["suggestions"])
    assert "batch" in sug_text.lower() or "4-bit" in sug_text.lower()
