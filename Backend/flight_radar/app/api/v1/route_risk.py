"""Route-risk API endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, Redis
from app.schemas.route_risk import RouteRiskAnalyzeRequest, RouteRiskResponse
from app.services.route_risk_service import get_route_risk_response

router = APIRouter(prefix="/route-risk", tags=["Route Risk"])
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=RouteRiskResponse)
async def analyze_route_risk(
    request: RouteRiskAnalyzeRequest,
    redis: Redis,
    _: CurrentUser,
) -> RouteRiskResponse:
    mission = request.normalized_mission
    logger.info(
        "Route risk API request",
        extra={
            "mission_name": mission.metadata.name,
            "route_point_count": len(request.normalized_route),
            "sample_spacing_km": request.sample_spacing_km,
        },
    )
    response = await get_route_risk_response(redis, request)
    logger.info(
        "Route risk API response",
        extra={
            "route_point_count": response.route_point_count,
            "sample_point_count": response.sample_point_count,
            "overall_level": response.overall_level,
            "overall_score": response.overall_score,
        },
    )
    logger.debug(
        "Route risk API payload",
        extra={"payload": response.model_dump(mode="json")},
    )
    return response
