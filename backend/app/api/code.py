from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel

from app.sandbox.runner import SandboxRunner
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["Code Mode & Sandbox"])


class FileWriteRequest(BaseModel):
    path: str
    content: str


class ExecuteRequest(BaseModel):
    command: str
    is_python: bool = False
    timeout: int | None = None


@router.get("/sandbox-status")
async def get_sandbox_status() -> dict[str, Any]:
    """Returns host isolation backend and safety limits."""
    backend = SandboxRunner.get_isolation_backend()
    return {
        "active_backend": backend,
        "is_isolated": backend in ("bwrap", "unshare"),
        "features": {
            "network_isolation": True,
            "filesystem_readonly_root": backend == "bwrap",
            "process_namespace": backend in ("bwrap", "unshare"),
            "rlimit_memory": True,
            "wall_clock_timeout": True,
        },
    }


@router.get("/{workspace_id}/files")
async def list_workspace_files(workspace_id: str) -> list[dict[str, Any]]:
    return WorkspaceService.list_files(workspace_id)


@router.get("/{workspace_id}/files/content")
async def read_workspace_file(workspace_id: str, path: str = Query(...)) -> dict[str, Any]:
    try:
        content = WorkspaceService.read_file(workspace_id, path)
        return {"path": path, "content": content}
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{workspace_id}/files")
async def write_workspace_file(workspace_id: str, req: FileWriteRequest) -> dict[str, Any]:
    try:
        WorkspaceService.write_file(workspace_id, req.path, req.content)
        return {"status": "ok", "path": req.path}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/{workspace_id}/files")
async def delete_workspace_file(workspace_id: str, path: str = Query(...)) -> dict[str, Any]:
    WorkspaceService.delete_file(workspace_id, path)
    return {"status": "ok", "deleted": path}


@router.post("/{workspace_id}/execute")
async def execute_in_sandbox(workspace_id: str, req: ExecuteRequest) -> dict[str, Any]:
    """Executes Python code or shell command inside the sandbox."""
    res = WorkspaceService.execute_in_workspace(
        workspace_id=workspace_id,
        command_or_python=req.command,
        is_python_code=req.is_python,
    )
    return res.to_dict()


@router.get("/{workspace_id}/export-zip")
async def export_workspace_zip(workspace_id: str) -> Response:
    zip_bytes = WorkspaceService.export_zip(workspace_id)
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=workspace_{workspace_id}.zip"},
    )


@router.post("/{workspace_id}/import-zip")
async def import_workspace_zip(workspace_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    content = await file.read()
    extracted = WorkspaceService.import_zip(workspace_id, content)
    return {"status": "ok", "extracted_count": len(extracted), "files": extracted}
