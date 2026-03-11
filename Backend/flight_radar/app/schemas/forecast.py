"""Forecast schemas for provider-normalized weather forecast responses."""
from __future__ import annotations

from pydantic import BaseModel, Field


class ForecastLocation(BaseModel):
    query: str
    latitude: float | None = None
    longitude: float | None = None


class ForecastCurrent(BaseModel):
    source: str = Field(..., min_length=1)
    temperature: float = Field(..., description="Celsius")
    apparent_temperature: float | None = Field(default=None, description="Celsius")
    humidity: float = Field(..., ge=0, le=100)
    pressure: float = Field(..., description="hPa")
    wind_speed: float = Field(..., ge=0, description="m/s")
    wind_direction: float = Field(..., ge=0, le=360)
    precipitation_amount: float | None = None
    cloud_cover: float = Field(..., ge=0, le=100)
    visibility: float = Field(..., ge=0, description="Metres")
    condition: str | None = None
    observed_at: str | None = None


class ForecastHourly(BaseModel):
    source: str = Field(..., min_length=1)
    time: str
    temperature: float | None = None
    humidity: float | None = None
    pressure: float | None = None
    wind_speed: float | None = None
    wind_direction: float | None = None
    cloud_cover: float | None = None
    visibility: float | None = None
    precipitation_probability: float | None = None
    precipitation_amount: float | None = None
    condition: str | None = None


class ForecastDaily(BaseModel):
    source: str = Field(..., min_length=1)
    date: str
    temp_min: float | None = None
    temp_max: float | None = None
    wind_speed: float | None = None
    precipitation_probability: float | None = None
    precipitation_amount: float | None = None
    condition: str | None = None


class ForecastResponse(BaseModel):
    source: str
    location: ForecastLocation
    current: ForecastCurrent | None = None
    hourly: list[ForecastHourly] = Field(default_factory=list)
    daily: list[ForecastDaily] = Field(default_factory=list)


class HourlyForecastItem(ForecastHourly):
    """Backward-compatible alias for forecast hourly items."""


class DailyForecastItem(ForecastDaily):
    """Backward-compatible alias for forecast daily items."""
