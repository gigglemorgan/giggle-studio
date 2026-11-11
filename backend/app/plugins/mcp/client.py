from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from app.agent.registry import AgentTool, RiskLevel, ToolRegistry

logger = logging.getLogger("giggle.mcp.client")


class MCPClient:
    """JSON-RPC 2.0 client communicating with external MCP servers over stdio."""

    def __init__(
        self,
        server_id: str,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
    ) -> None:
        self.server_id = server_id
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.process: asyncio.subprocess.Process | None = None
        self._msg_id = 0
        self._pending_responses: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._listen_task: asyncio.Task[None] | None = None
        self.discovered_tools: list[dict[str, Any]] = []

    async def connect(self) -> bool:
        """Spawns MCP server subprocess and performs initialization handshake."""
        try:
            cmd = [self.command, *self.args]
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=self.env or None,
            )
            self._listen_task = asyncio.create_task(self._listen_stdout())

            # Send initialize request
            init_res = await self._send_request(
                "initialize",
                {
                    "protocolVersion": "2024-11-05",
                    "clientInfo": {"name": "GiggleStudio", "version": "0.1.0"},
                    "capabilities": {"tools": {}},
                },
            )
            logger.info("MCP server '%s' initialized: %s", self.server_id, init_res)

            # Send initialized notification
            await self._send_notification("notifications/initialized", {})

            # Discover tools
            await self.refresh_tools()
            return True
        except Exception as e:
            logger.error("Failed to connect to MCP server '%s': %s", self.server_id, e)
            await self.disconnect()
            return False

    async def _send_request(
        self, method: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if not self.process or not self.process.stdin:
            raise RuntimeError("MCP process is not running.")

        self._msg_id += 1
        req_id = self._msg_id
        payload = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method,
            "params": params or {},
        }

        loop = asyncio.get_running_loop()
        future: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending_responses[req_id] = future

        line = json.dumps(payload) + "\n"
        self.process.stdin.write(line.encode("utf-8"))
        await self.process.stdin.drain()

        return await asyncio.wait_for(future, timeout=15.0)

    async def _send_notification(self, method: str, params: dict[str, Any] | None = None) -> None:
        if not self.process or not self.process.stdin:
            return
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
        }
        line = json.dumps(payload) + "\n"
        self.process.stdin.write(line.encode("utf-8"))
        await self.process.stdin.drain()

    async def _listen_stdout(self) -> None:
        if not self.process or not self.process.stdout:
            return

        while True:
            line_bytes = await self.process.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
                req_id = msg.get("id")
                if req_id is not None and req_id in self._pending_responses:
                    future = self._pending_responses.pop(req_id)
                    if "error" in msg:
                        future.set_exception(RuntimeError(msg["error"].get("message", "MCP error")))
                    else:
                        future.set_result(msg.get("result", {}))
            except Exception as e:
                logger.warning("Error parsing MCP stdout line: %s", e)

    async def refresh_tools(self) -> list[dict[str, Any]]:
        """Queries tools/list and registers discovered tools with Giggle Agent ToolRegistry."""
        res = await self._send_request("tools/list", {})
        raw_tools = res.get("tools", [])
        self.discovered_tools = raw_tools

        for t in raw_tools:
            name = t.get("name")
            desc = t.get("description", "")
            input_schema = t.get("inputSchema", {})

            # Infer risk level
            risk = RiskLevel.SAFE
            name_lower = name.lower()
            if any(k in name_lower for k in ("exec", "run", "bash", "cmd", "shell")):
                risk = RiskLevel.EXEC
            elif any(k in name_lower for k in ("write", "create", "delete", "edit", "save")):
                risk = RiskLevel.WRITE
            elif any(k in name_lower for k in ("fetch", "http", "api", "send")):
                risk = RiskLevel.NETWORK

            # Create closure for invocation
            async def make_invoker(mcp_tool_name: str) -> Any:
                async def invoke_mcp(**kwargs: Any) -> Any:
                    return await self.call_tool(mcp_tool_name, kwargs)

                return invoke_mcp

            invoker = await make_invoker(name)
            agent_tool = AgentTool(
                name=f"mcp_{self.server_id}_{name}",
                description=f"[MCP:{self.server_id}] {desc}",
                risk_level=risk,
                func=invoker,
                parameters=input_schema,
                is_async=True,
            )
            ToolRegistry.register_tool(agent_tool)

        return self.discovered_tools

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        res = await self._send_request("tools/call", {"name": name, "arguments": arguments})
        return res.get("content", res)

    async def disconnect(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None

        if self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=2.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None
        self._pending_responses.clear()
