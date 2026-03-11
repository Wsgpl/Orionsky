"""Weather data schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class WeatherData(BaseModel):
    latitude: float
    longitude: float
    temperature: float = Field(..., description="Celsius")
    humidity: float = Field(..., ge=0, le=100)
    pressure: float = Field(..., description="hPa")
    wind_speed: float = Field(..., ge=0, description="m/s")
    wind_direction: float = Field(..., ge=0, le=360)  # le not lt — 360 is valid
    cloud_cover: float = Field(..., ge=0, le=100)
    visibility: float = Field(..., ge=0, description="Metres")
    condition: str
    source: str = "openweather"


class WeatherCellResponse(BaseModel):
    cell_key: str
    data: WeatherData


class WeatherGridResponse(BaseModel):
    count: int
    cells: list[WeatherCellResponse]