from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.chat_service import ChatService

router = APIRouter(prefix="/chats", tags=["Chat"])


class CreateChatRequest(BaseModel):
    title: str = "Yeni Sohbet"
    model_id: str | None = None
    system_prompt: str | None = None
    sampling_params: dict[str, Any] | None = None


class SendMessageRequest(BaseModel):
    content: str
    sampling_params: dict[str, Any] | None = None


@router.get("")
async def list_chats(session: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    return await ChatService.list_chats(session)


@router.post("")
async def create_chat(
    req: CreateChatRequest,
    session: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    return await ChatService.create_chat(
        session,
        title=req.title,
        model_id=req.model_id,
        system_prompt=req.system_prompt,
        sampling_params=req.sampling_params,
    )


@router.get("/{chat_id}/messages")
async def get_messages(
    chat_id: str,
    session: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    return await ChatService.get_chat_messages(session, chat_id)


@router.post("/{chat_id}/messages")
async def send_message(
    chat_id: str,
    req: SendMessageRequest,
    session: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Streams token generation via Server-Sent Events (SSE)."""
    return StreamingResponse(
        ChatService.send_message_stream(
            session,
            chat_id,
            req.content,
            override_sampling=req.sampling_params,
        ),
        media_type="text/event-stream",
    )
