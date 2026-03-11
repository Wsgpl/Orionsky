"""Aircraft data schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class AircraftState(BaseModel):
    icao: str = Field(..., description="ICAO 24-bit address")
    callsign: str | None = Field(None, description="Aircraft callsign")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude: float = Field(..., ge=0, description="Altitude in feet")
    velocity: float = Field(..., ge=0, description="Ground speed in km/h")
    heading: float = Field(..., ge=0, lt=360, description="True track in degrees")
    on_ground: bool = False


class AircraftListResponse(BaseModel):
    count: int
    aircraft: list[AircraftState]
