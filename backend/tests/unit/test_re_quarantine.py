from __future__ import annotations

import os
import stat
from pathlib import Path

from app.re.quarantine import QuarantineStore


def test_quarantine_store_permissions(tmp_path: Path):
    dummy_bytes = b"\x7fELF\x02\x01\x01\x00" + b"A" * 64
    meta = QuarantineStore.store_sample(dummy_bytes, original_filename="test.elf")

    sha256 = meta["sha256"]
    assert len(sha256) == 64
    assert meta["file_size"] == len(dummy_bytes)

    sample_path = QuarantineStore.get_sample_path(sha256)
    assert sample_path.exists()

    # Check file mode permissions: must be read-only by owner (0400), not executable
    mode = stat.S_IMODE(os.stat(sample_path).st_mode)
    assert mode == 0o400
    assert not (mode & stat.S_IXUSR)  # NOT executable by user
    assert not (mode & stat.S_IWUSR)  # NOT writable by user

    # Read bytes
    read_back = QuarantineStore.read_sample_bytes(sha256, offset=0, length=4)
    assert read_back == b"\x7fELF"
