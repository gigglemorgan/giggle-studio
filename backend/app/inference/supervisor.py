import asyncio
import subprocess
import sys
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from app.core.errors import WorkerCrashException
from app.core.logger import logger
from app.inference.protocol import (
    WorkerCommand,
    WorkerResponse,
    parse_response,
    serialize_message,
)
from app.utils.hardware import HardwareDetector


class InferenceSupervisor:
    """Supervises the isolated worker process that runs LLM inference.
    Guarantees deterministic VRAM reclamation upon unload and handles automatic
    worker recovery on unexpected crashes.
    """

    def __init__(self) -> None:
        self.process: subprocess.Popen[str] | None = None
        self._lock = asyncio.Lock()
        self.current_model_path: str | None = None
        self.current_config: dict[str, Any] = {}

    def is_alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start_worker(self) -> None:
        if self.is_alive():
            return

        worker_script = Path(__file__).resolve().parent / "worker_process.py"
        # Isolate GPU environment strictly to resolved NVIDIA device
        env = HardwareDetector.get_cuda_visible_devices_env()
        # Add backend root to PYTHONPATH
        backend_dir = Path(__file__).resolve().parent.parent.parent
        env["PYTHONPATH"] = f"{backend_dir}:{env.get('PYTHONPATH', '')}"

        logger.info(
            "Spawning inference worker subprocess with CUDA_VISIBLE_DEVICES=%s...",
            env.get("CUDA_VISIBLE_DEVICES", "N/A"),
        )

        python_exec = sys.executable

        self.process = subprocess.Popen(
            [python_exec, str(worker_script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,  # Line-buffered
            env=env,
        )

        # Read ready handshake
        if self.process.stdout:
            ready_line = self.process.stdout.readline()
            if ready_line:
                try:
                    resp = parse_response(ready_line)
                    logger.info("Inference worker connected: %s", resp.data)
                except Exception as e:
                    logger.warning("Failed to parse ready line from worker: %s", e)

    def stop_worker(self) -> None:
        """Deterministically kills the worker subprocess and reclaims VRAM at the OS level."""
        if not self.process:
            return

        pid = self.process.pid
        logger.info("Stopping inference worker (PID: %s)...", pid)

        try:
            self.process.terminate()
            self.process.wait(timeout=2.0)
        except (subprocess.TimeoutExpired, Exception):
            logger.warning("Worker PID %s did not terminate gracefully, sending SIGKILL.", pid)
            try:
                self.process.kill()
                self.process.wait(timeout=2.0)
            except Exception:
                pass

        self.process = None
        self.current_model_path = None
        self.current_config = {}
        logger.info("Inference worker terminated. VRAM reclaimed.")

    async def load_model(self, model_path: str, config: dict[str, Any]) -> dict[str, Any]:
        async with self._lock:
            # Hot re-apply / clean reload: restart worker to guarantee clean memory
            self.stop_worker()
            self.start_worker()

            cmd = WorkerCommand(
                action="load",
                payload={"model_path": model_path, **config},
            )
            resp = await self._send_command(cmd)
            if resp.status == "error":
                raise RuntimeError(resp.error or "Model yükleme başarısız oldu.")

            self.current_model_path = model_path
            self.current_config = config
            return resp.data or {}

    async def unload_model(self) -> None:
        async with self._lock:
            self.stop_worker()

    async def generate_stream(
        self,
        prompt: str,
        sampling: dict[str, Any],
    ) -> AsyncGenerator[dict[str, Any], None]:
        async with self._lock:
            if not self.is_alive():
                raise WorkerCrashException("Inference worker process is not running.")

            cmd = WorkerCommand(
                action="generate",
                payload={"prompt": prompt, "sampling": sampling},
            )

            # Write command
            try:
                assert self.process and self.process.stdin and self.process.stdout
                self.process.stdin.write(serialize_message(cmd))
                self.process.stdin.flush()
            except Exception as e:
                self.stop_worker()
                raise WorkerCrashException(f"Failed to write to worker pipe: {e}") from e

            # Read stream
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, self.process.stdout.readline)
                if not line:
                    exit_code = self.process.poll()
                    raise WorkerCrashException(
                        f"Worker died during generation with exit code {exit_code}"
                    )

                resp = parse_response(line)
                if resp.status == "stream" and resp.data:
                    yield resp.data
                elif resp.status == "done":
                    break
                elif resp.status == "error":
                    raise RuntimeError(resp.error or "Çıkarım sırasında hata oluştu")

    async def _send_command(self, cmd: WorkerCommand) -> WorkerResponse:
        if not self.is_alive():
            self.start_worker()

        assert self.process and self.process.stdin and self.process.stdout

        try:
            self.process.stdin.write(serialize_message(cmd))
            self.process.stdin.flush()

            loop = asyncio.get_event_loop()
            line = await loop.run_in_executor(None, self.process.stdout.readline)
            if not line:
                exit_code = self.process.poll()
                raise WorkerCrashException(f"Worker exited unexpectedly with code {exit_code}")
            return parse_response(line)
        except Exception as e:
            self.stop_worker()
            raise WorkerCrashException(str(e)) from e

    def get_status(self) -> dict[str, Any]:
        return {
            "alive": self.is_alive(),
            "pid": self.process.pid if self.process else None,
            "current_model": self.current_model_path,
            "config": self.current_config,
        }


supervisor = InferenceSupervisor()
