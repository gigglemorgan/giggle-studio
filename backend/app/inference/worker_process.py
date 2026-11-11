import os
import sys
import traceback

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.inference.llama_backend import LlamaCppBackend
from app.inference.protocol import (
    WorkerResponse,
    parse_command,
    serialize_message,
)


def emit_response(resp: WorkerResponse) -> None:
    sys.stdout.write(serialize_message(resp))
    sys.stdout.flush()


def main() -> None:
    backend = LlamaCppBackend()
    emit_response(
        WorkerResponse(status="ok", data={"msg": "Worker process ready", "pid": os.getpid()})
    )

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break  # EOF, parent closed pipe

            cmd = parse_command(line)

            if cmd.action == "ping":
                emit_response(
                    WorkerResponse(status="ok", data={"pong": True, "info": backend.get_info()})
                )

            elif cmd.action == "load":
                model_path = cmd.payload.get("model_path")
                if not model_path:
                    emit_response(WorkerResponse(status="error", error="Missing model_path"))
                    continue

                load_res = backend.load(model_path, cmd.payload)
                emit_response(WorkerResponse(status="ok", data=load_res))

            elif cmd.action == "unload":
                backend.unload()
                emit_response(WorkerResponse(status="ok", data={"msg": "Unloaded"}))

            elif cmd.action == "generate":
                prompt = cmd.payload.get("prompt", "")
                sampling = cmd.payload.get("sampling", {})

                for chunk in backend.generate_stream(prompt, sampling):
                    emit_response(WorkerResponse(status="stream", data=chunk))

                emit_response(WorkerResponse(status="done"))

            elif cmd.action == "info":
                emit_response(WorkerResponse(status="ok", data=backend.get_info()))

            else:
                emit_response(WorkerResponse(status="error", error=f"Unknown action: {cmd.action}"))

        except Exception as e:
            tb = traceback.format_exc()
            emit_response(WorkerResponse(status="error", error=str(e), data={"traceback": tb}))


if __name__ == "__main__":
    main()
