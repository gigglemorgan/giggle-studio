from __future__ import annotations

import base64
import hashlib
import json
import logging
from typing import Any

from app.core.config import settings
from cryptography.fernet import Fernet

logger = logging.getLogger("giggle.gmail.crypto")


class TokenCrypto:
    """Encrypts and decrypts OAuth tokens using Fernet with keyring or secret_key fallback."""

    @classmethod
    def _get_encryption_key(cls) -> bytes:
        # Try to use keyring, fallback to deriving from settings.secret_key
        try:
            import keyring

            stored = keyring.get_password("giggle_studio", "gmail_token_key")
            if stored:
                return stored.encode("utf-8")
            new_key = Fernet.generate_key().decode("utf-8")
            keyring.set_password("giggle_studio", "gmail_token_key", new_key)
            return new_key.encode("utf-8")
        except Exception:
            # Fallback: derive 32-byte url-safe base64 key from settings.secret_key
            derived = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
            return base64.urlsafe_b64encode(derived)

    @classmethod
    def encrypt_token_dict(cls, data: dict[str, Any]) -> str:
        key = cls._get_encryption_key()
        f = Fernet(key)
        raw_json = json.dumps(data).encode("utf-8")
        encrypted = f.encrypt(raw_json)
        return encrypted.decode("utf-8")

    @classmethod
    def decrypt_token_dict(cls, encrypted_str: str) -> dict[str, Any]:
        key = cls._get_encryption_key()
        f = Fernet(key)
        decrypted = f.decrypt(encrypted_str.encode("utf-8"))
        res = json.loads(decrypted.decode("utf-8"))
        if isinstance(res, dict):
            return res
        return {}
