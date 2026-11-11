import io
import re
import shutil
import zipfile
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.sandbox.paths import secure_path_resolve
from app.sandbox.runner import SandboxResult, SandboxRunner


class WorkspaceService:
    @classmethod
    def get_workspace_dir(cls, workspace_id: str) -> Path:
        base = settings.storage.workspaces_dir
        base.mkdir(parents=True, exist_ok=True)
        # Validate workspace_id is alphanumeric + dash/underscore
        clean_id = re.sub(r"[^a-zA-Z0-9_\-]", "", workspace_id)
        ws_dir = base / clean_id
        ws_dir.mkdir(parents=True, exist_ok=True)
        return ws_dir

    @classmethod
    def list_files(cls, workspace_id: str) -> list[dict[str, Any]]:
        ws_dir = cls.get_workspace_dir(workspace_id)
        file_list: list[dict[str, Any]] = []

        for p in ws_dir.glob("**/*"):
            if p.is_file():
                rel_path = str(p.relative_to(ws_dir))
                file_list.append(
                    {
                        "path": rel_path,
                        "size_bytes": p.stat().st_size,
                        "extension": p.suffix.lstrip("."),
                    }
                )
        return file_list

    @classmethod
    def read_file(cls, workspace_id: str, relative_path: str) -> str:
        ws_dir = cls.get_workspace_dir(workspace_id)
        target = secure_path_resolve(ws_dir, relative_path)
        if not target.exists() or not target.is_file():
            raise FileNotFoundError(f"File '{relative_path}' not found in workspace.")
        return target.read_text(encoding="utf-8", errors="replace")

    @classmethod
    def write_file(cls, workspace_id: str, relative_path: str, content: str) -> None:
        ws_dir = cls.get_workspace_dir(workspace_id)
        target = secure_path_resolve(ws_dir, relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

    @classmethod
    def delete_file(cls, workspace_id: str, relative_path: str) -> None:
        ws_dir = cls.get_workspace_dir(workspace_id)
        target = secure_path_resolve(ws_dir, relative_path)
        if target.exists() and target.is_file():
            target.unlink()

    @classmethod
    def execute_in_workspace(
        cls,
        workspace_id: str,
        command_or_python: str,
        is_python_code: bool = False,
    ) -> SandboxResult:
        ws_dir = cls.get_workspace_dir(workspace_id)
        if is_python_code:
            return SandboxRunner.execute_python(command_or_python, cwd=ws_dir)
        return SandboxRunner.execute_shell(command_or_python, cwd=ws_dir)

    @classmethod
    def export_zip(cls, workspace_id: str) -> bytes:
        ws_dir = cls.get_workspace_dir(workspace_id)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in ws_dir.glob("**/*"):
                if p.is_file():
                    arcname = p.relative_to(ws_dir)
                    zf.write(p, arcname)
        buf.seek(0)
        return buf.getvalue()

    @classmethod
    def import_zip(cls, workspace_id: str, zip_bytes: bytes) -> list[str]:
        """Safely extracts zip archive strictly inside workspace with ZipSlip defense."""
        ws_dir = cls.get_workspace_dir(workspace_id)
        extracted_files: list[str] = []

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for member in zf.infolist():
                # Enforce no absolute paths or directory traversal in zip entry
                target_path = secure_path_resolve(ws_dir, member.filename)
                if member.is_dir():
                    target_path.mkdir(parents=True, exist_ok=True)
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as source, open(target_path, "wb") as dest:
                        shutil.copyfileobj(source, dest)
                    extracted_files.append(str(target_path.relative_to(ws_dir)))

        return extracted_files
