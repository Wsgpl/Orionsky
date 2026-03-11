"""Aircraft API endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.dependencies import CurrentUser, Redis
from app.schemas.aircraft import AircraftListResponse
from app.services.aircraft_service import list_aircraft

router = APIRouter(prefix="/aircraft", tags=["Aircraft"])


@router.get("", response_model=AircraftListResponse)
async def get_aircraft(
    redis: Redis,
    _: CurrentUser,
) -> AircraftListResponse:
    """Return all aircraft currently tracked within the airspace."""
    return await list_aircraft(redis)
