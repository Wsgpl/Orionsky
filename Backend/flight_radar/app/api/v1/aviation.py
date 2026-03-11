"""Aviation weather API endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser, Redis
from app.schemas.aviation import (
    AviationAlertResponse,
    AviationForecastResponse,
    AviationMetarResponse,
)
from app.schemas.aviation_risk import AviationRiskResponse
from app.services.aviation_risk_service import get_aviation_risk_response
from app.services.aviation_weather_service import (
    get_metar_response,
    get_sigmet_response,
    get_taf_response,
)

router = APIRouter(prefix="/aviation", tags=["Aviation Weather"])
logger = logging.getLogger(__name__)


@router.get("/metar", response_model=AviationMetarResponse)
async def aviation_metar(
    redis: Redis,
    _: CurrentUser,
    ids: str = Query(..., min_length=1, description="Comma-separated station identifiers"),
) -> AviationMetarResponse:
    logger.info("Aviation METAR API request", extra={"ids": ids})
    response = await get_metar_response(redis, ids=ids)
    logger.info("Aviation METAR API response", extra={"ids": ids, "count": response.count})
    logger.debug(
        "Aviation METAR API response payload",
        extra={"ids": ids, "sample": response.metars[0].model_dump(mode="json") if response.metars else None},
    )
    return response


@router.get("/taf", response_model=AviationForecastResponse)
async def aviation_taf(
    redis: Redis,
    _: CurrentUser,
    ids: str = Query(..., min_length=1, description="Comma-separated station identifiers"),
) -> AviationForecastResponse:
    logger.info("Aviation TAF API request", extra={"ids": ids})
    response = await get_taf_response(redis, ids=ids)
    logger.info("Aviation TAF API response", extra={"ids": ids, "count": response.count})
    logger.debug(
        "Aviation TAF API response payload",
        extra={"ids": ids, "sample": response.tafs[0].model_dump(mode="json") if response.tafs else None},
    )
    return response


@router.get("/sigmet", response_model=AviationAlertResponse)
async def aviation_sigmet(
    redis: Redis,
    _: CurrentUser,
) -> AviationAlertResponse:
    logger.info("Aviation SIGMET API request")
    response = await get_sigmet_response(redis)
    logger.info("Aviation SIGMET API response", extra={"count": response.count})
    logger.debug(
        "Aviation SIGMET API response payload",
        extra={"sample": response.sigmets[0].model_dump(mode="json") if response.sigmets else None},
    )
    return response


@router.get("/risk", response_model=AviationRiskResponse)
async def aviation_risk(
    redis: Redis,
    _: CurrentUser,
    lat: float = Query(..., ge=-90, le=90, description="Latitude for risk evaluation"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude for risk evaluation"),
) -> AviationRiskResponse:
    logger.info("Aviation risk API request", extra={"lat": lat, "lon": lon})
    response = await get_aviation_risk_response(redis, lat=lat, lon=lon)
    logger.info(
        "Aviation risk API response",
        extra={
            "lat": lat,
            "lon": lon,
            "overall_level": response.overall_level,
            "score": response.score,
            "factor_count": response.factor_count,
        },
    )
    logger.debug(
        "Aviation risk API payload",
        extra={"lat": lat, "lon": lon, "payload": response.model_dump(mode="json")},
    )
    return response
