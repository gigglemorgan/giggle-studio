import os
import shutil
import time
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings
from app.core.logger import logger


class HuggingFaceService:
    """Manages Hugging Face Hub metadata queries and resumable GGUF downloads."""

    HF_API_BASE = "https://huggingface.co/api"

    @classmethod
    def get_token(cls) -> str | None:
        return os.environ.get("HF_TOKEN") or None

    @classmethod
    async def get_model_info(cls, repo_id: str) -> dict[str, Any]:
        """Fetches repository card, gating status, license, and available GGUF files."""
        headers = {}
        token = cls.get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"

        url = f"{cls.HF_API_BASE}/models/{repo_id}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 404:
                raise FileNotFoundError(f"Model repo '{repo_id}' not found on Hugging Face.")
            if resp.status_code == 401 or resp.status_code == 403:
                raise PermissionError(
                    "Gated model or authentication required. Please set HF_TOKEN in .env."
                )
            resp.raise_for_status()
            data = resp.json()

        # Extract files ending with .gguf
        siblings = data.get("siblings", [])
        gguf_files: list[dict[str, Any]] = []
        for s in siblings:
            rfilename = s.get("rfilename", "")
            if rfilename.lower().endswith(".gguf"):
                gguf_files.append(
                    {
                        "filename": rfilename,
                        "download_url": f"https://huggingface.co/{repo_id}/resolve/main/{rfilename}",
                    }
                )

        # License detection
        license_name = "unknown"
        tags = data.get("tags", [])
        for t in tags:
            if t.startswith("license:"):
                license_name = t.split("license:", 1)[1]
                break

        return {
            "repo_id": repo_id,
            "license": license_name,
            "private": data.get("private", False),
            "gated": data.get("gated", False),
            "downloads": data.get("downloads", 0),
            "likes": data.get("likes", 0),
            "gguf_files": gguf_files,
        }

    @classmethod
    async def download_file_stream(
        cls,
        repo_id: str,
        filename: str,
        target_dir: Path | None = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Streams progress updates for downloading a GGUF file with disk space pre-check and resume support."""
        dest_dir = target_dir or settings.storage.models_dir
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / filename
        part_path = dest_dir / f"{filename}.part"

        # Check existing bytes for resumption
        downloaded_bytes = part_path.stat().st_size if part_path.exists() else 0

        headers = {}
        token = cls.get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if downloaded_bytes > 0:
            headers["Range"] = f"bytes={downloaded_bytes}-"

        download_url = f"https://huggingface.co/{repo_id}/resolve/main/{filename}"

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            async with client.stream("GET", download_url, headers=headers) as resp:
                if resp.status_code not in (200, 206):
                    raise RuntimeError(f"Download failed with HTTP {resp.status_code}: {resp.text}")

                content_len = resp.headers.get("Content-Length")
                total_bytes = (int(content_len) + downloaded_bytes) if content_len else None

                # Pre-check free disk space
                total, used, free = shutil.disk_usage(dest_dir)
                if total_bytes and (free < total_bytes * 1.05):
                    raise RuntimeError(
                        f"Yetersiz disk alanı! Gerekli: {round(total_bytes / (1024**3), 2)} GB, Boş: {round(free / (1024**3), 2)} GB"
                    )

                mode = "ab" if downloaded_bytes > 0 else "wb"
                start_time = time.time()
                last_emit = start_time
                bytes_in_interval = 0

                with open(part_path, mode) as f:
                    async for chunk in resp.aiter_bytes(chunk_size=1024 * 1024):  # 1 MB chunks
                        f.write(chunk)
                        downloaded_bytes += len(chunk)
                        bytes_in_interval += len(chunk)

                        now = time.time()
                        if now - last_emit >= 0.5:  # Update progress twice per second
                            speed = bytes_in_interval / (now - last_emit)
                            eta_s = (
                                int((total_bytes - downloaded_bytes) / speed)
                                if (total_bytes and speed > 0)
                                else None
                            )
                            percent = (
                                round((downloaded_bytes / total_bytes) * 100, 1)
                                if total_bytes
                                else 0.0
                            )

                            yield {
                                "status": "downloading",
                                "filename": filename,
                                "downloaded_bytes": downloaded_bytes,
                                "total_bytes": total_bytes,
                                "percent": percent,
                                "speed_mb_s": round(speed / (1024 * 1024), 2),
                                "eta_seconds": eta_s,
                            }
                            last_emit = now
                            bytes_in_interval = 0

        # Rename .part to final destination
        part_path.rename(dest_path)
        logger.info("Downloaded %s successfully to %s", filename, dest_path)

        yield {
            "status": "completed",
            "filename": filename,
            "dest_path": str(dest_path.resolve()),
            "total_bytes": downloaded_bytes,
            "percent": 100.0,
        }
