"""
Database models for dynamic configuration.
Supports multi-tenancy, regional settings, and flexible business rules.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class UnitSystem(str, Enum):
    METRIC = "metric"
    IMPERIAL = "imperial"
    MIXED = "mixed"


class TemperatureUnit(str, Enum):
    CELSIUS = "celsius"
    FAHRENHEIT = "fahrenheit"
    KELVIN = "kelvin"


class DistanceUnit(str, Enum):
    KILOMETERS = "km"
    MILES = "mi"
    NAUTICAL_MILES = "nm"


class AltitudeUnit(str, Enum):
    FEET = "feet"
    METERS = "meters"


class SpeedUnit(str, Enum):
    KMH = "kmh"
    MPH = "mph"
    KNOTS = "knots"
    MS = "ms"


class Region(BaseModel):
    """Geographic region configuration."""
    id: str
    name: str
    min_lat: float = Field(..., ge=-90, le=90)
    max_lat: float = Field(..., ge=-90, le=90)
    min_lon: float = Field(..., ge=-180, le=180)
    max_lon: float = Field(..., ge=-180, le=180)
    weather_grid_step: float = Field(default=3.0, gt=0)
    timezone: str = "UTC"
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WeatherThresholds(BaseModel):
    """Weather advisory thresholds."""
    id: str
    region_id: str | None = None  # None = global default
    name: str
    
    # Wind thresholds (m/s)
    wind_severe: float = Field(default=20.0, gt=0)
    wind_moderate: float = Field(default=12.0, gt=0)
    
    # Visibility thresholds (meters)
    visibility_very_low: float = Field(default=2000.0, gt=0)
    visibility_reduced: float = Field(default=5000.0, gt=0)
    
    # Cloud cover threshold (%)
    cloud_cover_dense: float = Field(default=90.0, ge=0, le=100)
    
    # Precipitation keywords for detection
    precipitation_keywords: list[str] = Field(
        default_factory=lambda: ["rain", "storm", "thunder", "snow", "hail"]
    )
    
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ConflictParameters(BaseModel):
    """Conflict detection parameters by airspace class."""
    id: str
    region_id: str | None = None
    airspace_class: str  # A, B, C, D, E, G
    name: str
    
    # Separation standards
    horizontal_separation_km: float = Field(default=10.0, gt=0)
    vertical_separation_ft: float = Field(default=1000.0, gt=0)
    
    # Prediction
    lookahead_seconds: int = Field(default=600, gt=0)
    
    # Grid cell sizes for spatial indexing
    grid_h_cell_km: float = Field(default=10.0, gt=0)
    grid_v_cell_ft: float = Field(default=1000.0, gt=0)
    
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RateLimitPlan(BaseModel):
    """API rate limit plan configuration."""
    id: str
    name: str
    display_name: str
    requests_per_minute: int = Field(..., gt=0)
    requests_per_hour: int | None = None
    requests_per_day: int | None = None
    features: list[str] = Field(default_factory=list)
    price_monthly: float | None = None
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TenantConfig(BaseModel):
    """Multi-tenant configuration."""
    id: str
    name: str
    slug: str  # URL-safe identifier
    
    # Branding
    display_name: str
    logo_url: str | None = None
    primary_color: str = "#1a73e8"
    
    # Regional settings
    default_region_id: str
    allowed_region_ids: list[str] = Field(default_factory=list)
    
    # Unit preferences
    unit_system: UnitSystem = UnitSystem.METRIC
    temperature_unit: TemperatureUnit = TemperatureUnit.CELSIUS
    distance_unit: DistanceUnit = DistanceUnit.KILOMETERS
    altitude_unit: AltitudeUnit = AltitudeUnit.FEET
    speed_unit: SpeedUnit = SpeedUnit.KMH
    
    # Feature flags
    features: dict[str, bool] = Field(default_factory=dict)
    
    # Redis namespace
    redis_namespace: str
    
    # Rate limit plan
    rate_limit_plan_id: str
    
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Airport(BaseModel):
    """Airport/aerodrome information."""
    id: str
    icao: str
    iata: str | None = None
    name: str
    city: str
    country: str
    region_id: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    elevation_ft: float | None = None
    timezone: str = "UTC"
    active: bool = True


class Location(BaseModel):
    """Named location (city, landmark, etc.)."""
    id: str
    name: str
    display_name: str
    country: str
    region_id: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    type: str  # city, landmark, waypoint, etc.
    active: bool = True


class DataSourceConfig(BaseModel):
    """External data source configuration."""
    id: str
    name: str
    type: str  # aircraft, weather, forecast
    provider: str  # opensky, adsblol, icao, openmeteo, etc.
    
    # Connection settings
    base_url: str | None = None
    api_key: str | None = None
    username: str | None = None
    password: str | None = None
    
    # Behavior
    timeout_seconds: float = Field(default=15.0, gt=0)
    poll_interval_seconds: int = Field(default=15, gt=0)
    max_retries: int = Field(default=3, ge=0)
    backoff_factor: float = Field(default=2.0, gt=0)
    
    # Circuit breaker
    cb_failure_threshold: int = Field(default=5, gt=0)
    cb_recovery_timeout_seconds: int = Field(default=60, gt=0)
    
    # Cache
    cache_ttl_seconds: int | None = None
    
    # Priority (lower = higher priority for multi-source)
    priority: int = Field(default=100, ge=0)
    
    # Regional restrictions
    allowed_region_ids: list[str] = Field(default_factory=list)
    
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class I18nString(BaseModel):
    """Internationalized string."""
    key: str
    locale: str  # en, es, fr, de, ja, etc.
    value: str
    context: str | None = None


class SystemConfig(BaseModel):
    """Global system configuration."""
    id: str = "system"
    
    # Default values
    default_region_id: str
    default_unit_system: UnitSystem = UnitSystem.METRIC
    default_language: str = "en"
    
    # Earth model
    earth_radius_km: float = 6371.0  # Mean radius
    use_wgs84_ellipsoid: bool = False
    
    # Polling defaults
    default_aircraft_poll_interval: int = 15
    default_weather_poll_interval: int = 300
    
    # Redis defaults
    default_cache_ttl: int = 600
    
    # Security
    jwt_expire_minutes: int = 60
    api_key_min_length: int = 32
    
    # Rate limiting
    default_rate_limit_requests: int = 60
    default_rate_limit_window: int = 60
    
    # Features
    enable_multi_tenancy: bool = False
    enable_white_label: bool = False
    enable_i18n: bool = True
    
    updated_at: datetime = Field(default_factory=datetime.utcnow)
