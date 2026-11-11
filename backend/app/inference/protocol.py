from typing import Any

from pydantic import BaseModel


class WorkerCommand(BaseModel):
    action: str  # load | unload | generate | cancel | ping
    payload: dict[str, Any] = {}


class WorkerResponse(BaseModel):
    status: str  # ok | error | stream | done
    data: dict[str, Any] | None = None
    error: str | None = None


def serialize_message(obj: BaseModel) -> str:
    """Serializes a command or response into a single-line JSON string."""
    return obj.model_dump_json() + "\n"


def parse_command(line: str) -> WorkerCommand:
    return WorkerCommand.model_validate_json(line)


def parse_response(line: str) -> WorkerResponse:
    return WorkerResponse.model_validate_json(line)
