"""Derived aviation risk schemas built from existing provider domains."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AviationRiskCategory = Literal[
    "wind",
    "visibility",
    "precipitation",
    "storm",
    "ceiling",
    "disaster",
    "air_quality",
]
AviationRiskLevel = Literal["low", "medium", "high"]


class AviationRiskAirportContext(BaseModel):
    icao: str = Field(..., min_length=1)
    iata: str | None = None
    name: str = Field(..., min_length=1)
    city: str = Field(..., min_length=1)
    country: str = Field(..., min_length=1)
    latitude: float
    longitude: float
    distance_km: float = Field(..., ge=0)


class AviationRiskItem(BaseModel):
    category: AviationRiskCategory
    level: AviationRiskLevel | None = None
    value: float | str | None = None
    threshold_used: str | None = None
    source: str | None = None
    explanation: str = Field(..., min_length=1)


class AviationRiskResponse(BaseModel):
    latitude: float
    longitude: float
    evaluated_at: str
    nearest_airport: AviationRiskAirportContext | None = None
    overall_level: AviationRiskLevel | None = None
    score: float | None = Field(default=None, ge=1, le=3)
    factor_count: int = Field(default=0, ge=0)
    factors: list[AviationRiskItem] = Field(default_factory=list)
