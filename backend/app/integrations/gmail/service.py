from __future__ import annotations

import base64
import logging
import time
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import httpx
from app.agent.registry import AgentTool, RiskLevel, ToolRegistry
from app.core.config import settings
from app.db.models.entities import GmailAuditModel, GmailMessageCacheModel
from app.db.session import AsyncSessionLocal
from app.integrations.gmail.crypto import TokenCrypto
from app.integrations.gmail.oauth import GmailOAuth

logger = logging.getLogger("giggle.gmail.service")
GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me"


class GmailService:
    """Provides typed access to Gmail API with audit logging and caching."""

    _cached_tokens: dict[str, Any] | None = None
    _token_file = Path(settings.storage.data_dir) / ".gmail_token.enc"

    @classmethod
    def is_connected(cls) -> bool:
        tokens = cls.get_tokens()
        return bool(tokens and (tokens.get("access_token") or tokens.get("refresh_token")))

    @classmethod
    def save_tokens(cls, tokens: dict[str, Any]) -> None:
        cls._cached_tokens = tokens
        cls._token_file.parent.mkdir(parents=True, exist_ok=True)
        encrypted_str = TokenCrypto.encrypt_token_dict(tokens)
        cls._token_file.write_text(encrypted_str, encoding="utf-8")

    @classmethod
    def get_tokens(cls) -> dict[str, Any] | None:
        if cls._cached_tokens is not None:
            return cls._cached_tokens
        if cls._token_file.exists():
            try:
                enc = cls._token_file.read_text(encoding="utf-8")
                cls._cached_tokens = TokenCrypto.decrypt_token_dict(enc)
                return cls._cached_tokens
            except Exception as e:
                logger.error("Failed to decrypt stored Gmail tokens: %s", e)
        return None

    @classmethod
    def disconnect(cls) -> None:
        cls._cached_tokens = None
        if cls._token_file.exists():
            try:
                cls._token_file.unlink()
            except Exception:
                pass

    @classmethod
    async def get_valid_access_token(cls) -> str:
        tokens = cls.get_tokens()
        if not tokens:
            raise RuntimeError("Gmail is not connected. Authenticate in Settings first.")

        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expiry = tokens.get("expiry", 0)

        # If token is still valid (with 60-second leeway), return it
        if access_token and (expiry == 0 or time.time() < expiry - 60):
            return str(access_token)

        # Otherwise refresh
        if not refresh_token:
            raise RuntimeError("Gmail access token expired and no refresh token available.")

        client_id = settings.gmail.client_id
        client_secret = settings.gmail.client_secret
        if not client_id or not client_secret:
            raise RuntimeError("Missing GIGGLE_GMAIL_CLIENT_ID or GIGGLE_GMAIL_CLIENT_SECRET.")

        refreshed = await GmailOAuth.refresh_access_token(client_id, client_secret, refresh_token)
        tokens["access_token"] = refreshed["access_token"]
        if "expires_in" in refreshed:
            tokens["expiry"] = time.time() + refreshed["expires_in"]
        cls.save_tokens(tokens)
        return str(tokens["access_token"])

    @classmethod
    async def _request(
        cls,
        method: str,
        endpoint: str,
        json_data: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        token = await cls.get_valid_access_token()
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{GMAIL_BASE_URL}/{endpoint.lstrip('/')}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(method, url, headers=headers, json=json_data, params=params)
            if resp.status_code == 401:
                # Retry once after refreshing
                token = await cls.get_valid_access_token()
                headers["Authorization"] = f"Bearer {token}"
                resp = await client.request(
                    method, url, headers=headers, json=json_data, params=params
                )

            if resp.status_code not in (200, 201, 204):
                raise RuntimeError(f"Gmail API error ({resp.status_code}): {resp.text}")

            if resp.status_code == 204:
                return {}
            data: dict[str, Any] = resp.json()
            return data

    @classmethod
    async def get_profile(cls) -> dict[str, Any]:
        return await cls._request("GET", "profile")

    @classmethod
    async def search_messages(cls, query: str = "", max_results: int = 10) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"maxResults": max_results}
        if query:
            params["q"] = query

        data = await cls._request("GET", "messages", params=params)
        msg_items = data.get("messages", [])
        detailed_list: list[dict[str, Any]] = []

        for item in msg_items:
            m_id = item["id"]
            m_data = await cls._request("GET", f"messages/{m_id}?format=metadata")

            headers = {
                h["name"].lower(): h["value"] for h in m_data.get("payload", {}).get("headers", [])
            }
            subject = headers.get("subject", "(No Subject)")
            from_addr = headers.get("from", "")
            to_addr = headers.get("to", "")
            date_str = headers.get("date", "")
            snippet = m_data.get("snippet", "")

            msg_info = {
                "id": m_id,
                "thread_id": m_data.get("threadId", ""),
                "subject": subject,
                "from": from_addr,
                "to": to_addr,
                "date": date_str,
                "snippet": snippet,
            }
            detailed_list.append(msg_info)

            # Update cache asynchronously
            async with AsyncSessionLocal() as db:
                cached = GmailMessageCacheModel(
                    message_id=m_id,
                    thread_id=msg_info["thread_id"],
                    subject=subject,
                    from_address=from_addr,
                    to_address=to_addr,
                    date=date_str,
                    snippet=snippet,
                    has_attachments=False,
                )
                db.add(cached)
                try:
                    await db.commit()
                except Exception:
                    pass

        return detailed_list

    @classmethod
    async def get_thread(cls, thread_id: str) -> dict[str, Any]:
        return await cls._request("GET", f"threads/{thread_id}?format=full")

    @classmethod
    async def create_draft(cls, to: str, subject: str, body: str) -> dict[str, Any]:
        msg = MIMEText(body)
        msg["to"] = to
        msg["subject"] = subject
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        res = await cls._request("POST", "drafts", json_data={"message": {"raw": raw}})

        # Record in audit log
        async with AsyncSessionLocal() as db:
            audit = GmailAuditModel(
                action="create_draft",
                target_id=res.get("id"),
                details_json={"to": to, "subject": subject, "body_preview": body[:100]},
                approved=True,
            )
            db.add(audit)
            await db.commit()

        return res

    @classmethod
    async def send_message(cls, to: str, subject: str, body: str) -> dict[str, Any]:
        msg = MIMEText(body)
        msg["to"] = to
        msg["subject"] = subject
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

        res = await cls._request("POST", "messages/send", json_data={"raw": raw})

        # Record in audit log
        async with AsyncSessionLocal() as db:
            audit = GmailAuditModel(
                action="send_message",
                target_id=res.get("id"),
                details_json={"to": to, "subject": subject, "body_preview": body[:100]},
                approved=True,
            )
            db.add(audit)
            await db.commit()

        return res


