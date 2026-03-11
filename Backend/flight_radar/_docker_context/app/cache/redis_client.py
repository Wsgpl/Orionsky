"""
Redis abstraction layer with connection pooling, retry, and health-check helpers.
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator

import redis.asyncio as aioredis
from redis.asyncio import ConnectionPool
from redis.exceptions import ConnectionError, RedisError, TimeoutError

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_pool: ConnectionPool | None = None


def _build_pool() -> ConnectionPool:
    return aioredis.ConnectionPool.from_url(
        settings.redis_url,
        max_connections=settings.REDIS_MAX_CONNECTIONS,
        socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
        health_check_interval=settings.REDIS_HEALTH_CHECK_INTERVAL,
        decode_responses=True,
    )


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = _build_pool()
    return _pool


class RedisClient:
    """Thin async wrapper around aioredis with structured logging."""

    def __init__(self, client: aioredis.Redis) -> None:
        self._r = client

    # ── Core primitives ────────────────────────────────────────────
    async def ping(self) -> bool:
        try:
            return await self._r.ping()
        except (ConnectionError, TimeoutError) as exc:
            logger.warning("Redis ping failed", exc_info=exc)
            return False

    async def get(self, key: str) -> str | None:
        return await self._r.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
    ) -> None:
        await self._r.set(key, value, ex=ex)

    async def delete(self, *keys: str) -> int:
        return await self._r.delete(*keys)

    async def exists(self, key: str) -> bool:
        return bool(await self._r.exists(key))

    async def keys(self, pattern: str) -> list[str]:
        return await self._r.keys(pattern)

    async def expire(self, key: str, seconds: int) -> None:
        await self._r.expire(key, seconds)

    # ── Hash helpers ───────────────────────────────────────────────
    async def hset(self, key: str, mapping: dict[str, Any]) -> int:
        return await self._r.hset(key, mapping=mapping)  # type: ignore[arg-type]

    async def hgetall(self, key: str) -> dict[str, str]:
        return await self._r.hgetall(key)

    # ── Set helpers ────────────────────────────────────────────────
    async def sadd(self, key: str, *members: str) -> int:
        return await self._r.sadd(key, *members)

    async def smembers(self, key: str) -> set[str]:
        return await self._r.smembers(key)

    # ── JSON convenience ───────────────────────────────────────────
    async def set_json(self, key: str, value: Any, ex: int | None = None) -> None:
        await self.set(key, json.dumps(value, default=str), ex=ex)

    async def get_json(self, key: str) -> Any | None:
        raw = await self.get(key)
        return json.loads(raw) if raw else None

    # ── Counters (rate limiting, metrics) ─────────────────────────
    async def incr(self, key: str) -> int:
        return await self._r.incr(key)

    async def ttl(self, key: str) -> int:
        return await self._r.ttl(key)

    # ── Pipeline ───────────────────────────────────────────────────
    def pipeline(self, transaction: bool = True):  # type: ignore[return]
        return self._r.pipeline(transaction=transaction)

    # ── Connection health ──────────────────────────────────────────
    async def close(self) -> None:
        await self._r.aclose()


async def get_redis() -> AsyncGenerator[RedisClient, None]:
    """FastAPI dependency that yields a scoped RedisClient per request."""
    client = aioredis.Redis(connection_pool=get_pool())
    wrapped = RedisClient(client)
    try:
        yield wrapped
    finally:
        await client.aclose()
