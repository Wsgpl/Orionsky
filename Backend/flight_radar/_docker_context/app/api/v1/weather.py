"""Weather API endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, Redis
from app.schemas.conflict import WeatherAdvisoryResponse
from app.schemas.weather import WeatherGridResponse
from app.services.weather_service import get_weather_advisories, get_weather_grid

router = APIRouter(prefix="/weather", tags=["Weather"])


@router.get("", response_model=WeatherGridResponse)
async def get_weather(
    redis: Redis,
    _: CurrentUser,
) -> WeatherGridResponse:
    """Return the cached weather grid."""
    return await get_weather_grid(redis)


@router.get("/advisories", response_model=WeatherAdvisoryResponse)
async def weather_advisories(
    redis: Redis,
    _: CurrentUser,
) -> WeatherAdvisoryResponse:
    """Generate weather advisories for all tracked aircraft."""
    return await get_weather_advisories(redis)
