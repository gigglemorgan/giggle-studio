from __future__ import annotations

import base64
import hashlib
import logging
import secrets
import urllib.parse
from typing import Any

import httpx

logger = logging.getLogger("giggle.gmail.oauth")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.send",
]


class GmailOAuth:
    """Manages Desktop OAuth 2.0 PKCE authentication for Gmail."""

    _active_flow: dict[str, Any] = {}

    @classmethod
    def generate_auth_url(
        cls,
        client_id: str,
        redirect_uri: str = "http://127.0.0.1:8420/api/gmail/auth/callback",
        scopes: list[str] | None = None,
    ) -> tuple[str, str]:
        """
        Creates PKCE code_verifier, code_challenge and returns (auth_url, state).
        """
        code_verifier = secrets.token_urlsafe(64)
        hashed = hashlib.sha256(code_verifier.encode("ascii")).digest()
        code_challenge = base64.urlsafe_b64encode(hashed).decode("ascii").rstrip("=")
        state = secrets.token_urlsafe(32)

        cls._active_flow = {
            "code_verifier": code_verifier,
            "state": state,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
        }

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(scopes or DEFAULT_SCOPES),
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
        query_string = urllib.parse.urlencode(params)
        auth_url = f"{GOOGLE_AUTH_URL}?{query_string}"
        return auth_url, state

    @classmethod
    async def exchange_code(
        cls,
        code: str,
        client_id: str,
        client_secret: str,
        redirect_uri: str = "http://127.0.0.1:8420/api/gmail/auth/callback",
        code_verifier: str | None = None,
    ) -> dict[str, Any]:
        """Exchanges authorization code for access and refresh tokens."""
        verifier = code_verifier or cls._active_flow.get("code_verifier")
        payload = {
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        if verifier:
            payload["code_verifier"] = verifier

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
            if resp.status_code != 200:
                logger.error("Token exchange failed (%s): %s", resp.status_code, resp.text)
                raise RuntimeError(f"Google token exchange failed: {resp.text}")

            token_data: dict[str, Any] = resp.json()

        # Encrypt and store tokens
        cls._active_flow.clear()
        return token_data

    @classmethod
    async def refresh_access_token(
        cls, client_id: str, client_secret: str, refresh_token: str
    ) -> dict[str, Any]:
        payload = {
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
            if resp.status_code != 200:
                raise RuntimeError(f"Failed to refresh access token: {resp.text}")
            refreshed: dict[str, Any] = resp.json()
            return refreshed
