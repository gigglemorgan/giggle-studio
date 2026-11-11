import json
import time
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.inference.supervisor import supervisor
from app.services.model_service import ModelService

v1_router = APIRouter(prefix="/v1", tags=["OpenAI Compatible"])


class ChatCompletionMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatCompletionMessage]
    temperature: float | None = 0.7
    top_p: float | None = 0.95
    max_tokens: int | None = 2048
    stream: bool | None = False
    stop: list[str] | None = None


def verify_api_key(authorization: str | None = Header(None)) -> None:
    if not settings.openai_compat.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OpenAI-compatible endpoint is disabled in Giggle Studio settings.",
        )
    if settings.openai_compat.api_key:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Bearer token"
            )
        token = authorization.split("Bearer ", 1)[1]
        if token != settings.openai_compat.api_key:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect API Key")


@v1_router.get("/models", dependencies=[Depends(verify_api_key)])
async def list_v1_models(session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    models = await ModelService.list_models(session)
    return {
        "object": "list",
        "data": [
            {
                "id": m["name"],
                "object": "model",
                "created": int(time.time()),
                "owned_by": "giggle-studio",
            }
            for m in models
        ],
    }


@v1_router.post("/chat/completions", dependencies=[Depends(verify_api_key)])
async def chat_completions(req: ChatCompletionRequest) -> Any:
    # Format messages
    parts = []
    for msg in req.messages:
        parts.append(f"<|im_start|>{msg.role}\n{msg.content}<|im_end|>\n")
    parts.append("<|im_start|>assistant\n")
    prompt = "".join(parts)

    sampling = {
        "temperature": req.temperature,
        "top_p": req.top_p,
        "max_tokens": req.max_tokens,
        "stop": req.stop or ["</s>", "<|im_end|>"],
    }

    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    created_ts = int(time.time())

    if req.stream:

        async def v1_stream_generator() -> AsyncGenerator[str, None]:
            async for chunk in supervisor.generate_stream(prompt, sampling):
                token = chunk.get("token", "")
                delta = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": created_ts,
                    "model": req.model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"content": token},
                            "finish_reason": chunk.get("finish_reason"),
                        }
                    ],
                }
                yield f"data: {json.dumps(delta)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(v1_stream_generator(), media_type="text/event-stream")

    # Non-streaming
    accumulated = []
    async for chunk in supervisor.generate_stream(prompt, sampling):
        accumulated.append(chunk.get("token", ""))

    content = "".join(accumulated)
    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created_ts,
        "model": req.model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
    }
