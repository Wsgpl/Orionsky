"""
FastAPI dependency injection providers.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.requests import Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.cache.redis_client import RedisClient, get_redis
from app.core.api_keys import validate_api_key
from app.core.config import get_settings
from app.core.security import get_subject_from_token

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=False)


def _extract_api_key(request: Request) -> str | None:
    from_header = request.headers.get("X-API-Key")
    if from_header:
        return from_header.strip()

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("ApiKey "):
        return auth_header.split(" ", 1)[1].strip()
    return None


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    """
    Validate Bearer JWT and return the subject (username/user_id).
    Raises HTTP 401 on invalid or expired tokens.
    """
    api_key = _extract_api_key(request)
    if settings.REQUIRE_API_KEY:
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key required",
            )
        record = await validate_api_key(api_key)
        if record and record.active:
            return f"api_key:{record.name}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    if credentials is not None and credentials.scheme.lower() == "bearer":
        try:
            subject = get_subject_from_token(credentials.credentials)
            return subject
        except JWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    if api_key:
        record = await validate_api_key(api_key)
        if record and record.active:
            return f"api_key:{record.name}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    detail = "Authentication required"
    if settings.REQUIRE_API_KEY:
        detail = "API key required"
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


# Type aliases for use in route signatures
CurrentUser = Annotated[str, Depends(get_current_user)]
Redis = Annotated[RedisClient, Depends(get_redis)]


async def get_admin_user(current_user: CurrentUser) -> str:
    if current_user.startswith("api_key:"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin JWT required",
        )
    if current_user != settings.AUTH_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


AdminUser = Annotated[str, Depends(get_admin_user)]
