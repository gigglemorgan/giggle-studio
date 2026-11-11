from __future__ import annotations

import inspect
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class RiskLevel(StrEnum):
    SAFE = "safe"  # Read-only operations, queries, pure computations
    WRITE = "write"  # Modifies files, workspace state
    EXEC = "exec"  # Executes arbitrary code, commands, binaries
    NETWORK = "network"  # Network calls, external API access, email sending


@dataclass
class ToolParameter:
    name: str
    type_str: str
    description: str
    required: bool = True
    default: Any = None


@dataclass
class AgentTool:
    name: str
    description: str
    risk_level: RiskLevel
    func: Callable[..., Any]
    parameters: dict[str, Any] = field(default_factory=dict)
    is_async: bool = False

    def to_schema(self) -> dict[str, Any]:
        """Returns JSON schema representation suitable for LLM tool calling."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": f"[{self.risk_level.upper()}] {self.description}",
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    """Central registry of executable agent tools."""

    _tools: dict[str, AgentTool] = {}

    @classmethod
    def register(
        cls,
        name: str,
        description: str,
        risk_level: RiskLevel = RiskLevel.SAFE,
        parameters: dict[str, Any] | None = None,
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        """Decorator to register a function as an agent tool."""

        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            is_async = inspect.iscoroutinefunction(func)
            schema_params = parameters
            if schema_params is None:
                # Infer basic JSON schema from type hints
                sig = inspect.signature(func)
                properties: dict[str, Any] = {}
                required: list[str] = []
                for p_name, param in sig.parameters.items():
                    if p_name in ("self", "cls"):
                        continue
                    p_type = "string"
                    if param.annotation is int:
                        p_type = "integer"
                    elif param.annotation is float:
                        p_type = "number"
                    elif param.annotation is bool:
                        p_type = "boolean"
                    elif param.annotation in (dict, dict):
                        p_type = "object"
                    elif param.annotation in (list, list):
                        p_type = "array"

                    properties[p_name] = {"type": p_type}
                    if param.default is inspect.Parameter.empty:
                        required.append(p_name)

                schema_params = {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                }

            cls._tools[name] = AgentTool(
                name=name,
                description=description,
                risk_level=risk_level,
                func=func,
                parameters=schema_params,
                is_async=is_async,
            )
            return func

        return decorator

    @classmethod
    def register_tool(cls, tool: AgentTool) -> None:
        cls._tools[tool.name] = tool

    @classmethod
    def get(cls, name: str) -> AgentTool | None:
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> list[AgentTool]:
        return list(cls._tools.values())

    @classmethod
    def get_schemas(cls) -> list[dict[str, Any]]:
        return [t.to_schema() for t in cls._tools.values()]

    @classmethod
    async def invoke(cls, name: str, arguments: dict[str, Any]) -> Any:
        tool = cls._tools.get(name)
        if not tool:
            raise ValueError(f"Tool '{name}' is not registered.")

        if tool.is_async:
            return await tool.func(**arguments)
        return tool.func(**arguments)

    @classmethod
    def clear(cls) -> None:
        cls._tools.clear()
