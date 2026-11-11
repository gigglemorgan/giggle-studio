from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import logger
from app.db.models.entities import ModelEntity
from app.inference.gguf_parser import parse_gguf_metadata
from app.inference.offload import OffloadEstimator
from app.inference.supervisor import supervisor


class ModelService:
    @classmethod
    async def scan_and_sync_models(cls, session: AsyncSession) -> list[dict[str, Any]]:
        """Scans DATA_DIR/models, parses metadata, and synchronizes with SQLite."""
        models_dir = settings.storage.models_dir
        models_dir.mkdir(parents=True, exist_ok=True)
        found_models: list[dict[str, Any]] = []

        for file_path in models_dir.glob("**/*"):
            if file_path.is_file() and file_path.suffix.lower() in (
                ".gguf",
                ".bin",
                ".safetensors",
            ):
                try:
                    if file_path.suffix.lower() == ".gguf":
                        meta = parse_gguf_metadata(file_path)
                    else:
                        file_size = file_path.stat().st_size
                        meta = {
                            "name": file_path.stem,
                            "path": str(file_path.resolve()),
                            "format": file_path.suffix.lower().lstrip("."),
                            "architecture": "unknown",
                            "quantization": "none",
                            "context_length": 4096,
                            "layer_count": 32,
                            "parameters_count": "unknown",
                            "chat_template": None,
                            "file_size_bytes": file_size,
                            "file_size_mb": round(file_size / (1024 * 1024), 1),
                        }

                    # Check if already in DB
                    query = select(ModelEntity).where(ModelEntity.path == meta["path"])
                    result = await session.execute(query)
                    existing = result.scalar_one_or_none()

                    if existing:
                        existing.name = meta["name"]
                        existing.architecture = meta["architecture"]
                        existing.quantization = meta["quantization"]
                        existing.context_length = meta["context_length"]
                        existing.parameters_count = meta["parameters_count"]
                        existing.chat_template = meta.get("chat_template")
                        model_id = existing.id
                    else:
                        new_model = ModelEntity(
                            name=meta["name"],
                            path=meta["path"],
                            format=meta["format"],
                            architecture=meta["architecture"],
                            quantization=meta["quantization"],
                            context_length=meta["context_length"],
                            parameters_count=meta["parameters_count"],
                            chat_template=meta.get("chat_template"),
                            license=meta.get("license"),
                        )
                        session.add(new_model)
                        await session.flush()
                        model_id = new_model.id

                    meta["id"] = model_id
                    found_models.append(meta)
                except Exception as e:
                    logger.error("Failed to parse model file %s: %s", file_path, e)

        await session.commit()
        return found_models

    @classmethod
    async def list_models(cls, session: AsyncSession) -> list[dict[str, Any]]:
        """Returns all registered models and their saved profiles."""
        result = await session.execute(select(ModelEntity))
        models = result.scalars().all()
        items = []
        for m in models:
            items.append(
                {
                    "id": m.id,
                    "name": m.name,
                    "path": m.path,
                    "format": m.format,
                    "architecture": m.architecture,
                    "quantization": m.quantization,
                    "context_length": m.context_length,
                    "parameters_count": m.parameters_count,
                    "chat_template": m.chat_template,
                    "license": m.license,
                    "exists_on_disk": Path(m.path).exists(),
                }
            )
        return items

    @classmethod
    async def estimate_offload(
        cls,
        session: AsyncSession,
        model_id: str,
        n_gpu_layers: int,
        n_ctx: int = 4096,
        kv_cache_k: str = "f16",
        kv_cache_v: str = "f16",
    ) -> dict[str, Any]:
        """Calculates VRAM/RAM projection for a registered model."""
        result = await session.execute(select(ModelEntity).where(ModelEntity.id == model_id))
        model = result.scalar_one_or_none()
        if not model:
            raise FileNotFoundError(f"Model {model_id} not found")

        path = Path(model.path)
        file_size_mb = path.stat().st_size / (1024 * 1024) if path.exists() else 4000.0
        # Determine layer count from GGUF metadata or default 32
        layer_count = 32
        if path.exists() and path.suffix.lower() == ".gguf":
            try:
                meta = parse_gguf_metadata(path)
                layer_count = meta.get("layer_count", 32)
            except Exception:
                pass

        estimation = OffloadEstimator.estimate(
            file_size_mb=file_size_mb,
            layer_count=layer_count,
            n_gpu_layers=n_gpu_layers,
            n_ctx=n_ctx,
            kv_cache_k=kv_cache_k,
            kv_cache_v=kv_cache_v,
        )
        presets = OffloadEstimator.get_presets(file_size_mb, layer_count)
        estimation["presets"] = presets
        return estimation

    @classmethod
    async def load_active_model(
        cls,
        session: AsyncSession,
        model_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """Loads model into inference supervisor."""
        result = await session.execute(select(ModelEntity).where(ModelEntity.id == model_id))
        model = result.scalar_one_or_none()
        if not model:
            raise FileNotFoundError(f"Model {model_id} not found")

        return await supervisor.load_model(model.path, config)

    @classmethod
    async def unload_active_model(cls) -> dict[str, Any]:
        await supervisor.unload_model()
        return {"status": "unloaded"}
