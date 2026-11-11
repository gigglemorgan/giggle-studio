from __future__ import annotations

import json
import re
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import app.agent.tools.builtin  # noqa: F401 - ensures builtins are registered
from app.agent.injection import InjectionDefense
from app.agent.policy import PolicyEngine
from app.agent.registry import ToolRegistry
from app.db.models.entities import AgentSessionModel, AgentStepModel
from app.db.session import AsyncSessionLocal
from app.inference.supervisor import supervisor
from sqlalchemy import select


class AgentLoop:
    """Executes the autonomous Plan -> Tool -> Observe -> Reflect loop."""

    @classmethod
    def _build_system_prompt(cls, workspace_id: str) -> str:
        tools = ToolRegistry.list_tools()
        tools_summary = []
        for t in tools:
            tools_summary.append(f"- `{t.name}` ({t.risk_level.value}): {t.description}")

        tools_str = "\n".join(tools_summary)
        injection_directives = InjectionDefense.SYSTEM_DEFENSE_PROMPT

        return f"""You are the Giggle Studio Autonomous Agent.
Workspace ID: {workspace_id}

{injection_directives}

AVAILABLE TOOLS:
{tools_str}

RESPONSE PROTOCOL:
You MUST respond with a single JSON object in every turn. Do NOT include any markdown code fence around the JSON or conversational text outside it.
Choose ONE of the following two schemas:

1. To call a tool:
{{
  "thought": "Your step-by-step reasoning about what to do next",
  "tool": "tool_name",
  "args": {{"param1": "value1"}}
}}

2. To finish the task:
{{
  "thought": "Summary of what was achieved and verified",
  "final_answer": "Detailed answer for the user"
}}
"""

    @classmethod
    def _parse_llm_response(cls, text: str) -> dict[str, Any]:
        """Extracts JSON object from model output even if surrounded by prose or backticks."""
        clean = text.strip()
        # Strip markdown fences if present
        if clean.startswith("```json"):
            clean = clean[7:]
        elif clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

        try:
            loaded = json.loads(clean)
            if isinstance(loaded, dict):
                return loaded
        except json.JSONDecodeError:
            # Fallback regex search for json block
            match = re.search(r"\{.*\}", clean, re.DOTALL)
            if match:
                try:
                    loaded_m = json.loads(match.group(0))
                    if isinstance(loaded_m, dict):
                        return loaded_m
                except json.JSONDecodeError:
                    pass

        # If not parseable as JSON, treat whole output as final answer
        return {
            "thought": "Model did not emit structured JSON.",
            "final_answer": text.strip(),
        }

    @classmethod
    async def run(
        cls,
        session_id: str,
        workspace_id: str,
        goal: str,
        policy_mode: str = "balanced",
        max_steps: int = 25,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Runs the agent loop, streaming events as they happen."""
        system_prompt = cls._build_system_prompt(workspace_id)
        conversation_history: list[dict[str, str]] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"GOAL: {goal}"},
        ]

        # Update session status to running
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AgentSessionModel).where(AgentSessionModel.id == session_id)
            )
            session = result.scalars().first()
            if session:
                session.status = "running"
                await db.commit()

        yield {"type": "session_started", "session_id": session_id, "goal": goal}

        step_index = 0
        while step_index < max_steps:
            step_index += 1
            yield {"type": "step_start", "step_index": step_index, "max_steps": max_steps}

            # 1. Ask Supervisor / Model for next action
            if supervisor.current_model_path is None or not supervisor.is_alive():
                yield {
                    "type": "error",
                    "message": "No model loaded. Please load a model in Model Manager before running the Agent.",
                }
                break

            full_prompt = (
                "\n".join([f"{m['role'].upper()}: {m['content']}" for m in conversation_history])
                + "\nASSISTANT:"
            )

            response_chunks: list[str] = []
            sampling = {
                "temperature": 0.2,
                "max_tokens": 1024,
                "stop": ["USER:", "SYSTEM:"],
            }
            try:
                async for chunk in supervisor.generate_stream(
                    prompt=full_prompt, sampling=sampling
                ):
                    token = chunk.get("token", "")
                    if token:
                        response_chunks.append(str(token))
            except Exception as e:
                yield {"type": "error", "message": f"Inference error during agent planning: {e}"}
                break

            raw_response = "".join(response_chunks).strip()
            parsed = cls._parse_llm_response(raw_response)
            thought = parsed.get("thought", "")
            yield {"type": "thought", "step_index": step_index, "thought": thought}

            # Check if task is finished
            if "final_answer" in parsed:
                final_ans = parsed["final_answer"]
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(AgentSessionModel).where(AgentSessionModel.id == session_id)
                    )
                    sess = result.scalars().first()
                    if sess:
                        sess.status = "completed"
                    await db.commit()

                yield {"type": "done", "step_index": step_index, "final_answer": final_ans}
                return

            tool_name = parsed.get("tool")
            args = parsed.get("args", {})
            if not tool_name:
                yield {
                    "type": "error",
                    "message": "Agent produced neither a tool call nor a final answer.",
                }
                break

            # Inject workspace_id into args if accepted by tool
            tool = ToolRegistry.get(tool_name)
            if not tool:
                obs = f"Error: Tool '{tool_name}' does not exist. Available tools: {[t.name for t in ToolRegistry.list_tools()]}"
                conversation_history.append({"role": "assistant", "content": raw_response})
                conversation_history.append({"role": "user", "content": f"OBSERVATION: {obs}"})
                yield {
                    "type": "observation",
                    "step_index": step_index,
                    "tool": tool_name,
                    "output": obs,
                }
                continue

            if (
                "workspace_id" in tool.parameters.get("properties", {})
                and "workspace_id" not in args
            ):
                args["workspace_id"] = workspace_id

            # 2. Check Human-in-the-Loop Approval Policy
            needs_approval, rationale = PolicyEngine.requires_approval(
                tool, mode=policy_mode, arguments=args
            )

            step_id = str(uuid.uuid4())
            if needs_approval:
                # Save step in DB awaiting approval
                async with AsyncSessionLocal() as db:
                    new_step = AgentStepModel(
                        id=step_id,
                        session_id=session_id,
                        step_index=step_index,
                        thought=thought,
                        tool_name=tool_name,
                        tool_args_json=args,
                        tool_output=None,
                        risk_level=tool.risk_level.value,
                        approved_by_user=False,
                        duration_ms=0,
                    )
                    db.add(new_step)
                    result = await db.execute(
                        select(AgentSessionModel).where(AgentSessionModel.id == session_id)
                    )
                    sess = result.scalars().first()
                    if sess:
                        sess.status = "awaiting_approval"
                    await db.commit()

                yield {
                    "type": "awaiting_approval",
                    "step_id": step_id,
                    "step_index": step_index,
                    "tool_name": tool_name,
                    "arguments": args,
                    "risk_level": tool.risk_level.value,
                    "reason": rationale,
                }
                # Pauses the loop for human approval via API
                return

            # 3. Tool is auto-approved or safe - execute it
            start_t = time.time()
            try:
                tool_result = await ToolRegistry.invoke(tool_name, args)
                if isinstance(tool_result, (dict, list)):
                    obs_str = json.dumps(tool_result, indent=2)
                else:
                    obs_str = str(tool_result)
            except Exception as e:
                obs_str = f"Execution error in tool '{tool_name}': {e}"

            duration_ms = int((time.time() - start_t) * 1000)

            # 4. Wrap output with Prompt Injection Defense
            defended_obs = InjectionDefense.wrap_untrusted(obs_str, source=f"tool:{tool_name}")

            # Record step in database
            async with AsyncSessionLocal() as db:
                new_step = AgentStepModel(
                    id=step_id,
                    session_id=session_id,
                    step_index=step_index,
                    thought=thought,
                    tool_name=tool_name,
                    tool_args_json=args,
                    tool_output=obs_str,
                    risk_level=tool.risk_level.value,
                    approved_by_user=True,
                    duration_ms=duration_ms,
                )
                db.add(new_step)
                await db.commit()

            yield {
                "type": "tool_executed",
                "step_index": step_index,
                "tool_name": tool_name,
                "output": obs_str,
                "duration_ms": duration_ms,
            }

            conversation_history.append({"role": "assistant", "content": raw_response})
            conversation_history.append(
                {"role": "user", "content": f"OBSERVATION:\n{defended_obs}"}
            )

        # Step limit reached
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AgentSessionModel).where(AgentSessionModel.id == session_id)
            )
            sess = result.scalars().first()
            if sess:
                sess.status = "stopped"
            await db.commit()

        yield {"type": "max_steps_reached", "step_index": step_index}
