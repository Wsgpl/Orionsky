"""
FastAPI dependency injection providers.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.requests import Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

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
    api_key_record = None
    if api_key:
        api_key_record = await validate_api_key(api_key)
        if api_key_record is None or not api_key_record.active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
            )

    if settings.REQUIRE_API_KEY and api_key_record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
        )

    # When both an API key and a Bearer token are supplied, prefer the signed-in
    # user identity after the API key has been validated. This keeps plan gating
    # intact while still allowing per-user features like saved mission history.
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

    if api_key_record is not None:
        return f"api_key:{api_key_record.name}"

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


async def get_admin_user(
    current_user: CurrentUser,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    if current_user.startswith("api_key:"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin JWT required",
        )

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    try:
        token_subject = get_subject_from_token(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        ) from exc

    if token_subject != current_user or claims.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return current_user


AdminUser = Annotated[str, Depends(get_admin_user)]


async def get_session_user(current_user: CurrentUser) -> str:
    if current_user.startswith("api_key:"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Signed-in user session required",
        )
    return current_user


SessionUser = Annotated[str, Depends(get_session_user)]
