"""Air-quality API endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, Redis
from app.schemas.air_quality import AirQualityGridResponse
from app.services.air_quality_service import get_air_quality_grid

router = APIRouter(prefix="/air-quality", tags=["Air Quality"])
logger = logging.getLogger(__name__)


@router.get("", response_model=AirQualityGridResponse)
async def air_quality_grid(
    redis: Redis,
    _: CurrentUser,
) -> AirQualityGridResponse:
    logger.info("Air-quality API request")
    response = await get_air_quality_grid(redis)
    logger.info(
        "Air-quality API response",
        extra={"source": response.source, "count": response.count},
    )
    logger.debug(
        "Air-quality API response payload",
        extra={"source": response.source, "sample": response.cells[0].model_dump(mode="json") if response.cells else None},
    )
    return response
