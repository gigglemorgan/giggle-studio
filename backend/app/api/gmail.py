from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc, select

from app.core.config import settings
from app.db.models.entities import GmailAuditModel
from app.db.session import AsyncSessionLocal
from app.integrations.gmail.oauth import GmailOAuth
from app.integrations.gmail.service import GmailService

router = APIRouter(prefix="/gmail", tags=["Gmail Integration"])


class AuthExchangeRequest(BaseModel):
    code: str
    client_id: str | None = None
    client_secret: str | None = None
    redirect_uri: str = "http://127.0.0.1:8420/api/gmail/auth/callback"


class ComposeRequest(BaseModel):
    to: str
    subject: str
    body: str


@router.get("/status")
async def get_gmail_status() -> dict[str, Any]:
    connected = GmailService.is_connected()
    email_addr = None
    if connected:
        try:
            profile = await GmailService.get_profile()
            email_addr = profile.get("emailAddress")
        except Exception:
            connected = False

    return {
        "connected": connected,
        "email": email_addr,
        "client_id_configured": bool(settings.gmail.client_id),
    }


@router.post("/auth/start")
async def start_oauth() -> dict[str, Any]:
    client_id = settings.gmail.client_id
    if not client_id:
        raise HTTPException(
            status_code=400,
            detail="GIGGLE_GMAIL_CLIENT_ID is not configured in settings or .env",
        )

    auth_url, state = GmailOAuth.generate_auth_url(client_id=client_id)
    return {"auth_url": auth_url, "state": state}


@router.post("/auth/exchange")
async def exchange_auth_code(req: AuthExchangeRequest) -> dict[str, Any]:
    client_id = req.client_id or settings.gmail.client_id
    client_secret = req.client_secret or settings.gmail.client_secret
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Missing Gmail client credentials.")

    try:
        tokens = await GmailOAuth.exchange_code(
            code=req.code,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=req.redirect_uri,
        )
        GmailService.save_tokens(tokens)
        profile = await GmailService.get_profile()
        return {"status": "ok", "email": profile.get("emailAddress")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Exchange failed: {e}") from e


@router.post("/disconnect")
async def disconnect_gmail() -> dict[str, Any]:
    GmailService.disconnect()
    return {"status": "disconnected"}


@router.get("/messages")
async def list_messages(
    q: str = Query("", description="Search query"),
    max_results: int = Query(10, ge=1, le=50),
) -> list[dict[str, Any]]:
    if not GmailService.is_connected():
        raise HTTPException(status_code=400, detail="Gmail is not connected.")
    try:
        return await GmailService.search_messages(query=q, max_results=max_results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/threads/{thread_id}")
async def get_thread(thread_id: str) -> dict[str, Any]:
    if not GmailService.is_connected():
        raise HTTPException(status_code=400, detail="Gmail is not connected.")
    try:
        return await GmailService.get_thread(thread_id=thread_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/drafts")
async def create_draft(req: ComposeRequest) -> dict[str, Any]:
    if not GmailService.is_connected():
        raise HTTPException(status_code=400, detail="Gmail is not connected.")
    try:
        return await GmailService.create_draft(to=req.to, subject=req.subject, body=req.body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/send")
async def send_message(req: ComposeRequest) -> dict[str, Any]:
    if not GmailService.is_connected():
        raise HTTPException(status_code=400, detail="Gmail is not connected.")
    try:
        return await GmailService.send_message(to=req.to, subject=req.subject, body=req.body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/audit")
async def get_audit_logs() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(GmailAuditModel).order_by(desc(GmailAuditModel.created_at)).limit(50)
        )
        logs = res.scalars().all()
        return [
            {
                "id": log.id,
                "action": log.action,
                "target_id": log.target_id,
                "details": log.details_json,
                "approved": log.approved,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]
