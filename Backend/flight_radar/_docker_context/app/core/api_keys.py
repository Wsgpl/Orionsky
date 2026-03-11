"""
API key utilities and Redis-backed key lifecycle helpers.
"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

import redis.asyncio as aioredis

from app.cache.redis_client import get_pool
from app.core.config import get_settings

settings = get_settings()


@dataclass
class ApiKeyRecord:
    name: str
    plan: str
    active: bool
    source: str  # static | redis


def hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return secrets.token_urlsafe(32)


def _static_match(raw_key: str) -> ApiKeyRecord | None:
    for name, configured in settings.api_keys.items():
        if raw_key == configured:
            return ApiKeyRecord(
                name=name,
                plan=settings.api_key_plans.get(name, settings.DEFAULT_API_PLAN),
                active=True,
                source="static",
            )
    return None


async def validate_api_key(raw_key: str) -> ApiKeyRecord | None:
    static = _static_match(raw_key)
    if static:
        return static

    key_hash = hash_api_key(raw_key)
    client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
    try:
        name = await client.get(f"apikey:lookup:{key_hash}")
        if not name:
            return None
        meta = await client.hgetall(f"apikey:meta:{name}")
        if not meta or meta.get("active") != "1":
            return None
        return ApiKeyRecord(
            name=name,
            plan=meta.get("plan", settings.DEFAULT_API_PLAN),
            active=True,
            source="redis",
        )
    finally:
        await client.aclose()


async def create_or_replace_key(
    name: str,
    plan: str,
    raw_key: str | None = None,
) -> str:
    key = raw_key or generate_api_key()
    key_hash = hash_api_key(key)
    now = datetime.now(tz=timezone.utc).isoformat()
    meta_key = f"apikey:meta:{name}"

    client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
    try:
        existing = await client.hgetall(meta_key)
        if existing.get("key_hash"):
            await client.delete(f"apikey:lookup:{existing['key_hash']}")

        await client.hset(
            meta_key,
            mapping={
                "name": name,
                "plan": plan,
                "active": "1",
                "key_hash": key_hash,
                "created_at": existing.get("created_at", now),
                "updated_at": now,
                "revoked_at": "",
            },
        )
        await client.set(f"apikey:lookup:{key_hash}", name)
        return key
    finally:
        await client.aclose()


async def revoke_key(name: str) -> bool:
    client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
    try:
        meta_key = f"apikey:meta:{name}"
        meta = await client.hgetall(meta_key)
        if not meta:
            return False
        if meta.get("key_hash"):
            await client.delete(f"apikey:lookup:{meta['key_hash']}")
        await client.hset(
            meta_key,
            mapping={
                "active": "0",
                "updated_at": datetime.now(tz=timezone.utc).isoformat(),
                "revoked_at": datetime.now(tz=timezone.utc).isoformat(),
            },
        )
        return True
    finally:
        await client.aclose()


async def list_keys() -> list[dict[str, str]]:
    client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
    try:
        rows: list[dict[str, str]] = []
        for name, _value in settings.api_keys.items():
            rows.append(
                {
                    "name": name,
                    "plan": settings.api_key_plans.get(name, settings.DEFAULT_API_PLAN),
                    "active": "1",
                    "source": "static",
                    "created_at": "",
                    "updated_at": "",
                    "revoked_at": "",
                }
            )

        keys = await client.keys("apikey:meta:*")
        for key in keys:
            meta = await client.hgetall(key)
            if not meta:
                continue
            rows.append(
                {
                    "name": meta.get("name", key.replace("apikey:meta:", "")),
                    "plan": meta.get("plan", settings.DEFAULT_API_PLAN),
                    "active": meta.get("active", "0"),
                    "source": "redis",
                    "created_at": meta.get("created_at", ""),
                    "updated_at": meta.get("updated_at", ""),
                    "revoked_at": meta.get("revoked_at", ""),
                }
            )
        rows.sort(key=lambda r: (r["source"], r["name"]))
        return rows
    finally:
        await client.aclose()

