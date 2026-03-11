"""Unified airspace snapshot endpoint."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.dependencies import CurrentUser, Redis
from app.schemas.aircraft import AircraftListResponse
from app.schemas.conflict import WeatherAdvisoryResponse
from app.schemas.weather import WeatherGridResponse
from app.services.aircraft_service import list_aircraft
from app.services.weather_service import get_weather_advisories, get_weather_grid

router = APIRouter(prefix="/snapshot", tags=["Snapshot"])


class SnapshotResponse(BaseModel):
    aircraft: AircraftListResponse
    weather: WeatherGridResponse
    advisories: WeatherAdvisoryResponse


@router.get("", response_model=SnapshotResponse)
async def full_snapshot(
    redis: Redis,
    _: CurrentUser,
) -> SnapshotResponse:
    """Return a point-in-time snapshot of the full airspace state."""
    aircraft, weather, advisories = (
        await list_aircraft(redis),
        await get_weather_grid(redis),
        await get_weather_advisories(redis),
    )
    return SnapshotResponse(
        aircraft=aircraft,
        weather=weather,
        advisories=advisories,
    )
