"""Conflict detection schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Conflict(BaseModel):
    aircraft_1: str
    aircraft_2: str
    horizontal_km: float = Field(..., ge=0)
    vertical_ft: float = Field(..., ge=0)
    detection_model: str = Field(default="2.5D")


class PredictedConflict(Conflict):
    predicted_in_seconds: int = Field(..., ge=0)
    predicted_altitude_1_ft: float = Field(..., ge=0)
    predicted_altitude_2_ft: float = Field(..., ge=0)


class ConflictResponse(BaseModel):
    count: int
    detection_model: str = Field(default="2.5D")
    conflicts: list[Conflict]


class PredictedConflictResponse(BaseModel):
    count: int
    lookahead_seconds: int
    detection_model: str = Field(default="2.5D")
    conflicts: list[PredictedConflict]


class WeatherAdvisory(BaseModel):
    aircraft: str
    severity: str
    warnings: list[str]


class WeatherAdvisoryResponse(BaseModel):
    count: int
    advisories: list[WeatherAdvisory]
