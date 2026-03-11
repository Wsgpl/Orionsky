"""Auth endpoints for admin tokens and registered users."""
from __future__ import annotations

from datetime import datetime, timezone
import secrets
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, status
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.dependencies import Redis
from app.core.security import create_access_token
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    RegistrationResponse,
    TokenResponse,
    UserLoginRequest,
    VerificationEmailRequest,
    VerifyEmailResponse,
)
from app.services.email_service import send_verification_email

router = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USER_KEY_PREFIX = "auth:user:"
VERIFY_TOKEN_PREFIX = "auth:verify:"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _user_key(email: str) -> str:
    return f"{USER_KEY_PREFIX}{email}"


def _verify_token_key(token: str) -> str:
    return f"{VERIFY_TOKEN_PREFIX}{token}"


def _verification_url(token: str) -> str:
    base = settings.FRONTEND_APP_URL.rstrip("/")
    return f"{base}/verify-email?token={quote(token, safe='')}"


def _can_send_verification_email() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)


def _issue_token_response(
    *,
    subject: str,
    role: Literal["admin", "user"],
    email: str | None,
    name: str | None,
    email_verified: bool,
) -> TokenResponse:
    token = create_access_token(
        subject=subject,
        extra_claims={
            "role": role,
            "email": email,
            "name": name,
            "email_verified": email_verified,
        },
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        subject=subject,
        role=role,
        email=email,
        name=name,
        email_verified=email_verified,
    )


def _verify_password(password: str, hashed_password: str) -> bool:
    """Verify password with passlib; fallback to bcrypt on backend incompatibility."""
    try:
        return pwd_context.verify(password, hashed_password)
    except Exception:
        # passlib/bcrypt compatibility can fail on some bcrypt builds; fallback keeps auth available.
        try:
            import bcrypt  # type: ignore

            return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False


def _hash_password(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except Exception:
        try:
            import bcrypt  # type: ignore

            return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        except Exception as exc:
            raise RuntimeError("Password hashing failed") from exc


async def _send_account_verification(
    *,
    email: str,
    name: str,
    redis: Redis,
) -> int:
    if not _can_send_verification_email():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is not configured on the backend",
        )

    ttl_seconds = settings.AUTH_EMAIL_VERIFICATION_TTL_MINUTES * 60
    token = secrets.token_urlsafe(32)
    await redis.set_json(_verify_token_key(token), {"email": email}, ex=ttl_seconds)

    try:
        await send_verification_email(
            recipient=email,
            recipient_name=name,
            verification_url=_verification_url(token),
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Verification email could not be delivered",
        ) from exc

    return ttl_seconds


@router.post("/token", response_model=TokenResponse)
async def login(payload: LoginRequest) -> TokenResponse:
    if settings.AUTH_PASSWORD_HASH:
        is_valid = (
            secrets.compare_digest(payload.username, settings.AUTH_USERNAME)
            and _verify_password(payload.password, settings.AUTH_PASSWORD_HASH)
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth provider not configured — set AUTH_PASSWORD_HASH in environment",
        )

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _issue_token_response(
        subject=payload.username,
        role="admin",
        email=settings.AUTH_USERNAME,
        name="Administrator",
        email_verified=True,
    )


@router.post("/register", response_model=RegistrationResponse, status_code=status.HTTP_202_ACCEPTED)
async def register_user(
    payload: RegisterRequest,
    redis: Redis,
) -> RegistrationResponse:
    email = _normalize_email(payload.email)
    existing = await redis.get_json(_user_key(email))
    if existing and existing.get("is_verified"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email address is already registered",
        )

    now = _utc_now_iso()
    email_delivery_available = _can_send_verification_email()
    record = {
        "email": email,
        "name": payload.name,
        "password_hash": _hash_password(payload.password),
        "is_verified": not email_delivery_available,
        "created_at": existing.get("created_at", now) if existing else now,
        "updated_at": now,
        "verified_at": now if not email_delivery_available else None,
    }
    await redis.set_json(_user_key(email), record)

    if not email_delivery_available:
        return RegistrationResponse(
            status="registered",
            message=(
                "Account created successfully. Email verification is unavailable in this deployment, "
                "so the account is ready to use immediately."
            ),
            email=email,
            expires_in=0,
        )

    ttl_seconds = await _send_account_verification(email=email, name=payload.name, redis=redis)
    return RegistrationResponse(
        status="pending_verification",
        message="Verification email sent",
        email=email,
        expires_in=ttl_seconds,
    )


@router.post("/resend-verification", response_model=RegistrationResponse)
async def resend_verification(
    payload: VerificationEmailRequest,
    redis: Redis,
) -> RegistrationResponse:
    email = _normalize_email(payload.email)
    record = await redis.get_json(_user_key(email))
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if record.get("is_verified"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email address is already verified",
        )

    ttl_seconds = await _send_account_verification(
        email=email,
        name=record.get("name") or "Pilot",
        redis=redis,
    )
    return RegistrationResponse(
        status="pending_verification",
        message="Verification email sent",
        email=email,
        expires_in=ttl_seconds,
    )


@router.get("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    redis: Redis,
    token: str = Query(..., min_length=12),
) -> VerifyEmailResponse:
    token_data = await redis.get_json(_verify_token_key(token))
    if not token_data or not token_data.get("email"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link is invalid or has expired",
        )

    email = _normalize_email(token_data["email"])
    record = await redis.get_json(_user_key(email))
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not record.get("is_verified"):
        record["is_verified"] = True
        record["verified_at"] = _utc_now_iso()
        record["updated_at"] = record["verified_at"]
        await redis.set_json(_user_key(email), record)

    await redis.delete(_verify_token_key(token))
    return VerifyEmailResponse(
        status="verified",
        message="Email confirmed successfully",
        email=email,
    )


@router.post("/login", response_model=TokenResponse)
async def user_login(
    payload: UserLoginRequest,
    redis: Redis,
) -> TokenResponse:
    email = _normalize_email(payload.email)
    record = await redis.get_json(_user_key(email))
    if not record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not record.get("is_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Confirm your email before logging in",
        )
    if not _verify_password(payload.password, record.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _issue_token_response(
        subject=f"user:{email}",
        role="user",
        email=email,
        name=record.get("name"),
        email_verified=True,
    )
