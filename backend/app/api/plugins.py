from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.db.models.entities import MCPServerModel
from app.db.session import AsyncSessionLocal
from app.plugins.loader import PluginLoader
from app.plugins.mcp.client import MCPClient

router = APIRouter(prefix="/plugins", tags=["Plugins & MCP"])

# Active MCP client connections in memory
_active_mcp_clients: dict[str, MCPClient] = {}


class TogglePluginRequest(BaseModel):
    enabled: bool


class CreateMCPServerRequest(BaseModel):
    name: str
    transport: str = "stdio"  # "stdio" or "sse"
    command_or_url: str
    env: dict[str, str] = Field(default_factory=dict)


@router.get("")
async def list_plugins() -> list[dict[str, Any]]:
    manifests = PluginLoader.discover_plugins()
    return [
        {
            "id": m.id,
            "name": m.name,
            "version": m.version,
            "description": m.description,
            "author": m.author,
            "permissions": m.permissions,
            "tools_count": len(m.tools),
            "enabled": PluginLoader.is_enabled(m.id),
        }
        for m in manifests
    ]


@router.post("/{plugin_id}/toggle")
async def toggle_plugin(plugin_id: str, req: TogglePluginRequest) -> dict[str, Any]:
    manifest = PluginLoader.get_plugin(plugin_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="Plugin not found")

    PluginLoader.set_enabled(plugin_id, req.enabled)
    return {"id": plugin_id, "enabled": req.enabled}


@router.get("/mcp/servers")
async def list_mcp_servers() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(MCPServerModel))
        servers = res.scalars().all()
        return [
            {
                "id": s.id,
                "name": s.name,
                "transport": s.transport,
                "command_or_url": s.command_or_url,
                "enabled": s.enabled,
                "status": s.status,
                "connected": s.id in _active_mcp_clients,
            }
            for s in servers
        ]


@router.post("/mcp/servers")
async def create_mcp_server(req: CreateMCPServerRequest) -> dict[str, Any]:
    server_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        new_srv = MCPServerModel(
            id=server_id,
            name=req.name,
            transport=req.transport,
            command_or_url=req.command_or_url,
            env_json=req.env,
            enabled=True,
            status="configured",
        )
        db.add(new_srv)
        await db.commit()

    return {
        "id": server_id,
        "name": req.name,
        "transport": req.transport,
        "command_or_url": req.command_or_url,
        "enabled": True,
        "status": "configured",
    }


@router.post("/mcp/servers/{server_id}/connect")
async def connect_mcp_server(server_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(MCPServerModel).where(MCPServerModel.id == server_id))
        srv = res.scalars().first()
        if not srv:
            raise HTTPException(status_code=404, detail="MCP server not found")

        # Split command
        parts = srv.command_or_url.split()
        cmd = parts[0]
        args = parts[1:] if len(parts) > 1 else []
        env = srv.env_json or {}

        client = MCPClient(server_id=server_id, command=cmd, args=args, env=env)
        ok = await client.connect()
        if not ok:
            srv.status = "error"
            await db.commit()
            raise HTTPException(status_code=502, detail="Failed to connect to MCP server")

        _active_mcp_clients[server_id] = client
        srv.status = "connected"
        await db.commit()

        return {
            "status": "connected",
            "server_id": server_id,
            "tools": client.discovered_tools,
        }


@router.delete("/mcp/servers/{server_id}")
async def delete_mcp_server(server_id: str) -> dict[str, Any]:
    if server_id in _active_mcp_clients:
        client = _active_mcp_clients.pop(server_id)
        await client.disconnect()

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(MCPServerModel).where(MCPServerModel.id == server_id))
        srv = res.scalars().first()
        if srv:
            await db.delete(srv)
            await db.commit()

    return {"status": "deleted", "id": server_id}
