from __future__ import annotations

from enum import StrEnum
from typing import Any

from app.agent.registry import AgentTool, RiskLevel


class ApprovalMode(StrEnum):
    STRICT = "strict"  # Requires approval for write, exec, network
    BALANCED = "balanced"  # Safe auto, write auto, exec/network require approval
    AUTONOMOUS = "autonomous"  # Safe, write, exec auto (in sandbox); network requires approval


class PolicyEngine:
    """Enforces human-in-the-loop policies based on tool risk and execution arguments."""

    @staticmethod
    def requires_approval(
        tool: AgentTool,
        mode: ApprovalMode | str = ApprovalMode.BALANCED,
        arguments: dict[str, Any] | None = None,
    ) -> tuple[bool, str]:
        """
        Determines whether tool invocation needs explicit human approval before running.
        Returns: (needs_approval, rationale_message)
        """
        if isinstance(mode, str):
            try:
                mode = ApprovalMode(mode)
            except ValueError:
                mode = ApprovalMode.BALANCED

        # Safe tools never require approval
        if tool.risk_level == RiskLevel.SAFE:
            return False, ""

        if mode == ApprovalMode.STRICT:
            return (
                True,
                f"Strict policy active: '{tool.name}' ({tool.risk_level.value}) requires explicit human approval.",
            )

        if mode == ApprovalMode.BALANCED:
            if tool.risk_level in (RiskLevel.EXEC, RiskLevel.NETWORK):
                return (
                    True,
                    f"'{tool.name}' executes code/commands or accesses network ({tool.risk_level.value}) - human authorization required.",
                )
            return False, ""

        if mode == ApprovalMode.AUTONOMOUS:
            if tool.risk_level == RiskLevel.NETWORK:
                return (
                    True,
                    f"'{tool.name}' accesses external network or services - human authorization required.",
                )
            return False, ""

        return True, f"Default policy requires authorization for {tool.risk_level.value} actions."
