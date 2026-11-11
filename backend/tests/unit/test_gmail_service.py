from __future__ import annotations

from app.agent.registry import RiskLevel, ToolRegistry
from app.integrations.gmail.oauth import GmailOAuth
from app.integrations.gmail.service import GmailService


def test_gmail_oauth_url_generation():
    auth_url, state = GmailOAuth.generate_auth_url(
        client_id="test-client-id.apps.googleusercontent.com",
        redirect_uri="http://127.0.0.1:8420/api/gmail/auth/callback",
    )
    assert "https://accounts.google.com/o/oauth2/v2/auth" in auth_url
    assert "code_challenge=" in auth_url
    assert "code_challenge_method=S256" in auth_url
    assert f"state={state}" in auth_url
    assert "client_id=test-client-id" in auth_url


def test_gmail_tools_registered_with_risk_levels():
    tool_search = ToolRegistry.get("gmail_search")
    assert tool_search is not None
    assert tool_search.risk_level == RiskLevel.SAFE

    tool_draft = ToolRegistry.get("gmail_create_draft")
    assert tool_draft is not None
    assert tool_draft.risk_level == RiskLevel.WRITE

    tool_send = ToolRegistry.get("gmail_send")
    assert tool_send is not None
    assert tool_send.risk_level == RiskLevel.NETWORK  # Network requires strict approval


def test_gmail_service_token_lifecycle():
    # Test saving and reading tokens
    test_tokens = {
        "access_token": "mock_access_token",
        "refresh_token": "mock_refresh_token",
        "expiry": 9999999999,
    }
    GmailService.save_tokens(test_tokens)
    assert GmailService.is_connected() is True

    retrieved = GmailService.get_tokens()
    assert retrieved is not None
    assert retrieved["access_token"] == "mock_access_token"

    # Test disconnect
    GmailService.disconnect()
    assert GmailService.is_connected() is False
