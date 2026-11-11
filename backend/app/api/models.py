import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.inference.supervisor import supervisor
from app.services.hf_downloader import HuggingFaceService
from app.services.model_service import ModelService

router = APIRouter(prefix="/models", tags=["Models"])


class LoadModelRequest(BaseModel):
    n_gpu_layers: int = 0
    n_ctx: int = 4096
    n_batch: int = 512
    flash_attention: bool = True
    kv_cache_k: str = "f16"
    kv_cache_v: str = "f16"
    threads: int = 6


class EstimateRequest(BaseModel):
    n_gpu_layers: int = 0
    n_ctx: int = 4096
    kv_cache_k: str = "f16"
    kv_cache_v: str = "f16"


class DownloadRequest(BaseModel):
    repo_id: str
    filename: str


@router.get("")
async def list_models(session: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Lists registered models."""
    return await ModelService.list_models(session)


@router.post("/scan")
async def scan_models(session: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Scans DATA_DIR/models for new GGUF files and parses metadata."""
    return await ModelService.scan_and_sync_models(session)


@router.post("/{model_id}/estimate-offload")
async def estimate_offload(
    model_id: str,
    req: EstimateRequest,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Calculates projected VRAM and RAM allocation for layer placement."""
    return await ModelService.estimate_offload(
        session,
        model_id,
        n_gpu_layers=req.n_gpu_layers,
        n_ctx=req.n_ctx,
        kv_cache_k=req.kv_cache_k,
        kv_cache_v=req.kv_cache_v,
    )


@router.post("/{model_id}/load")
async def load_model(
    model_id: str,
    req: LoadModelRequest,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Loads model with requested offload parameters."""
    return await ModelService.load_active_model(session, model_id, req.model_dump())


@router.post("/unload")
async def unload_model() -> dict[str, Any]:
    """Unloads active model and deterministically terminates the inference worker."""
    return await ModelService.unload_active_model()


@router.get("/active")
async def get_active_model_status() -> dict[str, Any]:
    """Returns current active model and supervisor state."""
    return supervisor.get_status()


@router.get("/hf/info")
async def get_hf_repo_info(
    repo_id: str = Query(..., description="Hugging Face repo ID"),
) -> dict[str, Any]:
    """Fetches license, gating, and GGUF files for a Hugging Face repo."""
    return await HuggingFaceService.get_model_info(repo_id)


@router.post("/hf/download")
async def download_hf_model(req: DownloadRequest) -> StreamingResponse:
    """Streams progress for downloading a GGUF file from Hugging Face."""

    async def event_generator() -> AsyncGenerator[str, None]:
        async for progress in HuggingFaceService.download_file_stream(req.repo_id, req.filename):
            yield f"data: {json.dumps(progress)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
