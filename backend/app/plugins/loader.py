from __future__ import annotations

import json
import logging
from pathlib import Path

from app.agent.registry import AgentTool, RiskLevel, ToolRegistry
from app.core.config import settings
from app.plugins.manifest import PluginManifest

logger = logging.getLogger("giggle.plugins.loader")


class PluginLoader:
    """Discovers, validates, and loads Giggle Studio plugins."""

    _manifests: dict[str, PluginManifest] = {}
    _enabled: dict[str, bool] = {}

    @classmethod
    def get_plugins_dir(cls) -> Path:
        p = Path("./plugins")
        if not p.exists():
            p.mkdir(parents=True, exist_ok=True)
        return p

    @classmethod
    def discover_plugins(cls) -> list[PluginManifest]:
        plugins_dir = cls.get_plugins_dir()
        cls._manifests.clear()

        for manifest_file in plugins_dir.glob("*/plugin.json"):
            try:
                data = json.loads(manifest_file.read_text(encoding="utf-8"))
                manifest = PluginManifest.model_validate(data)
                cls._manifests[manifest.id] = manifest
                if manifest.id not in cls._enabled:
                    cls._enabled[manifest.id] = True
            except Exception as e:
                logger.error("Failed to parse plugin manifest %s: %s", manifest_file, e)

        return list(cls._manifests.values())

    @classmethod
    def get_plugin(cls, plugin_id: str) -> PluginManifest | None:
        if not cls._manifests:
            cls.discover_plugins()
        return cls._manifests.get(plugin_id)

    @classmethod
    def is_enabled(cls, plugin_id: str) -> bool:
        return cls._enabled.get(plugin_id, True)

    @classmethod
    def set_enabled(cls, plugin_id: str, enabled: bool) -> None:
        cls._enabled[plugin_id] = enabled
        if enabled:
            cls._load_single_plugin(plugin_id)
        else:
            cls._unload_single_plugin(plugin_id)

    @classmethod
    def load_all(cls) -> None:
        cls.discover_plugins()
        for p_id in cls._manifests:
            if cls.is_enabled(p_id):
                cls._load_single_plugin(p_id)

    @classmethod
    def _load_single_plugin(cls, plugin_id: str) -> None:
        manifest = cls._manifests.get(plugin_id)
        if not manifest:
            return

        # Register first-party tools defined by reference plugins
        if plugin_id == "giggle.hello-tool":

            def hello_greet(name: str = "World") -> str:
                return f"Hello, {name}! Welcome to Giggle Studio."

            tool = AgentTool(
                name="hello_greet",
                description="Returns a friendly greeting string.",
                risk_level=RiskLevel.SAFE,
                func=hello_greet,
                parameters={
                    "type": "object",
                    "properties": {"name": {"type": "string"}},
                    "required": [],
                },
            )
            ToolRegistry.register_tool(tool)

        elif plugin_id == "giggle.filesystem-notes":
            notes_dir = Path(settings.storage.data_dir) / "notes"
            notes_dir.mkdir(parents=True, exist_ok=True)

            def save_note(title: str, text: str) -> str:
                safe_title = "".join(c for c in title if c.isalnum() or c in ("-", "_")).strip()
                if not safe_title:
                    safe_title = "untitled"
                p = notes_dir / f"{safe_title}.md"
                p.write_text(text, encoding="utf-8")
                return f"Note saved to {p.name} ({len(text)} chars)"

            def list_notes() -> list[str]:
                return [f.name for f in notes_dir.glob("*.md")]

            ToolRegistry.register_tool(
                AgentTool(
                    name="save_note",
                    description="Saves a text note into the notes workspace.",
                    risk_level=RiskLevel.WRITE,
                    func=save_note,
                    parameters={
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "text": {"type": "string"},
                        },
                        "required": ["title", "text"],
                    },
                )
            )
            ToolRegistry.register_tool(
                AgentTool(
                    name="list_notes",
                    description="Lists existing markdown notes.",
                    risk_level=RiskLevel.SAFE,
                    func=list_notes,
                    parameters={"type": "object", "properties": {}},
                )
            )

    @classmethod
    def _unload_single_plugin(cls, plugin_id: str) -> None:
        # If unloaded, remove tools associated with it
        manifest = cls._manifests.get(plugin_id)
        if not manifest:
            return
        for tool_def in manifest.tools:
            if ToolRegistry.get(tool_def.name):
                del ToolRegistry._tools[tool_def.name]
