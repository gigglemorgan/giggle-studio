from __future__ import annotations

from app.agent.registry import ToolRegistry
from app.plugins.loader import PluginLoader


def test_plugin_discovery_and_manifests():
    plugins = PluginLoader.discover_plugins()
    ids = [p.id for p in plugins]

    assert "giggle.hello-tool" in ids
    assert "giggle.filesystem-notes" in ids
    assert "giggle.mcp-bridge" in ids

    hello_p = PluginLoader.get_plugin("giggle.hello-tool")
    assert hello_p is not None
    assert hello_p.author == "Sedat-gigglemorgan"
    assert len(hello_p.tools) == 1
    assert hello_p.tools[0].name == "hello_greet"


def test_plugin_load_tools():
    # Load all plugins
    PluginLoader.load_all()

    tool_greet = ToolRegistry.get("hello_greet")
    assert tool_greet is not None
    assert tool_greet.func("Giggle User") == "Hello, Giggle User! Welcome to Giggle Studio."

    tool_notes = ToolRegistry.get("save_note")
    assert tool_notes is not None

    tool_list = ToolRegistry.get("list_notes")
    assert tool_list is not None
