"""Air-quality schemas owned by the Copernicus CAMS provider domain."""
from __future__ import annotations

from pydantic import BaseModel, Field


class AirQualityData(BaseModel):
    latitude: float
    longitude: float
    timestamp: str | None = None
    pm25: float | None = Field(default=None, ge=0)
    pm10: float | None = Field(default=None, ge=0)
    ozone: float | None = Field(default=None, ge=0)
    no2: float | None = Field(default=None, ge=0)
    so2: float | None = Field(default=None, ge=0)
    co: float | None = Field(default=None, ge=0)
    aqi_category: str | None = None
    source: str = Field(..., min_length=1)


class AirQualityCellResponse(BaseModel):
    cell_key: str
    data: AirQualityData


class AirQualityUnits(BaseModel):
    pm25: str = "ug/m3"
    pm10: str = "ug/m3"
    ozone: str = "kg/m2"
    no2: str = "kg/m2"
    so2: str = "kg/m2"
    co: str = "kg/m2"


class AirQualityGridResponse(BaseModel):
    source: str = Field(..., min_length=1)
    count: int
    units: AirQualityUnits = Field(default_factory=AirQualityUnits)
    cells: list[AirQualityCellResponse]
