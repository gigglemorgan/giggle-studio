from __future__ import annotations

import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc, select

from app.agent.loop import AgentLoop
from app.agent.registry import ToolRegistry
from app.db.models.entities import AgentSessionModel, AgentStepModel
from app.db.session import AsyncSessionLocal

router = APIRouter(prefix="/agent", tags=["Agent Mode"])


class CreateSessionRequest(BaseModel):
    title: str = "New Agent Session"
    workspace_id: str = "default"
    max_steps: int = 25
    approval_policy: str = "balanced"  # "strict", "balanced", "autonomous"


class RunSessionRequest(BaseModel):
    goal: str
    workspace_id: str | None = None
    policy_mode: str | None = None
    max_steps: int | None = None


class ApproveStepRequest(BaseModel):
    approved: bool
    rejection_reason: str | None = None


@router.get("/tools")
async def list_agent_tools() -> list[dict[str, Any]]:
    """Returns all available tools, their risk levels and JSON schemas."""
    tools = ToolRegistry.list_tools()
    return [
        {
            "name": t.name,
            "description": t.description,
            "risk_level": t.risk_level.value,
            "parameters": t.parameters,
            "is_async": t.is_async,
        }
        for t in tools
    ]


@router.post("/sessions")
async def create_agent_session(req: CreateSessionRequest) -> dict[str, Any]:
    session_id = str(uuid.uuid4())
    async with AsyncSessionLocal() as db:
        new_sess = AgentSessionModel(
            id=session_id,
            title=req.title,
            workspace_id=req.workspace_id,
            status="created",
            max_steps=req.max_steps,
            approval_policy=req.approval_policy,
        )
        db.add(new_sess)
        await db.commit()

    return {
        "id": session_id,
        "title": req.title,
        "workspace_id": req.workspace_id,
        "status": "created",
        "max_steps": req.max_steps,
        "approval_policy": req.approval_policy,
    }


@router.get("/sessions")
async def list_agent_sessions() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AgentSessionModel).order_by(desc(AgentSessionModel.created_at))
        )
        sessions = result.scalars().all()
        return [
            {
                "id": s.id,
                "title": s.title,
                "workspace_id": s.workspace_id,
                "status": s.status,
                "max_steps": s.max_steps,
                "approval_policy": s.approval_policy,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in sessions
        ]


@router.get("/sessions/{session_id}")
async def get_agent_session(session_id: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(AgentSessionModel).where(AgentSessionModel.id == session_id))
        session = res.scalars().first()
        if not session:
            raise HTTPException(status_code=404, detail="Agent session not found")

        steps_res = await db.execute(
            select(AgentStepModel)
            .where(AgentStepModel.session_id == session_id)
            .order_by(AgentStepModel.step_index)
        )
        steps = steps_res.scalars().all()

        return {
            "session": {
                "id": session.id,
                "title": session.title,
                "workspace_id": session.workspace_id,
                "status": session.status,
                "max_steps": session.max_steps,
                "approval_policy": session.approval_policy,
                "created_at": session.created_at.isoformat() if session.created_at else None,
            },
            "steps": [
                {
                    "id": st.id,
                    "step_index": st.step_index,
                    "thought": st.thought,
                    "tool_name": st.tool_name,
                    "tool_args": st.tool_args_json or {},
                    "tool_output": st.tool_output,
                    "risk_level": st.risk_level,
                    "approved_by_user": st.approved_by_user,
                    "duration_ms": st.duration_ms,
                    "created_at": st.created_at.isoformat() if st.created_at else None,
                }
                for st in steps
            ],
        }


@router.post("/sessions/{session_id}/run")
async def run_agent_session(session_id: str, req: RunSessionRequest) -> StreamingResponse:
    """Streams SSE events as the autonomous agent reasons and invokes tools."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(AgentSessionModel).where(AgentSessionModel.id == session_id))
        session = res.scalars().first()
        if not session:
            raise HTTPException(status_code=404, detail="Agent session not found")
        workspace_id = req.workspace_id or session.workspace_id
        policy_mode = req.policy_mode or session.approval_policy
        max_steps = req.max_steps or session.max_steps

    async def sse_event_stream() -> AsyncGenerator[str, None]:
        async for event in AgentLoop.run(
            session_id=session_id,
            workspace_id=workspace_id,
            goal=req.goal,
            policy_mode=policy_mode,
            max_steps=max_steps,
        ):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(sse_event_stream(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/steps/{step_id}/approve")
async def approve_agent_step(
    session_id: str, step_id: str, req: ApproveStepRequest
) -> dict[str, Any]:
    """Human approval or rejection for a paused agent step."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(AgentStepModel).where(
                AgentStepModel.id == step_id, AgentStepModel.session_id == session_id
            )
        )
        step = res.scalars().first()
        if not step:
            raise HTTPException(status_code=404, detail="Agent step not found")

        if not req.approved:
            step.approved_by_user = False
            step.tool_output = f"Operation rejected by human operator. Reason: {req.rejection_reason or 'None provided'}"
            # Update session status back to paused/stopped
            s_res = await db.execute(
                select(AgentSessionModel).where(AgentSessionModel.id == session_id)
            )
            sess = s_res.scalars().first()
            if sess:
                sess.status = "stopped"
            await db.commit()
            return {"status": "rejected", "step_id": step_id}

        # Step is approved - execute tool immediately
        tool_name = step.tool_name or ""
        tool_args = step.tool_args_json or {}

        start_t = time.time()
        try:
            tool_result = await ToolRegistry.invoke(tool_name, tool_args)
            if isinstance(tool_result, (dict, list)):
                obs_str = json.dumps(tool_result, indent=2)
            else:
                obs_str = str(tool_result)
        except Exception as e:
            obs_str = f"Execution error in tool '{tool_name}': {e}"

        duration_ms = int((time.time() - start_t) * 1000)

        step.approved_by_user = True
        step.tool_output = obs_str
        step.duration_ms = duration_ms

        s_res = await db.execute(
            select(AgentSessionModel).where(AgentSessionModel.id == session_id)
        )
        sess = s_res.scalars().first()
        if sess:
            sess.status = "running"
        await db.commit()

        return {
            "status": "approved_and_executed",
            "step_id": step_id,
            "tool_output": obs_str,
            "duration_ms": duration_ms,
        }
