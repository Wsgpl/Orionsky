from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.v1 import auth
from app.schemas.auth import LoginRequest


@pytest.mark.asyncio
async def test_login_uses_password_hash_even_if_plain_password_is_present(monkeypatch):
    monkeypatch.setattr(auth.settings, "AUTH_USERNAME", "admin")
    monkeypatch.setattr(auth.settings, "AUTH_PASSWORD", "plain-text-password")
    monkeypatch.setattr(auth.settings, "AUTH_PASSWORD_HASH", "hashed-password")
    monkeypatch.setattr(auth.settings, "ENVIRONMENT", "development")

    observed: dict[str, str] = {}

    def fake_verify_password(password: str, hashed_password: str) -> bool:
        observed["password"] = password
        observed["hashed_password"] = hashed_password
        return True

    monkeypatch.setattr(auth, "_verify_password", fake_verify_password)

    response = await auth.login(LoginRequest(username="admin", password="correct-password"))

    assert response.subject == "admin"
    assert observed == {
        "password": "correct-password",
        "hashed_password": "hashed-password",
    }


EXPECTED_AUTH_PROVIDER_MESSAGE = (
    "Auth provider not configured — set AUTH_PASSWORD_HASH in environment"
)


@pytest.mark.asyncio
async def test_login_rejects_when_no_auth_provider_is_configured_even_in_development(monkeypatch):
    monkeypatch.setattr(auth.settings, "AUTH_PASSWORD", None)
    monkeypatch.setattr(auth.settings, "AUTH_PASSWORD_HASH", None)
    monkeypatch.setattr(auth.settings, "ENVIRONMENT", "development")

    with pytest.raises(HTTPException) as exc_info:
        await auth.login(LoginRequest(username="admin", password="secret"))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == EXPECTED_AUTH_PROVIDER_MESSAGE


@pytest.mark.asyncio
async def test_login_rejects_plain_password_only_configuration(monkeypatch):
    monkeypatch.setattr(auth.settings, "AUTH_USERNAME", "admin")
    monkeypatch.setattr(auth.settings, "AUTH_PASSWORD", "plain-text-password")
    monkeypatch.setattr(auth.settings, "AUTH_PASSWORD_HASH", None)
    monkeypatch.setattr(auth.settings, "ENVIRONMENT", "development")

    with pytest.raises(HTTPException) as exc_info:
        await auth.login(LoginRequest(username="admin", password="plain-text-password"))

    assert exc_info.value.status_code == 503
    assert exc_info.value.detail == EXPECTED_AUTH_PROVIDER_MESSAGE
