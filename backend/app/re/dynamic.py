from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any

from app.re.quarantine import QuarantineStore
from app.sandbox.runner import SandboxRunner

logger = logging.getLogger("giggle.re.dynamic")


class DynamicAnalyzer:
    """Executes quarantined samples in a locked-down Bubblewrap sandbox with zero network and timeout kill."""

    @classmethod
    def execute_quarantined_sample(
        cls,
        sha256: str,
        args: list[str] | None = None,
        timeout_seconds: int = 5,
    ) -> dict[str, Any]:
        sample_path = QuarantineStore.get_sample_path(sha256)

        # Create temporary disposable workspace
        with tempfile.TemporaryDirectory(prefix="giggle_re_dyn_") as tmp_dir:
            tmp_path = Path(tmp_dir)
            target_bin = tmp_path / "sample.bin"
            target_bin.write_bytes(sample_path.read_bytes())
            target_bin.chmod(0o700)  # Executable only inside transient sandbox

            cmd = [str(target_bin), *(args or [])]
            res = SandboxRunner.execute(
                cmd_args=cmd,
                cwd=tmp_path,
                timeout_seconds=timeout_seconds,
                allow_network=False,  # Strict network isolation
            )

            return {
                "sha256": sha256,
                "exit_code": res.exit_code,
                "stdout": res.stdout,
                "stderr": res.stderr,
                "duration_ms": round(res.duration_ms, 2),
                "timed_out": res.timed_out,
                "network_isolated": True,
            }
