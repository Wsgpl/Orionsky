"""
Application configuration loaded from environment variables via Pydantic Settings.
All sensitive values (API keys, secrets) MUST be provided via environment or .env file.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ────────────────────────────────────────────────
    APP_NAME: str = "FlightRadar Intelligence Backend"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    DEBUG: bool = False

    # ── Server ─────────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4
    WORKER_TIMEOUT: int = 120
    API_PREFIX: str = "/api/v1"
    ENABLE_LEGACY_UNPREFIXED_ROUTES: bool = True

    # ── Security / JWT ─────────────────────────────────────────────
    SECRET_KEY: str = Field(..., description="JWT signing secret, min 32 chars")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AUTH_USERNAME: str = "admin"
    AUTH_PASSWORD_HASH: str | None = Field(
        default=None,
        description="bcrypt hash for AUTH_USERNAME password",
    )
    REQUIRE_API_KEY: bool = False
    API_KEYS: str = ""  # comma-separated: "public:your-key,partner:another-key"
    EXPOSE_DOCS_IN_PRODUCTION: bool = False
    DEFAULT_API_PLAN: str = "free"
    API_KEY_PLANS: str = ""  # name:plan,name2:plan2
    PLAN_REQUEST_LIMITS: str = "free:60,pro:300,enterprise:1200"
    ENABLE_API_USAGE_LOGGING: bool = True
    API_USAGE_LOG_RETENTION_DAYS: int = 90

    # ── Redis ──────────────────────────────────────────────────────
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str | None = None
    REDIS_MAX_CONNECTIONS: int = 20
    REDIS_SOCKET_TIMEOUT: float = 5.0
    REDIS_SOCKET_CONNECT_TIMEOUT: float = 3.0
    REDIS_HEALTH_CHECK_INTERVAL: int = 30

    # ── OpenSky API ────────────────────────────────────────────────
    OPENSKY_URL: str = "https://opensky-network.org/api/states/all"
    OPENSKY_USERNAME: str | None = None
    OPENSKY_PASSWORD: str | None = None
    OPENSKY_TIMEOUT: float = 15.0
    OPENSKY_POLL_INTERVAL: int = 15
    OPENSKY_MAX_RETRIES: int = 3
    OPENSKY_BACKOFF_FACTOR: float = 2.0
    OPENSKY_CB_FAILURE_THRESHOLD: int = 5
    OPENSKY_CB_RECOVERY_TIMEOUT: int = 60

    # Aircraft source selection
    AIRCRAFT_SOURCES: str = "opensky"  # comma-separated: opensky,adsblol,icao

    # ADSB.lol API
    ADSBLOL_BASE_URL: str = "https://api.adsb.lol"
    ADSBLOL_RADIUS_NM: int = 400
    ADSBLOL_TIMEOUT: float = 15.0
    ADSBLOL_MAX_RETRIES: int = 3
    ADSBLOL_BACKOFF_FACTOR: float = 2.0
    ADSBLOL_CB_FAILURE_THRESHOLD: int = 5
    ADSBLOL_CB_RECOVERY_TIMEOUT: int = 60
    ADSBLOL_API_KEY: str | None = None

    # ICAO API (optional custom aircraft endpoint)
    ICAO_API_KEY: str | None = None
    ICAO_AIRCRAFT_URL: str | None = None
    ICAO_TIMEOUT: float = 15.0
    ICAO_MAX_RETRIES: int = 3
    ICAO_BACKOFF_FACTOR: float = 2.0
    ICAO_CB_FAILURE_THRESHOLD: int = 5
    ICAO_CB_RECOVERY_TIMEOUT: int = 60

    # ── OpenWeather API ────────────────────────────────────────────
    OPENWEATHER_API_KEY: str | None = Field(default=None, description="OpenWeatherMap API key")
    OPENWEATHER_BASE_URL: str = "https://api.openweathermap.org/data/2.5/weather"
    OPENWEATHER_TIMEOUT: float = 10.0
    OPENWEATHER_POLL_INTERVAL: int = 300
    OPENWEATHER_MAX_RETRIES: int = 3
    OPENWEATHER_BACKOFF_FACTOR: float = 2.0
    OPENWEATHER_CB_FAILURE_THRESHOLD: int = 5
    OPENWEATHER_CB_RECOVERY_TIMEOUT: int = 120
    OPENWEATHER_CACHE_TTL: int = 600

    # AviationWeather.gov Data API (METAR-based weather)
    WEATHER_SOURCE: Literal["openweather", "aviationweather", "icao"] = "openweather"
    AVIATIONWEATHER_BASE_URL: str = "https://aviationweather.gov/api/data/metar"
    AVIATIONWEATHER_TIMEOUT: float = 20.0
    AVIATIONWEATHER_HOURS: float = 1.0
    AVIATIONWEATHER_MAX_RETRIES: int = 3
    AVIATIONWEATHER_BACKOFF_FACTOR: float = 2.0
    AVIATIONWEATHER_CB_FAILURE_THRESHOLD: int = 5
    AVIATIONWEATHER_CB_RECOVERY_TIMEOUT: int = 120

    # ICAO weather (optional custom endpoint returning weather records)
    ICAO_WEATHER_URL: str | None = None

    # ── Airspace Bounds (India) ────────────────────────────────────
    AIRSPACE_MIN_LAT: float = 6.0
    AIRSPACE_MAX_LAT: float = 38.0
    AIRSPACE_MIN_LON: float = 68.0
    AIRSPACE_MAX_LON: float = 98.0
    WEATHER_GRID_STEP: int = 3

    # ── Conflict Engine ────────────────────────────────────────────
    CONFLICT_H_SEP_KM: float = 10.0
    CONFLICT_V_SEP_FT: float = 1000.0
    CONFLICT_LOOKAHEAD_SECONDS: int = 600
    CONFLICT_GRID_H_CELL_KM: float = 10.0
    CONFLICT_GRID_V_CELL_FT: float = 1000.0

    # ── Rate Limiting ──────────────────────────────────────────────
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 60
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    # ── Logging ───────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: Literal["json", "text"] = "json"
    CORS_ALLOWED_ORIGINS: str = ""

    # ── Metrics ───────────────────────────────────────────────────
    METRICS_ENABLED: bool = True

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}")
        return upper

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v

    @field_validator("AUTH_USERNAME")
    @classmethod
    def validate_auth_username(cls, v: str) -> str:
        username = v.strip()
        if not username:
            raise ValueError("AUTH_USERNAME cannot be empty")
        return username

    @field_validator("API_PREFIX")
    @classmethod
    def validate_api_prefix(cls, v: str) -> str:
        prefix = v.strip()
        if not prefix:
            raise ValueError("API_PREFIX cannot be empty")
        if not prefix.startswith("/"):
            raise ValueError("API_PREFIX must start with '/'")
        if len(prefix) > 1 and prefix.endswith("/"):
            prefix = prefix[:-1]
        return prefix

    @field_validator("AIRCRAFT_SOURCES")
    @classmethod
    def validate_aircraft_sources(cls, v: str) -> str:
        allowed = {"opensky", "adsblol", "icao"}
        items = [item.strip().lower() for item in v.split(",") if item.strip()]
        if not items:
            raise ValueError("AIRCRAFT_SOURCES must include at least one source")
        unknown = [item for item in items if item not in allowed]
        if unknown:
            raise ValueError(f"Unknown AIRCRAFT_SOURCES values: {unknown}")
        return ",".join(items)

    @field_validator("API_KEYS")
    @classmethod
    def validate_api_keys(cls, v: str) -> str:
        items = [item.strip() for item in v.split(",") if item.strip()]
        for item in items:
            if ":" not in item:
                raise ValueError("Each API_KEYS entry must be in name:key format")
            name, key = item.split(":", 1)
            if not name.strip() or len(key.strip()) < 16:
                raise ValueError("API key entries must have non-empty name and key length >= 16")
        return ",".join(items)

    @field_validator("API_KEY_PLANS")
    @classmethod
    def validate_api_key_plans(cls, v: str) -> str:
        items = [item.strip() for item in v.split(",") if item.strip()]
        for item in items:
            if ":" not in item:
                raise ValueError("Each API_KEY_PLANS entry must be in name:plan format")
            name, plan = item.split(":", 1)
            if not name.strip() or not plan.strip():
                raise ValueError("API_KEY_PLANS entries must include name and plan")
        return ",".join(items)

    @field_validator("PLAN_REQUEST_LIMITS")
    @classmethod
    def validate_plan_request_limits(cls, v: str) -> str:
        items = [item.strip() for item in v.split(",") if item.strip()]
        for item in items:
            if ":" not in item:
                raise ValueError("Each PLAN_REQUEST_LIMITS entry must be in plan:limit format")
            plan, limit = item.split(":", 1)
            if not plan.strip():
                raise ValueError("PLAN_REQUEST_LIMITS plan name cannot be empty")
            if int(limit.strip()) <= 0:
                raise ValueError("PLAN_REQUEST_LIMITS limit must be > 0")
        return ",".join(items)

    @model_validator(mode="after")
    def validate_source_requirements(self) -> "Settings":
        if self.is_production:
            if not self.AUTH_PASSWORD_HASH:
                raise ValueError("AUTH_PASSWORD_HASH is required when ENVIRONMENT=production")
            if not self.CORS_ALLOWED_ORIGINS:
                raise ValueError("CORS_ALLOWED_ORIGINS is required when ENVIRONMENT=production")
            if self.ENABLE_LEGACY_UNPREFIXED_ROUTES:
                raise ValueError(
                    "ENABLE_LEGACY_UNPREFIXED_ROUTES must be false when ENVIRONMENT=production"
                )
        if self.REQUIRE_API_KEY and not self.API_KEYS:
            raise ValueError("API_KEYS must be configured when REQUIRE_API_KEY=true")
        if self.WEATHER_SOURCE == "openweather" and not self.OPENWEATHER_API_KEY:
            raise ValueError("OPENWEATHER_API_KEY is required when WEATHER_SOURCE=openweather")
        if self.WEATHER_SOURCE == "icao" and not self.ICAO_WEATHER_URL:
            raise ValueError("ICAO_WEATHER_URL is required when WEATHER_SOURCE=icao")
        if "icao" in self.aircraft_sources and not self.ICAO_AIRCRAFT_URL:
            raise ValueError("ICAO_AIRCRAFT_URL is required when AIRCRAFT_SOURCES includes icao")
        return self

    @property
    def redis_url(self) -> str:
        auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cors_allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]

    @property
    def aircraft_sources(self) -> list[str]:
        return [item.strip() for item in self.AIRCRAFT_SOURCES.split(",") if item.strip()]

    @property
    def api_keys(self) -> dict[str, str]:
        keys: dict[str, str] = {}
        for item in [part.strip() for part in self.API_KEYS.split(",") if part.strip()]:
            name, key = item.split(":", 1)
            keys[name.strip()] = key.strip()
        return keys

    @property
    def api_key_plans(self) -> dict[str, str]:
        plans: dict[str, str] = {}
        for item in [part.strip() for part in self.API_KEY_PLANS.split(",") if part.strip()]:
            name, plan = item.split(":", 1)
            plans[name.strip()] = plan.strip()
        return plans

    @property
    def plan_request_limits(self) -> dict[str, int]:
        limits: dict[str, int] = {}
        for item in [part.strip() for part in self.PLAN_REQUEST_LIMITS.split(",") if part.strip()]:
            plan, limit = item.split(":", 1)
            limits[plan.strip()] = int(limit.strip())
        return limits


@lru_cache
def get_settings() -> Settings:
    """Return cached singleton Settings instance."""
    return Settings()  # type: ignore[call-arg]
