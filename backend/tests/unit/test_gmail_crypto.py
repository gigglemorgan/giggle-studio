from __future__ import annotations

import pytest
from app.integrations.gmail.crypto import TokenCrypto
from cryptography.fernet import InvalidToken


def test_token_crypto_roundtrip():
    data = {
        "access_token": "ya29.test-access-token",
        "refresh_token": "1//test-refresh-token",
        "expiry": 1893456000,
        "scope": "https://www.googleapis.com/auth/gmail.readonly",
    }
    encrypted = TokenCrypto.encrypt_token_dict(data)
    assert isinstance(encrypted, str)
    assert "ya29.test-access-token" not in encrypted

    decrypted = TokenCrypto.decrypt_token_dict(encrypted)
    assert decrypted["access_token"] == data["access_token"]
    assert decrypted["refresh_token"] == data["refresh_token"]
    assert decrypted["expiry"] == data["expiry"]


def test_token_crypto_tampered_fails():
    with pytest.raises(InvalidToken):
        TokenCrypto.decrypt_token_dict("invalid-base64-or-tampered-data")
