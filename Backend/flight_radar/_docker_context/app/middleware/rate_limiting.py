"""
Sliding-window rate limiter backed by Redis INCR + EXPIRE.
Returns HTTP 429 when the request count exceeds the limit within the window.
"""
from __future__ import annotations

from datetime import date
import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.cache.redis_client import get_pool
from app.core.api_keys import validate_api_key
from app.core.config import get_settings

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)
settings = get_settings()


def _client_key(request: Request) -> str:
    """Derive a rate-limit key from API key (preferred) or client IP."""
    api_key = request.headers.get("X-API-Key")
    if api_key:
        return f"ratelimit:apikey:{api_key[:8]}"

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("ApiKey "):
        key = auth_header.split(" ", 1)[1].strip()
        return f"ratelimit:apikey:{key[:8]}"

    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    else:
        client_ip = (request.client.host if request.client else "unknown")
    return f"ratelimit:{client_ip}"


def _plan_limit(plan: str | None) -> int:
    if not plan:
        return settings.RATE_LIMIT_REQUESTS
    return settings.plan_request_limits.get(plan, settings.RATE_LIMIT_REQUESTS)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Exempt paths: /health/*, /metrics, /docs, /openapi.json
    """
    _EXEMPT_PREFIXES = ("/health", "/metrics", "/docs", "/openapi", "/redoc")

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        path: str = request.url.path
        if any(path.startswith(p) for p in self._EXEMPT_PREFIXES):
            return await call_next(request)

        key = _client_key(request)
        effective_limit = settings.RATE_LIMIT_REQUESTS
        api_key_name: str | None = None
        api_plan: str | None = None

        raw_key = request.headers.get("X-API-Key")
        if not raw_key:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("ApiKey "):
                raw_key = auth_header.split(" ", 1)[1].strip()
        if raw_key:
            record = await validate_api_key(raw_key)
            if record and record.active:
                api_key_name = record.name
                api_plan = record.plan
                key = f"ratelimit:apikey:{api_key_name}"
                effective_limit = _plan_limit(api_plan)

        pool = get_pool()
        r = aioredis.Redis(connection_pool=pool, decode_responses=True)
        try:
            count = await r.incr(key)
            if count == 1:
                await r.expire(key, settings.RATE_LIMIT_WINDOW_SECONDS)
        except Exception as exc:
            logger.warning("Rate limit Redis error (allowing request): %s", exc)
            await r.aclose()
            return await call_next(request)

        try:
            if count > effective_limit:
                logger.warning(
                    "Rate limit exceeded",
                    extra={"key": key, "count": count},
                )
                if api_key_name and settings.ENABLE_API_USAGE_LOGGING:
                    usage_key = f"usage:{api_key_name}:{date.today().isoformat()}"
                    ttl_seconds = settings.API_USAGE_LOG_RETENTION_DAYS * 86400
                    await r.hincrby(usage_key, f"{request.method} {path} 429", 1)
                    await r.hincrby(usage_key, "__total__", 1)
                    await r.hincrby(usage_key, "__4xx__", 1)
                    await r.expire(usage_key, ttl_seconds)
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Too many requests",
                        "limit": effective_limit,
                        "window_seconds": settings.RATE_LIMIT_WINDOW_SECONDS,
                        "plan": api_plan or "default",
                    },
                    headers={"Retry-After": str(settings.RATE_LIMIT_WINDOW_SECONDS)},
                )

            response = await call_next(request)

            if api_key_name and settings.ENABLE_API_USAGE_LOGGING:
                usage_key = f"usage:{api_key_name}:{date.today().isoformat()}"
                ttl_seconds = settings.API_USAGE_LOG_RETENTION_DAYS * 86400
                status_group = f"__{response.status_code // 100}xx__"
                await r.hincrby(usage_key, f"{request.method} {path} {response.status_code}", 1)
                await r.hincrby(usage_key, "__total__", 1)
                await r.hincrby(usage_key, status_group, 1)
                await r.expire(usage_key, ttl_seconds)
            return response
        finally:
            await r.aclose()
