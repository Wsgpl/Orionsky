"""Saved mission history endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, status

from app.core.dependencies import Redis, SessionUser
from app.schemas.mission_history import (
    MissionHistoryItem,
    MissionHistoryListResponse,
    MissionHistorySaveRequest,
)
from app.services.mission_history_service import list_mission_history, save_mission_history

router = APIRouter(prefix="/missions", tags=["Mission History"])
logger = logging.getLogger(__name__)


@router.get("", response_model=MissionHistoryListResponse)
async def get_mission_history(
    redis: Redis,
    current_user: SessionUser,
) -> MissionHistoryListResponse:
    response = await list_mission_history(redis, current_user)
    logger.info("Mission history listed", extra={"count": response.count})
    return response


@router.post("", response_model=MissionHistoryItem, status_code=status.HTTP_201_CREATED)
async def create_mission_history_entry(
    request: MissionHistorySaveRequest,
    redis: Redis,
    current_user: SessionUser,
) -> MissionHistoryItem:
    response = await save_mission_history(redis, current_user, request)
    logger.info(
        "Mission history entry created",
        extra={
            "mission_id": response.mission_id,
            "geometry_type": response.geometry_type,
            "coordinate_count": response.coordinate_count,
        },
    )
    return response