# Register Gmail tools into ToolRegistry
def register_gmail_tools() -> None:
    async def tool_gmail_search(query: str = "", max_results: int = 5) -> Any:
        return await GmailService.search_messages(query=query, max_results=max_results)

    async def tool_gmail_read_thread(thread_id: str) -> Any:
        return await GmailService.get_thread(thread_id=thread_id)

    async def tool_gmail_create_draft(to: str, subject: str, body: str) -> Any:
        return await GmailService.create_draft(to=to, subject=subject, body=body)

    async def tool_gmail_send(to: str, subject: str, body: str) -> Any:
        return await GmailService.send_message(to=to, subject=subject, body=body)

    ToolRegistry.register_tool(
        AgentTool(
            name="gmail_search",
            description="Searches messages in Gmail inbox with queries like 'from:alice' or 'label:unread'.",
            risk_level=RiskLevel.SAFE,
            func=tool_gmail_search,
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum messages to retrieve (1-20)",
                    },
                },
            },
            is_async=True,
        )
    )

    ToolRegistry.register_tool(
        AgentTool(
            name="gmail_read_thread",
            description="Reads the full email thread given a thread_id.",
            risk_level=RiskLevel.SAFE,
            func=tool_gmail_read_thread,
            parameters={
                "type": "object",
                "properties": {
                    "thread_id": {"type": "string", "description": "ID of thread to read"}
                },
                "required": ["thread_id"],
            },
            is_async=True,
        )
    )

    ToolRegistry.register_tool(
        AgentTool(
            name="gmail_create_draft",
            description="Creates an email draft in Gmail without sending it.",
            risk_level=RiskLevel.WRITE,
            func=tool_gmail_create_draft,
            parameters={
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject"},
                    "body": {"type": "string", "description": "Body message text"},
                },
                "required": ["to", "subject", "body"],
            },
            is_async=True,
        )
    )

    ToolRegistry.register_tool(
        AgentTool(
            name="gmail_send",
            description="Sends an email via Gmail. STRICTLY requires explicit human approval.",
            risk_level=RiskLevel.NETWORK,
            func=tool_gmail_send,
            parameters={
                "type": "object",
                "properties": {
                    "to": {"type": "string", "description": "Recipient email address"},
                    "subject": {"type": "string", "description": "Email subject line"},
                    "body": {"type": "string", "description": "Email body content"},
                },
                "required": ["to", "subject", "body"],
            },
            is_async=True,
        )
    )


# Automatically register tools on import
register_gmail_tools()
