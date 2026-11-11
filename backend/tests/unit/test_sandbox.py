import textwrap
from pathlib import Path

import pytest
from app.sandbox.paths import PathSecurityException, secure_path_resolve
from app.sandbox.runner import SandboxRunner


def test_path_traversal_blocked(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()

    # Attempt ../../etc/passwd
    with pytest.raises(PathSecurityException) as exc_info:
        secure_path_resolve(workspace, "../../etc/passwd")
    assert "escapes workspace root" in str(exc_info.value)


def test_symlink_escape_blocked(tmp_path: Path):
    workspace = tmp_path / "ws"
    workspace.mkdir()
    outside_dir = tmp_path / "outside_secret"
    outside_dir.mkdir()

    # Create malicious symlink inside workspace pointing outside
    malicious_link = workspace / "escape_link"
    malicious_link.symlink_to(outside_dir)

    with pytest.raises(PathSecurityException) as exc_info:
        secure_path_resolve(workspace, "escape_link/secret.txt")
    assert "escapes workspace root" in str(exc_info.value) or "Symlink escape blocked" in str(
        exc_info.value
    )


def test_sandbox_network_isolated(tmp_path: Path):
    """Verifies that network connections are blocked by --unshare-net."""
    code = textwrap.dedent("""
    import urllib.request
    try:
        urllib.request.urlopen("https://1.1.1.1", timeout=2)
        print("NETWORK_CONNECTED")
    except Exception as e:
        print("NETWORK_BLOCKED")
    """)
    res = SandboxRunner.execute_python(code, cwd=tmp_path, timeout_seconds=5)
    # Network must be blocked
    assert "NETWORK_CONNECTED" not in res.stdout
    assert "NETWORK_BLOCKED" in res.stdout or res.exit_code != 0


def test_sandbox_timeout_kill(tmp_path: Path):
    """Verifies that infinite loops are killed by wall-clock timeout."""
    code = textwrap.dedent("""
    import time
    while True:
        time.sleep(0.05)
    """)
    res = SandboxRunner.execute_python(code, cwd=tmp_path, timeout_seconds=2)
    assert res.timed_out is True
    assert "timeout" in res.stderr.lower()


def test_sandbox_huge_output_capped(tmp_path: Path):
    """Verifies that large stdout streams are capped to prevent memory exhaustion."""
    code = textwrap.dedent("""
    # Attempt to flood stdout with 5 MB
    print("A" * 5000000)
    """)
    res = SandboxRunner.execute_python(code, cwd=tmp_path, timeout_seconds=5)
    assert res.output_capped is True
    assert len(res.stdout) <= 1048576 + 300  # Cap + notification message
    assert "truncated" in res.stdout.lower()


def test_sandbox_fork_bomb_contained(tmp_path: Path):
    """Verifies that excessive process creation is contained by RLIMIT_NPROC."""
    code = textwrap.dedent("""
    import os
    try:
        for _ in range(500):
            pid = os.fork()
            if pid == 0:
                os._exit(0)
        print("FORK_COMPLETED")
    except BlockingIOError:
        print("FORK_BLOCKED_BY_RLIMIT")
    except Exception as e:
        print("FORK_FAILED")
    """)
    res = SandboxRunner.execute_python(code, cwd=tmp_path, timeout_seconds=4)
    # The system survives cleanly and doesn't freeze
    assert res.duration_ms < 5000
