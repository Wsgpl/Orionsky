"""General weather schemas owned by the Open-Meteo provider domain."""
from __future__ import annotations

from pydantic import BaseModel, Field


class GeneralWeatherData(BaseModel):
    latitude: float
    longitude: float
    temperature: float = Field(..., description="Celsius")
    precip_mm: float | None = Field(default=None, ge=0, description="Millimetres")
    humidity: float = Field(..., ge=0, le=100)
    pressure: float = Field(..., description="hPa")
    wind_speed: float = Field(..., ge=0, description="m/s")
    wind_direction: float = Field(..., ge=0, le=360)  # le not lt — 360 is valid
    cloud_cover: float = Field(..., ge=0, le=100)
    visibility: float = Field(..., ge=0, description="Metres")
    condition: str | None = None
    source: str = Field(default="openmeteo", min_length=1)


class WeatherData(GeneralWeatherData):
    """Backward-compatible alias for the general weather contract."""
    pass


class WeatherCellResponse(BaseModel):
    cell_key: str
    data: GeneralWeatherData


class WeatherGridResponse(BaseModel):
    count: int
    cells: list[WeatherCellResponse]
