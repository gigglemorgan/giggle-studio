from __future__ import annotations

from pathlib import Path

from app.re.dynamic import DynamicAnalyzer
from app.re.quarantine import QuarantineStore


def test_dynamic_quarantined_execution():
    fixture_path = Path("backend/tests/fixtures/binaries/hello")
    if not fixture_path.exists():
        return

    # Quarantine sample first
    meta = QuarantineStore.store_sample(fixture_path.read_bytes(), original_filename="hello")
    sha256 = meta["sha256"]

    # Run in ultra-isolated bubblewrap sandbox
    res = DynamicAnalyzer.execute_quarantined_sample(sha256, timeout_seconds=3)

    assert res["exit_code"] == 0
    assert "Giggle Studio RE Fixture - Hello World" in res["stdout"]
    assert res["network_isolated"] is True
    assert res["timed_out"] is False
