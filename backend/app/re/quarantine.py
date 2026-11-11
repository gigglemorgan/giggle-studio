from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger("giggle.re.quarantine")


class QuarantineStore:
    """Manages secure, non-executable storage of untrusted binary samples."""

    @classmethod
    def get_quarantine_dir(cls) -> Path:
        p = Path(settings.storage.data_dir) / "quarantine"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @classmethod
    def store_sample(
        cls, file_bytes: bytes, original_filename: str = "sample.bin"
    ) -> dict[str, Any]:
        """
        Calculates cryptographic hashes, writes to quarantine under sha256 filename,
        and enforces chmod 0400 (read-only for owner, non-executable).
        """
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        md5 = hashlib.md5(file_bytes).hexdigest()
        sha1 = hashlib.sha1(file_bytes).hexdigest()

        qdir = cls.get_quarantine_dir()
        target_path = qdir / sha256

        # If already quarantined, it is already immutable and secured
        if target_path.exists():
            return {
                "sha256": sha256,
                "md5": md5,
                "sha1": sha1,
                "file_size": len(file_bytes),
                "original_filename": original_filename,
                "quarantine_filename": sha256,
                "is_quarantined_ro": True,
            }

        # Write bytes
        target_path.write_bytes(file_bytes)

        # Enforce strict 0400 (read-only, no write, NO EXECUTE)
        os.chmod(target_path, 0o400)
        logger.info("Sample quarantined: %s (size: %s bytes, mode: 0400)", sha256, len(file_bytes))

        return {
            "sha256": sha256,
            "md5": md5,
            "sha1": sha1,
            "file_size": len(file_bytes),
            "original_filename": original_filename,
            "quarantine_filename": sha256,
            "is_quarantined_ro": True,
        }

    @classmethod
    def read_sample_bytes(cls, sha256: str, offset: int = 0, length: int | None = None) -> bytes:
        target_path = cls.get_quarantine_dir() / sha256
        if not target_path.exists():
            raise FileNotFoundError(f"Quarantined sample '{sha256}' not found.")

        with target_path.open("rb") as f:
            if offset > 0:
                f.seek(offset)
            if length is not None:
                return f.read(length)
            return f.read()

    @classmethod
    def get_sample_path(cls, sha256: str) -> Path:
        target_path = cls.get_quarantine_dir() / sha256
        if not target_path.exists():
            raise FileNotFoundError(f"Quarantined sample '{sha256}' not found.")
        return target_path
