from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PluginToolDef(BaseModel):
    name: str
    description: str
    risk_level: str = "safe"
    parameters: dict[str, Any] = Field(default_factory=dict)


class PluginManifest(BaseModel):
    id: str
    name: str
    version: str
    description: str
    author: str = "Sedat-gigglemorgan"
    min_app_version: str = "0.1.0"
    entrypoint: str = "main.py"
    permissions: list[str] = Field(default_factory=list)
    tools: list[PluginToolDef] = Field(default_factory=list)
