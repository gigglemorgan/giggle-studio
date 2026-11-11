import json
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logger import logger
from app.db.models.entities import ChatModel, MessageModel
from app.inference.supervisor import supervisor


class ChatService:
    @classmethod
    async def create_chat(
        cls,
        session: AsyncSession,
        title: str = "Yeni Sohbet",
        model_id: str | None = None,
        system_prompt: str | None = None,
        sampling_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        chat = ChatModel(
            title=title,
            model_id=model_id,
            system_prompt=system_prompt,
            sampling_params_json=sampling_params
            or {
                "temperature": 0.7,
                "top_p": 0.95,
                "top_k": 40,
                "max_tokens": 2048,
                "repeat_penalty": 1.1,
            },
        )
        session.add(chat)
        await session.commit()
        await session.refresh(chat)
        return {
            "id": chat.id,
            "title": chat.title,
            "model_id": chat.model_id,
            "system_prompt": chat.system_prompt,
            "sampling_params": chat.sampling_params_json,
            "created_at": chat.created_at.isoformat(),
        }

    @classmethod
    async def list_chats(cls, session: AsyncSession) -> list[dict[str, Any]]:
        query = select(ChatModel).order_by(desc(ChatModel.updated_at))
        result = await session.execute(query)
        chats = result.scalars().all()
        return [
            {
                "id": c.id,
                "title": c.title,
                "model_id": c.model_id,
                "updated_at": c.updated_at.isoformat(),
            }
            for c in chats
        ]

    @classmethod
    async def get_chat_messages(cls, session: AsyncSession, chat_id: str) -> list[dict[str, Any]]:
        query = (
            select(MessageModel)
            .where(MessageModel.chat_id == chat_id)
            .order_by(MessageModel.created_at)
        )
        result = await session.execute(query)
        messages = result.scalars().all()
        return [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "tokens_in": m.tokens_in,
                "tokens_out": m.tokens_out,
                "ttft_ms": m.ttft_ms,
                "tps": m.tps,
                "tool_calls": m.tool_calls_json,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]

    @classmethod
    def format_chat_prompt(
        cls,
        system_prompt: str | None,
        history: list[dict[str, str]],
        user_message: str,
    ) -> str:
        """Formats conversation turns using standard ChatML convention."""
        formatted_parts: list[str] = []
        if system_prompt:
            formatted_parts.append(f"<|im_start|>system\n{system_prompt}<|im_end|>\n")

        for turn in history:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            formatted_parts.append(f"<|im_start|>{role}\n{content}<|im_end|>\n")

        formatted_parts.append(
            f"<|im_start|>user\n{user_message}<|im_end|>\n<|im_start|>assistant\n"
        )
        return "".join(formatted_parts)

    @classmethod
    async def send_message_stream(
        cls,
        session: AsyncSession,
        chat_id: str,
        user_content: str,
        override_sampling: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Saves user message, streams assistant tokens via SSE, and persists assistant turn."""
        # 1. Fetch chat
        res = await session.execute(select(ChatModel).where(ChatModel.id == chat_id))
        chat = res.scalar_one_or_none()
        if not chat:
            raise FileNotFoundError(f"Chat {chat_id} not found")

        # 2. Save user turn
        user_msg = MessageModel(
            chat_id=chat_id,
            role="user",
            content=user_content,
        )
        session.add(user_msg)
        await session.commit()

        # 3. Fetch recent history for prompt assembly
        recent_msgs = await cls.get_chat_messages(session, chat_id)
        # exclude last user message we just added
        history = [{"role": m["role"], "content": m["content"]} for m in recent_msgs[:-1]]

        prompt = cls.format_chat_prompt(chat.system_prompt, history, user_content)
        sampling = {**(chat.sampling_params_json or {}), **(override_sampling or {})}

        accumulated_text: list[str] = []
        last_stats: dict[str, Any] = {}

        try:
            async for chunk in supervisor.generate_stream(prompt, sampling):
                token = chunk.get("token", "")
                accumulated_text.append(token)
                if "stats" in chunk:
                    last_stats = chunk["stats"]

                payload = json.dumps(
                    {"token": token, "stats": chunk.get("stats")}, ensure_ascii=False
                )
                yield f"data: {payload}\n\n"
        except Exception as e:
            logger.error("Generation error in chat %s: %s", chat_id, e)
            err_payload = json.dumps({"error": str(e)}, ensure_ascii=False)
            yield f"data: {err_payload}\n\n"
            return

        # 4. Save Assistant turn to database
        full_assistant_text = "".join(accumulated_text)
        assistant_msg = MessageModel(
            chat_id=chat_id,
            role="assistant",
            content=full_assistant_text,
            tokens_in=len(prompt.split()),  # approximate token estimate
            tokens_out=last_stats.get("tokens_out", len(full_assistant_text.split())),
            ttft_ms=last_stats.get("ttft_ms"),
            tps=last_stats.get("tps"),
        )
        session.add(assistant_msg)
        await session.commit()

        yield "data: [DONE]\n\n"
