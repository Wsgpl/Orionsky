"""Disaster context API endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, Redis
from app.schemas.disaster import DisasterContextResponse
from app.services.disaster_context_service import get_disaster_contexts

router = APIRouter(prefix="/disasters", tags=["Disaster Context"])
logger = logging.getLogger(__name__)


@router.get("", response_model=DisasterContextResponse)
async def disaster_contexts(
    redis: Redis,
    _: CurrentUser,
) -> DisasterContextResponse:
    logger.info("Disaster API request")
    response = await get_disaster_contexts(redis)
    logger.info(
        "Disaster API response",
        extra={"source": response.source, "count": response.count},
    )
    logger.debug(
        "Disaster API response payload",
        extra={"source": response.source, "sample": response.events[0].model_dump(mode="json") if response.events else None},
    )
    return response
