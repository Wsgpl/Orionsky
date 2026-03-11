from __future__ import annotations

from datetime import date, timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query, status

from app.cache.redis_client import get_pool
from app.core.api_keys import create_or_replace_key, list_keys, revoke_key
from app.core.config import get_settings
from app.core.dependencies import AdminUser
from app.schemas.api_keys import (
    ApiKeyCreateRequest,
    ApiKeyItem,
    ApiKeyListResponse,
    ApiKeyRotateRequest,
    ApiKeySecretResponse,
    DailyUsage,
    UsageReportResponse,
    UsageRow,
)

router = APIRouter(prefix="/api-keys", tags=["API Keys"])
settings = get_settings()


@router.post("", response_model=ApiKeySecretResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    _: AdminUser,
) -> ApiKeySecretResponse:
    raw = await create_or_replace_key(
        name=payload.name.strip(),
        plan=payload.plan.strip(),
        raw_key=payload.key.strip() if payload.key else None,
    )
    return ApiKeySecretResponse(name=payload.name.strip(), plan=payload.plan.strip(), api_key=raw)


@router.get("", response_model=ApiKeyListResponse)
async def get_api_keys(
    _: AdminUser,
) -> ApiKeyListResponse:
    rows = await list_keys()
    keys = [
        ApiKeyItem(
            name=row["name"],
            plan=row["plan"],
            active=row["active"] == "1",
            source=row["source"],
            created_at=row.get("created_at") or None,
            updated_at=row.get("updated_at") or None,
            revoked_at=row.get("revoked_at") or None,
        )
        for row in rows
    ]
    return ApiKeyListResponse(count=len(keys), keys=keys)


@router.post("/{name}/rotate", response_model=ApiKeySecretResponse)
async def rotate_api_key(
    name: str,
    payload: ApiKeyRotateRequest,
    _: AdminUser,
) -> ApiKeySecretResponse:
    rows = await list_keys()
    current = next((row for row in rows if row["name"] == name), None)
    if current is None:
        raise HTTPException(status_code=404, detail="API key not found")

    plan = payload.plan or current["plan"]
    raw = await create_or_replace_key(name=name, plan=plan)
    return ApiKeySecretResponse(name=name, plan=plan, api_key=raw)


@router.post("/{name}/revoke")
async def revoke_api_key(
    name: str,
    _: AdminUser,
) -> dict[str, str]:
    ok = await revoke_key(name)
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "revoked", "name": name}


@router.get("/{name}/usage", response_model=UsageReportResponse)
async def key_usage_report(
    name: str,
    _: AdminUser,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
) -> UsageReportResponse:
    end = end_date or date.today()
    start = start_date or (end - timedelta(days=6))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")

    rows = await list_keys()
    current = next((row for row in rows if row["name"] == name), None)
    if current is None:
        raise HTTPException(status_code=404, detail="API key not found")

    client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
    try:
        days: list[DailyUsage] = []
        total_requests = 0
        cursor = start
        while cursor <= end:
            key = f"usage:{name}:{cursor.isoformat()}"
            raw = await client.hgetall(key)
            endpoint_rows: list[UsageRow] = []
            for field, value in raw.items():
                if field.startswith("__"):
                    continue
                endpoint_rows.append(UsageRow(endpoint=field, requests=int(value)))

            total = int(raw.get("__total__", "0"))
            ok_2xx = int(raw.get("__2xx__", "0"))
            client_4xx = int(raw.get("__4xx__", "0"))
            server_5xx = int(raw.get("__5xx__", "0"))
            total_requests += total

            days.append(
                DailyUsage(
                    date=cursor,
                    total=total,
                    ok_2xx=ok_2xx,
                    client_4xx=client_4xx,
                    server_5xx=server_5xx,
                    by_endpoint=sorted(endpoint_rows, key=lambda x: x.requests, reverse=True),
                )
            )
            cursor += timedelta(days=1)
    finally:
        await client.aclose()

    return UsageReportResponse(
        api_key_name=name,
        plan=current["plan"],
        start_date=start,
        end_date=end,
        days=days,
        total_requests=total_requests,
    )

