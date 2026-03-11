from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    plan: str = Field(default="free", min_length=1, max_length=32)
    key: str | None = Field(default=None, min_length=16)


class ApiKeyRotateRequest(BaseModel):
    plan: str | None = Field(default=None, min_length=1, max_length=32)


class ApiKeySecretResponse(BaseModel):
    name: str
    plan: str
    api_key: str
    note: str = "Store this key securely. It may not be shown again."


class ApiKeyItem(BaseModel):
    name: str
    plan: str
    active: bool
    source: str
    created_at: str | None = None
    updated_at: str | None = None
    revoked_at: str | None = None


class ApiKeyListResponse(BaseModel):
    count: int
    keys: list[ApiKeyItem]


class UsageRow(BaseModel):
    endpoint: str
    requests: int


class DailyUsage(BaseModel):
    date: date
    total: int
    ok_2xx: int
    client_4xx: int
    server_5xx: int
    by_endpoint: list[UsageRow]


class UsageReportResponse(BaseModel):
    api_key_name: str
    plan: str
    start_date: date
    end_date: date
    days: list[DailyUsage]
    total_requests: int
