"""Unit tests for auth dependency resolution."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request

from app.core import dependencies
from app.core.security import create_access_token


def _request_with_headers(headers: dict[str, str]) -> Request:
    raw_headers = [(key.lower().encode("latin-1"), value.encode("latin-1")) for key, value in headers.items()]
    return Request({"type": "http", "headers": raw_headers})


@pytest.mark.asyncio
async def test_get_current_user_prefers_bearer_subject_over_api_key(monkeypatch):
    token = create_access_token(
        "user:pilot@example.com",
        {
            "role": "user",
            "email": "pilot@example.com",
            "name": "Pilot",
            "email_verified": True,
        },
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    request = _request_with_headers(
        {
            "X-API-Key": "example-key",
            "Authorization": f"Bearer {token}",
        }
    )

    async def fake_validate_api_key(raw_key: str):
        assert raw_key == "example-key"
        return SimpleNamespace(name="public", active=True)

    monkeypatch.setattr(dependencies.settings, "REQUIRE_API_KEY", True)
    monkeypatch.setattr(dependencies, "validate_api_key", fake_validate_api_key)

    subject = await dependencies.get_current_user(request, credentials)

    assert subject == "user:pilot@example.com"


@pytest.mark.asyncio
async def test_get_current_user_falls_back_to_api_key_identity(monkeypatch):
    request = _request_with_headers({"X-API-Key": "example-key"})

    async def fake_validate_api_key(raw_key: str):
        assert raw_key == "example-key"
        return SimpleNamespace(name="public", active=True)

    monkeypatch.setattr(dependencies.settings, "REQUIRE_API_KEY", True)
    monkeypatch.setattr(dependencies, "validate_api_key", fake_validate_api_key)

    subject = await dependencies.get_current_user(request, None)

    assert subject == "api_key:public"


@pytest.mark.asyncio
async def test_get_admin_user_accepts_admin_role_bearer_token():
    token = create_access_token(
        "admin",
        {
            "role": "admin",
            "email": "admin@example.com",
            "name": "Administrator",
            "email_verified": True,
        },
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    subject = await dependencies.get_admin_user("admin", credentials)

    assert subject == "admin"


@pytest.mark.asyncio
async def test_get_admin_user_rejects_non_admin_role_bearer_token():
    token = create_access_token(
        "user:pilot@example.com",
        {
            "role": "user",
            "email": "pilot@example.com",
            "name": "Pilot",
            "email_verified": True,
        },
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await dependencies.get_admin_user("user:pilot@example.com", credentials)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"


@pytest.mark.asyncio
async def test_get_admin_user_rejects_api_key_identity():
    token = create_access_token(
        "admin",
        {
            "role": "admin",
            "email": "admin@example.com",
            "name": "Administrator",
            "email_verified": True,
        },
    )
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    with pytest.raises(HTTPException) as exc_info:
        await dependencies.get_admin_user("api_key:public", credentials)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin JWT required"
