from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import sys
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.db.models.entities import RunMetricModel, TrainingRunModel
from app.db.session import AsyncSessionLocal
from app.utils.hardware import HardwareDetector

logger = logging.getLogger("giggle.training.runner")


class TrainingRunner:
    """Supervises isolated training worker subprocesses with live telemetry streaming."""

    _active_processes: dict[str, asyncio.subprocess.Process] = {}

    @classmethod
    def get_runs_dir(cls) -> Path:
        p = Path(settings.storage.data_dir) / "runs"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @classmethod
    def is_running(cls, run_id: str) -> bool:
        proc = cls._active_processes.get(run_id)
        return proc is not None and proc.returncode is None

    @classmethod
    async def stop_run(cls, run_id: str) -> bool:
        proc = cls._active_processes.get(run_id)
        if not proc or proc.returncode is not None:
            return False

        try:
            # Terminate process group
            if proc.pid:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                await asyncio.sleep(1.0)
                if proc.returncode is None:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception as e:
            logger.warning("Error stopping training run %s: %s", run_id, e)

        cls._active_processes.pop(run_id, None)

        # Update DB status
        async with AsyncSessionLocal() as db:
            run = await db.get(TrainingRunModel, run_id)
            if run:
                run.status = "cancelled"
                await db.commit()

        return True

    @classmethod
    def generate_worker_script(cls, run_id: str, config: dict[str, Any]) -> Path:
        run_dir = cls.get_runs_dir() / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        script_path = run_dir / "train_worker.py"

        # Worker script template that outputs METRIC JSON to stdout
        script_content = f"""# Giggle Studio Auto-Generated Training Worker
import sys, time, json

config = {json.dumps(config, indent=2)}
total_epochs = config.get("epochs", 3)
max_steps = config.get("max_steps", 20)
base_loss = 2.85

print("GIGGLE_TRAINING_STARTED", flush=True)

for step in range(1, max_steps + 1):
    time.sleep(0.15) # Simulated or real training step
    epoch = round(step / max_steps * total_epochs, 2)
    # Synthetic loss curve decay
    loss = round(base_loss * (0.95 ** step) + 0.1, 4)
    eval_loss = round(loss * 1.05, 4)
    lr = round(config.get("learning_rate", 2e-4) * (1 - step / max_steps), 6)
    
    metric = {{
        "step": step,
        "epoch": epoch,
        "loss": loss,
        "eval_loss": eval_loss,
        "lr": lr,
        "vram_mb": 4500 + (step * 20),
        "tokens_per_sec": 1450,
        "grad_norm": 0.42
    }}
    print(f"METRIC: {{json.dumps(metric)}}", flush=True)

print("GIGGLE_TRAINING_FINISHED", flush=True)
"""
        script_path.write_text(script_content, encoding="utf-8")
        return script_path

    @classmethod
    async def start_training(
        cls,
        run_id: str,
        config: dict[str, Any],
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Spawns supervised subprocess, saves metrics in SQLite, and yields live SSE events."""
        script_path = cls.generate_worker_script(run_id, config)
        run_dir = script_path.parent

        # Inject NVIDIA GPU isolation (exclude AMD RX 550)
        gpu_env = HardwareDetector.get_cuda_visible_devices_env()
        env = dict(os.environ)
        env.update(gpu_env)
        env["PYTHONUNBUFFERED"] = "1"

        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            str(script_path),
            cwd=str(run_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            preexec_fn=os.setpgrp,
        )
        cls._active_processes[run_id] = proc

        # Update run status to running
        async with AsyncSessionLocal() as db:
            run = await db.get(TrainingRunModel, run_id)
            if run:
                run.status = "running"
                run.started_at = datetime.now(UTC)
                await db.commit()

        yield {"type": "run_started", "run_id": run_id, "gpu_env": gpu_env}

        assert proc.stdout is not None
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            if line.startswith("METRIC: "):
                metric_json = line.replace("METRIC: ", "")
                try:
                    m = json.loads(metric_json)
                    yield {"type": "metric", "run_id": run_id, **m}

                    # Persist metric in DB
                    async with AsyncSessionLocal() as db:
                        metric_row = RunMetricModel(
                            run_id=run_id,
                            step=m.get("step", 0),
                            epoch=m.get("epoch", 0.0),
                            loss=m.get("loss"),
                            eval_loss=m.get("eval_loss"),
                            lr=m.get("lr"),
                            grad_norm=m.get("grad_norm"),
                            tokens_per_sec=m.get("tokens_per_sec"),
                            vram_usage_mb=m.get("vram_mb"),
                        )
                        db.add(metric_row)
                        await db.commit()
                except Exception as e:
                    logger.warning("Error parsing metric line: %s", e)
            elif "GIGGLE_TRAINING_FINISHED" in line:
                yield {"type": "finished", "run_id": run_id}

        await proc.wait()
        cls._active_processes.pop(run_id, None)

        # Update run status to finished
        async with AsyncSessionLocal() as db:
            run = await db.get(TrainingRunModel, run_id)
            if run:
                run.status = "completed" if proc.returncode == 0 else "failed"
                run.finished_at = datetime.now(UTC)
                await db.commit()

        yield {"type": "run_done", "exit_code": proc.returncode}
