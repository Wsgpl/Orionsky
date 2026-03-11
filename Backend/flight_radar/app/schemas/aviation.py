"""Aviation weather schemas owned by the AWC provider domain."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AviationCloudLayer(BaseModel):
    coverage: str | None = None
    base_ft_agl: int | None = Field(default=None, ge=0)
    top_ft_agl: int | None = Field(default=None, ge=0)


class AviationAirportWeatherData(BaseModel):
    station_id: str = Field(..., min_length=1)
    latitude: float | None = None
    longitude: float | None = None
    observation_time: str | None = None
    raw_text: str | None = None
    visibility_sm: float | None = Field(default=None, ge=0)
    wind_speed_kt: float | None = Field(default=None, ge=0)
    wind_gust_kt: float | None = Field(default=None, ge=0)
    wind_direction_deg: float | None = Field(default=None, ge=0, le=360)
    temperature_c: float | None = None
    dewpoint_c: float | None = None
    altimeter_in_hg: float | None = Field(default=None, ge=0)
    pressure_hpa: float | None = Field(default=None, ge=0)
    ceiling_ft_agl: int | None = Field(default=None, ge=0)
    cloud_layers: list[AviationCloudLayer] = Field(default_factory=list)
    flight_category: str | None = None
    source: str = Field(..., min_length=1)


class AviationMetarResponse(BaseModel):
    count: int
    metars: list[AviationAirportWeatherData]


class AviationForecastPeriod(BaseModel):
    start_time: str | None = None
    end_time: str | None = None
    change_indicator: str | None = None
    probability_percent: int | None = Field(default=None, ge=0, le=100)
    raw_text: str | None = None
    visibility_sm: float | None = Field(default=None, ge=0)
    wind_speed_kt: float | None = Field(default=None, ge=0)
    wind_gust_kt: float | None = Field(default=None, ge=0)
    wind_direction_deg: float | None = Field(default=None, ge=0, le=360)
    cloud_layers: list[AviationCloudLayer] = Field(default_factory=list)
    weather: str | None = None
    source: str = Field(..., min_length=1)


class AviationForecastData(BaseModel):
    station_id: str = Field(..., min_length=1)
    issue_time: str | None = None
    valid_from: str | None = None
    valid_to: str | None = None
    raw_text: str | None = None
    forecast_periods: list[AviationForecastPeriod] = Field(default_factory=list)
    source: str = Field(..., min_length=1)


class AviationForecastResponse(BaseModel):
    count: int
    tafs: list[AviationForecastData]


class AviationAlertData(BaseModel):
    alert_id: str | None = None
    designator: str | None = None
    issued_at: str | None = None
    valid_from: str | None = None
    valid_to: str | None = None
    hazard_type: str | None = None
    description: str | None = None
    raw_text: str | None = None
    affected_region: str | None = None
    geometry: dict[str, Any] | None = None
    source: str = Field(..., min_length=1)


class AviationAlertResponse(BaseModel):
    count: int
    sigmets: list[AviationAlertData]
