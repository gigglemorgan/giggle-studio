from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest
from app.plugins.mcp.client import MCPClient


@pytest.mark.asyncio
async def test_mcp_client_handshake_and_tools(tmp_path: Path):
    server_script = tmp_path / "mock_mcp_server.py"
    server_script.write_text(
        textwrap.dedent("""
        import sys, json

        for line in sys.stdin:
            if not line.strip():
                continue
            req = json.loads(line)
            method = req.get("method")
            msg_id = req.get("id")

            if method == "initialize":
                resp = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "serverInfo": {"name": "mock-mcp", "version": "1.0"},
                        "capabilities": {"tools": {}}
                    }
                }
                sys.stdout.write(json.dumps(resp) + "\\n")
                sys.stdout.flush()
            elif method == "notifications/initialized":
                pass
            elif method == "tools/list":
                resp = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "tools": [
                            {
                                "name": "echo",
                                "description": "Echoes back input",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {"msg": {"type": "string"}},
                                    "required": ["msg"]
                                }
                            }
                        ]
                    }
                }
                sys.stdout.write(json.dumps(resp) + "\\n")
                sys.stdout.flush()
            elif method == "tools/call":
                params = req.get("params", {})
                args = params.get("arguments", {})
                resp = {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "content": f"Echo: {args.get('msg')}"
                    }
                }
                sys.stdout.write(json.dumps(resp) + "\\n")
                sys.stdout.flush()
        """),
        encoding="utf-8",
    )

    client = MCPClient(
        server_id="test_mock",
        command=sys.executable,
        args=[str(server_script)],
    )

    connected = await client.connect()
    assert connected is True
    assert len(client.discovered_tools) == 1
    assert client.discovered_tools[0]["name"] == "echo"

    # Call tool
    res = await client.call_tool("echo", {"msg": "Hello MCP!"})
    assert res == "Echo: Hello MCP!"

    await client.disconnect()
