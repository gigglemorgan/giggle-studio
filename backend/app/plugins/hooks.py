from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("giggle.plugins.hooks")


class HookDispatcher:
    """Manages lifecycle hooks executed by active plugins."""

    _hooks: dict[str, list[Callable[..., Any]]] = {
        "on_load": [],
        "on_chat_message": [],
        "before_tool_call": [],
    }

    @classmethod
    def register_hook(cls, event: str, callback: Callable[..., Any]) -> None:
        if event not in cls._hooks:
            cls._hooks[event] = []
        cls._hooks[event].append(callback)

    @classmethod
    async def dispatch(cls, event: str, *args: Any, **kwargs: Any) -> list[Any]:
        results: list[Any] = []
        for callback in cls._hooks.get(event, []):
            try:
                res = callback(*args, **kwargs)
                results.append(res)
            except Exception as e:
                logger.error("Error executing hook for event '%s': %s", event, e)
        return results

    @classmethod
    def clear(cls) -> None:
        for k in cls._hooks:
            cls._hooks[k].clear()
