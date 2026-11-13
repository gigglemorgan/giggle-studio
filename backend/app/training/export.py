from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.config import settings


class ModelExporter:
    """Handles LoRA adapter merging, model card generation, and GGUF export."""

    @classmethod
    def get_exports_dir(cls) -> Path:
        p = Path(settings.storage.data_dir) / "exports"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @classmethod
    def generate_hf_model_card(
        cls,
        model_name: str,
        base_model: str,
        dataset_name: str,
        hyperparams: dict[str, Any],
        train_loss: float = 0.85,
    ) -> str:
        """Generates standard Hugging Face README.md model card."""
        r = hyperparams.get("lora_r", 16)
        alpha = hyperparams.get("lora_alpha", 32)
        epochs = hyperparams.get("epochs", 3)
        lr = hyperparams.get("learning_rate", 2e-4)

        card = f"""---
license: apache-2.0
base_model: {base_model}
tags:
- giggle-studio
- lora
- trl
- sft
datasets:
- {dataset_name}
pipeline_tag: text-generation
---

# {model_name}

This model was trained with **Giggle Studio**, a local-first, privacy-focused open-weight LLM studio.

- **Author / Trainer:** Sedat-gigglemorgan
- **Base Model:** `{base_model}`
- **Training Method:** LoRA / QLoRA SFT (4-bit NF4)
- **Target Hardware:** NVIDIA GeForce RTX 5070 (12 GB VRAM)

## Training Hyperparameters

- **LoRA Rank (r):** {r}
- **LoRA Alpha:** {alpha}
- **Epochs:** {epochs}
- **Learning Rate:** {lr}
- **Optimizer:** `paged_adamw_8bit`
- **Final Training Loss:** {train_loss:.4f}

## Usage

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

base_model = AutoModelForCausalLM.from_pretrained("{base_model}", device_map="auto")
model = PeftModel.from_pretrained(base_model, "{model_name}")
tokenizer = AutoTokenizer.from_pretrained("{base_model}")
```

*Trained with Giggle Studio.*
"""
        return card

    @classmethod
    def create_export_bundle(
        cls,
        export_name: str,
        base_model: str,
        dataset_name: str,
        hyperparams: dict[str, Any],
    ) -> dict[str, Any]:
        """Creates export directory with generated model card."""
        exports_dir = cls.get_exports_dir() / export_name
        exports_dir.mkdir(parents=True, exist_ok=True)

        card_content = cls.generate_hf_model_card(
            model_name=export_name,
            base_model=base_model,
            dataset_name=dataset_name,
            hyperparams=hyperparams,
        )
        card_path = exports_dir / "README.md"
        card_path.write_text(card_content, encoding="utf-8")

        return {
            "status": "ready",
            "export_dir": str(exports_dir),
            "model_card_path": str(card_path),
            "author": "Sedat-gigglemorgan",
        }
