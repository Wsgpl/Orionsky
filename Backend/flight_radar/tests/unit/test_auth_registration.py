"""Unit tests for auth registration flows."""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.api.v1 import auth
from app.schemas.auth import RegisterRequest


@pytest.mark.asyncio
async def test_register_user_auto_verifies_when_email_delivery_is_unavailable(mock_redis, monkeypatch):
    monkeypatch.setattr(auth.settings, "SMTP_HOST", "")
    monkeypatch.setattr(auth.settings, "SMTP_FROM_EMAIL", "")
    monkeypatch.setattr(auth, "_hash_password", lambda password: "hashed-password")

    response = await auth.register_user(
        RegisterRequest(
            name="Test Pilot",
            email="pilot@example.com",
            password="securepass123",
        ),
        mock_redis,
    )

    assert response.status == "registered"
    assert response.email == "pilot@example.com"
    assert response.expires_in == 0
    saved_record = mock_redis.set_json.await_args.args[1]
    assert saved_record["is_verified"] is True
    assert saved_record["verified_at"] is not None


@pytest.mark.asyncio
async def test_register_user_sends_verification_when_email_delivery_is_available(mock_redis, monkeypatch):
    monkeypatch.setattr(auth.settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(auth.settings, "SMTP_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(auth, "_hash_password", lambda password: "hashed-password")
    monkeypatch.setattr(auth, "_send_account_verification", AsyncMock(return_value=3600))

    response = await auth.register_user(
        RegisterRequest(
            name="Test Pilot",
            email="pilot@example.com",
            password="securepass123",
        ),
        mock_redis,
    )

    assert response.status == "pending_verification"
    assert response.expires_in == 3600
    saved_record = mock_redis.set_json.await_args.args[1]
    assert saved_record["is_verified"] is False
    assert saved_record["verified_at"] is None
    auth._send_account_verification.assert_awaited_once()
