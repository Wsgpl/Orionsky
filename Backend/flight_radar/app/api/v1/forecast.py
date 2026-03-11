"""Forecast API endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, Redis
from app.schemas.forecast import ForecastResponse
from app.services.forecast_service import get_forecast

router = APIRouter(prefix="/forecast", tags=["Forecast"])
logger = logging.getLogger(__name__)


@router.get("", response_model=ForecastResponse)
async def forecast(
    redis: Redis,
    _: CurrentUser,
    query: str | None = Query(default=None, min_length=1),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
) -> ForecastResponse:
    """Return current and forecast weather for a place query or coordinates."""
    logger.info(
        "Forecast API request",
        extra={"query": query, "lat": lat, "lon": lon},
    )
    response = await get_forecast(redis, query=query, lat=lat, lon=lon)
    logger.info(
        "Forecast API response",
        extra={
            "source": response.source,
            "hourly_count": len(response.hourly),
            "daily_count": len(response.daily),
        },
    )
    logger.debug(
        "Forecast API response payload",
        extra={
            "source": response.source,
            "current": response.current.model_dump(mode="json") if response.current else None,
            "first_hourly": response.hourly[0].model_dump(mode="json") if response.hourly else None,
            "first_daily": response.daily[0].model_dump(mode="json") if response.daily else None,
        },
    )
    return response
