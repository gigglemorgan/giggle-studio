def get_mcp_bridge_status() -> dict:
    """Returns MCP bridge capabilities."""
    return {
        "status": "ready",
        "transports": ["stdio", "sse"],
        "version": "1.0.0",
    }
