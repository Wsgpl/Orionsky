"""Auth endpoint that issues JWT tokens."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["Auth"])
settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Dev-only fallback user when AUTH_PASSWORD_HASH is not configured.
_USERS: dict[str, str] = {
    "admin": "secret",
}


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


@router.post("/token", response_model=TokenResponse)
async def login(payload: LoginRequest) -> TokenResponse:
    if settings.AUTH_PASSWORD_HASH:
        is_valid = (
            payload.username == settings.AUTH_USERNAME
            and _verify_password(payload.password, settings.AUTH_PASSWORD_HASH)
        )
    elif settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth provider not configured",
        )
    else:
        expected = _USERS.get(payload.username)
        is_valid = bool(expected and payload.password == expected)

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(subject=payload.username)
    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
