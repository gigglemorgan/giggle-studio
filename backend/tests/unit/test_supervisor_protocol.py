from app.inference.protocol import (
    WorkerCommand,
    WorkerResponse,
    parse_command,
    parse_response,
    serialize_message,
)


def test_protocol_command_roundtrip():
    cmd = WorkerCommand(
        action="load",
        payload={"model_path": "/path/to/model.gguf", "n_gpu_layers": 32},
    )
    serialized = serialize_message(cmd)
    assert serialized.endswith("\n")
    parsed = parse_command(serialized)
    assert parsed.action == "load"
    assert parsed.payload["n_gpu_layers"] == 32


def test_protocol_response_roundtrip():
    resp = WorkerResponse(
        status="stream",
        data={"token": "hello", "stats": {"tps": 42.5}},
    )
    serialized = serialize_message(resp)
    parsed = parse_response(serialized)
    assert parsed.status == "stream"
    assert parsed.data["token"] == "hello"
    assert parsed.data["stats"]["tps"] == 42.5
