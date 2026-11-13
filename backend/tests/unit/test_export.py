from __future__ import annotations

from pathlib import Path

from app.training.export import ModelExporter


def test_hf_model_card_generation():
    card = ModelExporter.generate_hf_model_card(
        model_name="giggle-qwen-test",
        base_model="Qwen/Qwen2.5-0.5B-Instruct",
        dataset_name="alpaca_cleaned",
        hyperparams={"lora_r": 16, "lora_alpha": 32, "epochs": 3, "learning_rate": 2e-4},
        train_loss=0.742,
    )

    assert "Trained with Giggle Studio" in card
    assert "Sedat-gigglemorgan" in card
    assert "Qwen/Qwen2.5-0.5B-Instruct" in card
    assert "LoRA Rank (r):" in card


def test_export_bundle_creation(tmp_path: Path):
    bundle = ModelExporter.create_export_bundle(
        export_name="test_bundle",
        base_model="test-base",
        dataset_name="test-ds",
        hyperparams={"lora_r": 8},
    )

    assert bundle["status"] == "ready"
    assert bundle["author"] == "Sedat-gigglemorgan"
    assert Path(bundle["model_card_path"]).exists()
    content = Path(bundle["model_card_path"]).read_text(encoding="utf-8")
    assert "Trained with Giggle Studio" in content
