import os
import resource
import shutil
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

from app.core.config import settings


class SandboxResult:
    def __init__(
        self,
        stdout: str,
        stderr: str,
        exit_code: int,
        duration_ms: int,
        isolation_level: str,
        timed_out: bool = False,
        output_capped: bool = False,
    ):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_code = exit_code
        self.duration_ms = duration_ms
        self.isolation_level = isolation_level
        self.timed_out = timed_out
        self.output_capped = output_capped

    def to_dict(self) -> dict[str, Any]:
        return {
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
            "isolation_level": self.isolation_level,
            "timed_out": self.timed_out,
            "output_capped": self.output_capped,
            "success": self.exit_code == 0 and not self.timed_out,
        }


class SandboxRunner:
    """Executes code and commands inside an isolated environment (Bubblewrap / unshare / rlimit)."""

    SCRUB_ENV_VARS = [
        "HF_TOKEN",
        "GIGGLE_SECRET_KEY",
        "GIGGLE_GMAIL_CLIENT_SECRET",
        "GIGGLE_GMAIL_CLIENT_ID",
        "AWS_SECRET_ACCESS_KEY",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
    ]

    @classmethod
    def get_isolation_backend(cls) -> str:
        """Determines active isolation backend based on host capability."""
        if shutil.which("bwrap"):
            return "bwrap"
        if shutil.which("unshare"):
            return "unshare"
        return "rlimit"

    @classmethod
    def _get_clean_env(cls) -> dict[str, str]:
        env = os.environ.copy()
        for var in cls.SCRUB_ENV_VARS:
            env.pop(var, None)
        # Add basic safe PATH
        env["PATH"] = "/usr/local/bin:/usr/bin:/bin"
        env["PYTHONUNBUFFERED"] = "1"
        return env

    @classmethod
    def execute(
        cls,
        cmd_args: list[str],
        cwd: Path,
        timeout_seconds: int | None = None,
        max_output_bytes: int | None = None,
        allow_network: bool = False,
    ) -> SandboxResult:
        """Executes a command strictly isolated to cwd."""
        cwd_resolved = Path(cwd).resolve()
        cwd_resolved.mkdir(parents=True, exist_ok=True)

        timeout = timeout_seconds or settings.sandbox.timeout_seconds
        max_bytes = max_output_bytes or settings.sandbox.max_output_bytes
        backend = cls.get_isolation_backend()

        wrapped_cmd: list[str] = []
        if backend == "bwrap":
            wrapped_cmd = [
                "/usr/bin/bwrap",
                "--ro-bind",
                "/",
                "/",
                "--dev",
                "/dev",
                "--proc",
                "/proc",
                "--tmpfs",
                "/tmp",
                "--dir",
                str(cwd_resolved),
                "--bind",
                str(cwd_resolved),
                str(cwd_resolved),
                "--chdir",
                str(cwd_resolved),
                "--die-with-parent",
                "--unshare-pid",
                "--unshare-ipc",
                "--unshare-uts",
            ]
            if not allow_network:
                wrapped_cmd.append("--unshare-net")
            wrapped_cmd.extend(cmd_args)

        elif backend == "unshare":
            wrapped_cmd = ["/usr/bin/unshare"]
            if not allow_network:
                wrapped_cmd.append("-n")
            wrapped_cmd.extend(["-p", "-f", "--mount-proc"])
            wrapped_cmd.extend(cmd_args)
        else:
            wrapped_cmd = list(cmd_args)

        start_time = time.time()
        env = cls._get_clean_env()

        def set_rlimits() -> None:
            # Set process group for clean subtree kill
            os.setpgrp()
            # Max 1GB virtual memory limit
            resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
            # Max CPU time with safety margin
            resource.setrlimit(resource.RLIMIT_CPU, (timeout + 5, timeout + 10))
            # Max file size 50 MB
            resource.setrlimit(resource.RLIMIT_FSIZE, (50 * 1024 * 1024, 50 * 1024 * 1024))

        timed_out = False
        output_capped = False
        stdout_bytes = bytearray()
        stderr_bytes = bytearray()

        try:
            proc = subprocess.Popen(
                wrapped_cmd,
                cwd=str(cwd_resolved),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                preexec_fn=set_rlimits,
                env=env,
            )

            # Read with timeout and size cap
            try:
                raw_out, raw_err = proc.communicate(timeout=timeout)
                stdout_bytes.extend(raw_out)
                stderr_bytes.extend(raw_err)
                exit_code = proc.returncode
            except subprocess.TimeoutExpired:
                timed_out = True
                # Kill process group
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except Exception:
                    pass
                proc.communicate()
                exit_code = -9

        except Exception as e:
            return SandboxResult(
                stdout="",
                stderr=f"Sandbox execution setup error: {e}",
                exit_code=1,
                duration_ms=0,
                isolation_level=backend,
            )

        duration_ms = int((time.time() - start_time) * 1000)

        # Cap output
        if len(stdout_bytes) > max_bytes:
            stdout_bytes = stdout_bytes[:max_bytes]
            output_capped = True
        if len(stderr_bytes) > max_bytes:
            stderr_bytes = stderr_bytes[:max_bytes]
            output_capped = True

        out_str = stdout_bytes.decode("utf-8", errors="replace")
        err_str = stderr_bytes.decode("utf-8", errors="replace")

        if timed_out:
            err_str += f"\n[Process killed: execution exceeded wall-clock timeout of {timeout}s]"
        if output_capped:
            out_str += f"\n[Output truncated: exceeded maximum output limit of {max_bytes} bytes]"

        return SandboxResult(
            stdout=out_str,
            stderr=err_str,
            exit_code=exit_code,
            duration_ms=duration_ms,
            isolation_level=backend,
            timed_out=timed_out,
            output_capped=output_capped,
        )

    @classmethod
    def execute_python(
        cls,
        code: str,
        cwd: Path,
        timeout_seconds: int | None = None,
    ) -> SandboxResult:
        """Writes Python script into isolated workspace and executes it."""
        script_path = cwd / "main.py"
        script_path.write_text(code, encoding="utf-8")
        return cls.execute(
            ["/usr/bin/python3", "main.py"], cwd=cwd, timeout_seconds=timeout_seconds
        )

    @classmethod
    def execute_shell(
        cls,
        command: str,
        cwd: Path,
        timeout_seconds: int | None = None,
    ) -> SandboxResult:
        """Executes a bash shell command inside the sandbox."""
        return cls.execute(
            ["/usr/bin/bash", "-c", command], cwd=cwd, timeout_seconds=timeout_seconds
        )
