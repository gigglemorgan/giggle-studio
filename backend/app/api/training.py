from __future__ import annotations

import json
import uuid
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select

from app.core.config import settings
from app.db.models.entities import DatasetModel, RunMetricModel, TrainingRunModel
from app.db.session import AsyncSessionLocal
from app.training.dataset import DatasetProcessor
from app.training.preflight import TrainingPreflight
from app.training.runner import TrainingRunner

router = APIRouter(prefix="/training", tags=["Training Studio (LoRA / QLoRA)"])


class PreflightRequest(BaseModel):
    param_count_b: float = 7.0
    quantization: str = "4bit"
    lora_r: int = 16
    target_modules_count: int = 7
    num_layers: int = 32
    hidden_size: int = 4096
    batch_size: int = 1
    max_seq_len: int = 2048
    gradient_checkpointing: bool = True
    optimizer: str = "paged_adamw_8bit"


class CreateRunRequest(BaseModel):
    name: str = "Giggle LoRA Experiment"
    base_model_id: str
    dataset_id: str
    config: dict[str, Any] = Field(default_factory=dict)


@router.post("/datasets/upload")
async def upload_dataset(
    name: str = Query(...),
    target_max_seq_len: int = Query(2048),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Save to disk
    dataset_id = str(uuid.uuid4())
    datasets_dir = Path(settings.storage.data_dir) / "datasets"
    datasets_dir.mkdir(parents=True, exist_ok=True)
    target_path = datasets_dir / f"{dataset_id}_{file.filename}"
    target_path.write_bytes(content)

    # Process and analyze dataset
    try:
        parsed_stats = DatasetProcessor.parse_dataset_bytes(
            file_bytes=content,
            filename=file.filename or "data.jsonl",
            target_max_seq_len=target_max_seq_len,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to parse dataset: {e}") from e

    async with AsyncSessionLocal() as db:
        new_ds = DatasetModel(
            id=dataset_id,
            name=name,
            path=str(target_path),
            format=parsed_stats["format"],
            row_count=parsed_stats["row_count"],
            token_count=parsed_stats["total_tokens"],
            columns_json=parsed_stats["columns"],
            license="Apache-2.0",
        )
        db.add(new_ds)
        await db.commit()

    return {
        "id": dataset_id,
        "name": name,
        "path": str(target_path),
        **parsed_stats,
    }


@router.get("/datasets")
async def list_datasets() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(DatasetModel).order_by(desc(DatasetModel.created_at)))
        datasets = res.scalars().all()
        return [
            {
                "id": d.id,
                "name": d.name,
                "format": d.format,
                "row_count": d.row_count,
                "token_count": d.token_count,
                "columns": d.columns_json or [],
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in datasets
        ]


@router.post("/preflight")
async def run_preflight(req: PreflightRequest) -> dict[str, Any]:
    """Projects exact peak memory requirements for fine-tuning config."""
    return TrainingPreflight.estimate_memory(
        param_count_b=req.param_count_b,
        quantization=req.quantization,
        lora_r=req.lora_r,
        target_modules_count=req.target_modules_count,
        num_layers=req.num_layers,
        hidden_size=req.hidden_size,
        batch_size=req.batch_size,
        max_seq_len=req.max_seq_len,
        gradient_checkpointing=req.gradient_checkpointing,
        optimizer=req.optimizer,
    )


@router.post("/runs")
async def create_training_run(req: CreateRunRequest) -> dict[str, Any]:
    run_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        new_run = TrainingRunModel(
            id=run_id,
            name=req.name,
            base_model_id=req.base_model_id,
            dataset_id=req.dataset_id,
            status="created",
            config_json=req.config,
            output_path=str(Path(settings.storage.data_dir) / "runs" / run_id),
        )
        db.add(new_run)
        await db.commit()

    return {
        "id": run_id,
        "name": req.name,
        "base_model_id": req.base_model_id,
        "dataset_id": req.dataset_id,
        "status": "created",
    }


@router.get("/runs")
async def list_training_runs() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(TrainingRunModel).order_by(desc(TrainingRunModel.created_at)))
        runs = res.scalars().all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "base_model_id": r.base_model_id,
                "dataset_id": r.dataset_id,
                "status": r.status,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
                "is_running": TrainingRunner.is_running(r.id),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ]


@router.get("/runs/{run_id}")
async def get_training_run_details(run_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        run = await db.get(TrainingRunModel, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Training run not found")

        metrics_res = await db.execute(
            select(RunMetricModel)
            .where(RunMetricModel.run_id == run_id)
            .order_by(RunMetricModel.step)
        )
        metrics = metrics_res.scalars().all()

        return {
            "run": {
                "id": run.id,
                "name": run.name,
                "base_model_id": run.base_model_id,
                "dataset_id": run.dataset_id,
                "status": run.status,
                "config": run.config_json,
                "started_at": run.started_at,
                "finished_at": run.finished_at,
                "is_running": TrainingRunner.is_running(run.id),
            },
            "metrics": [
                {
                    "step": m.step,
                    "epoch": m.epoch,
                    "loss": m.loss,
                    "eval_loss": m.eval_loss,
                    "lr": m.lr,
                    "vram_mb": m.vram_usage_mb,
                    "tokens_per_sec": m.tokens_per_sec,
                }
                for m in metrics
            ],
        }


@router.get("/runs/{run_id}/stream")
async def stream_training_metrics(run_id: str) -> StreamingResponse:
    """Streams live training step metrics as SSE events."""
    async with AsyncSessionLocal() as db:
        run = await db.get(TrainingRunModel, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Training run not found")
        config = run.config_json or {}

    async def sse_generator() -> AsyncGenerator[str, None]:
        async for evt in TrainingRunner.start_training(run_id=run_id, config=config):
            yield f"data: {json.dumps(evt)}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.post("/runs/{run_id}/stop")
async def stop_training_run(run_id: str) -> dict[str, Any]:
    stopped = await TrainingRunner.stop_run(run_id)
    return {"status": "stopped" if stopped else "not_running", "run_id": run_id}
