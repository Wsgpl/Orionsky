"""Redis-backed per-user mission history service."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
import logging
from uuid import uuid4

from pydantic import ValidationError

from app.cache.redis_client import RedisClient
from app.schemas.mission_history import (
    MissionHistoryItem,
    MissionHistoryListResponse,
    MissionHistorySaveRequest,
)

logger = logging.getLogger(__name__)

MISSION_HISTORY_KEY_PREFIX = "mission_history"


def _owner_namespace(owner_subject: str) -> str:
    return hashlib.sha256(owner_subject.encode("utf-8")).hexdigest()


def _mission_history_key(owner_subject: str, mission_id: str) -> str:
    owner_key = _owner_namespace(owner_subject)
    return f"{MISSION_HISTORY_KEY_PREFIX}:{owner_key}:{mission_id}"


def _mission_history_pattern(owner_subject: str) -> str:
    owner_key = _owner_namespace(owner_subject)
    return f"{MISSION_HISTORY_KEY_PREFIX}:{owner_key}:*"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _mission_name(payload: MissionHistorySaveRequest) -> str:
    return (payload.mission.metadata.name or payload.mission.geometry.name or "").strip()


async def save_mission_history(
    redis: RedisClient,
    owner_subject: str,
    payload: MissionHistorySaveRequest,
) -> MissionHistoryItem:
    now = _utc_now()
    mission = payload.mission
    mission_id = str(uuid4())
    geometry = mission.geometry
    item = MissionHistoryItem(
        mission_id=mission_id,
        mission_name=_mission_name(payload),
        geometry_type=geometry.type,
        coordinate_count=len(geometry.coordinates),
        sample_spacing_km=payload.sample_spacing_km,
        saved_at=now,
        updated_at=now,
        mission=mission,
    )
    await redis.set_json(
        _mission_history_key(owner_subject, mission_id),
        item.model_dump(mode="json"),
    )
    logger.info(
        "Mission history saved",
        extra={
            "mission_id": mission_id,
            "geometry_type": geometry.type,
            "coordinate_count": len(geometry.coordinates),
        },
    )
    return item


async def list_mission_history(
    redis: RedisClient,
    owner_subject: str,
) -> MissionHistoryListResponse:
    keys = await redis.keys(_mission_history_pattern(owner_subject))
    missions: list[MissionHistoryItem] = []

    for key in keys:
        raw = await redis.get_json(key)
        if not isinstance(raw, dict):
            continue
        try:
            missions.append(MissionHistoryItem.model_validate(raw))
        except ValidationError as exc:
            logger.warning("Skipping malformed mission history entry %s: %s", key, exc)

    missions.sort(key=lambda item: item.saved_at, reverse=True)
    return MissionHistoryListResponse(count=len(missions), missions=missions)
