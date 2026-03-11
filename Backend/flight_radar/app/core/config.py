"""
Application configuration loaded from environment variables via Pydantic Settings.
All sensitive values (API keys, secrets) MUST be provided via environment or .env file.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, field_validator, model_validator
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
    # Keep a single API process by default because aircraft/weather ingestion loops
    # are started inside the FastAPI app lifespan. Running multiple API workers would
    # duplicate those background tasks and can destabilize the live cache.
    WORKERS: int = 1
    WORKER_TIMEOUT: int = 120
    API_PREFIX: str = "/api/v1"
    ENABLE_LEGACY_UNPREFIXED_ROUTES: bool = True

    # ── Security / JWT ─────────────────────────────────────────────
    SECRET_KEY: str = Field(..., description="JWT signing secret, min 32 chars")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    AUTH_USERNAME: str = "admin"
    AUTH_PASSWORD: str | None = Field(
        default=None,
        description="plaintext password for AUTH_USERNAME, intended for local/private setups",
    )
    AUTH_PASSWORD_HASH: str | None = Field(
        default=None,
        description="bcrypt hash for AUTH_USERNAME password",
    )
    FRONTEND_APP_URL: str = "http://localhost:5173"
    AUTH_EMAIL_VERIFICATION_TTL_MINUTES: int = 60
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str | None = None
    SMTP_FROM_NAME: str = "FlightRadar Intelligence"
    SMTP_USE_STARTTLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: float = 20.0
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

    # ── Spire Aviation API (Primary Aircraft Source) ────────────────
    SPIRE_API_URL: str = "https://api.airsafe.spire.com/v2/targets/stream"
    SPIRE_API_TOKEN: str | None = None
    SPIRE_TIMEOUT: float = 30.0
    SPIRE_POLL_INTERVAL: int = 15
    SPIRE_COLLECTION_WINDOW_SECONDS: int = 12
    SPIRE_MAX_TARGETS_PER_POLL: int = 300
    SPIRE_MAX_RETRIES: int = 3
    SPIRE_BACKOFF_FACTOR: float = 2.0
    SPIRE_CB_FAILURE_THRESHOLD: int = 5
    SPIRE_CB_RECOVERY_TIMEOUT: int = 60

    # ── OpenSky API (Deprecated - use Spire instead) ────────────────
    OPENSKY_URL: str = "https://opensky-network.org/api/states/all"
    OPENSKY_USERNAME: str | None = None
    OPENSKY_PASSWORD: str | None = None
    OPENSKY_TIMEOUT: float = 15.0
    OPENSKY_POLL_INTERVAL: int = 15
    OPENSKY_MAX_RETRIES: int = 3
    OPENSKY_BACKOFF_FACTOR: float = 2.0
    OPENSKY_CB_FAILURE_THRESHOLD: int = 5
    OPENSKY_CB_RECOVERY_TIMEOUT: int = 60

    # Aircraft source selection (now using Spire as default)
    AIRCRAFT_SOURCES: str = "spire"  # comma-separated: spire,opensky,adsbexchange,adsblol,icao

    # ADS-B Exchange API
    ADSBEXCHANGE_BASE_URL: str = "https://gateway.adsbexchange.com"
    ADSBEXCHANGE_RADIUS_NM: int = 150
    ADSBEXCHANGE_TIMEOUT: float = 15.0
    ADSBEXCHANGE_MAX_RETRIES: int = 3
    ADSBEXCHANGE_BACKOFF_FACTOR: float = 2.0
    ADSBEXCHANGE_CB_FAILURE_THRESHOLD: int = 5
    ADSBEXCHANGE_CB_RECOVERY_TIMEOUT: int = 60
    ADSBEXCHANGE_API_KEY: str | None = None

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

    # ── Open-Meteo Weather Provider ────────────────────────────────
    GENERAL_WEATHER_PROVIDER: Literal["openmeteo"] = Field(
        default="openmeteo",
        validation_alias=AliasChoices("GENERAL_WEATHER_PROVIDER", "WEATHER_SOURCE"),
    )
    AVIATION_WEATHER_PROVIDER: Literal["awc"] = "awc"
    AIR_QUALITY_PROVIDER: Literal["copernicus_cams"] = "copernicus_cams"
    DISASTER_PROVIDER: Literal["copernicus_cems"] = "copernicus_cems"

    GENERAL_WEATHER_CACHE_NAMESPACE: str = "weather"
    FORECAST_CACHE_NAMESPACE: str = "forecast"
    AVIATION_METAR_CACHE_NAMESPACE: str = "aviation:metar"
    AVIATION_TAF_CACHE_NAMESPACE: str = "aviation:taf"
    AVIATION_SIGMET_CACHE_NAMESPACE: str = "aviation:sigmet"
    AIR_QUALITY_CACHE_NAMESPACE: str = "aqi:cams"
    DISASTER_CACHE_NAMESPACE: str = "disaster:cems"
    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_GEOCODING_URL: str = "https://geocoding-api.open-meteo.com/v1/search"
    OPEN_METEO_TIMEOUT: float = 20.0
    OPEN_METEO_POLL_INTERVAL: int = 300
    OPEN_METEO_MAX_RETRIES: int = 3
    OPEN_METEO_BACKOFF_FACTOR: float = 2.0
    OPEN_METEO_CB_FAILURE_THRESHOLD: int = 5
    OPEN_METEO_CB_RECOVERY_TIMEOUT: int = 120
    OPEN_METEO_CACHE_TTL: int = 600

    # AWC aviation weather provider
    AWC_BASE_URL: str = "https://aviationweather.gov/api/data"
    AWC_TIMEOUT: float = 20.0
    AWC_POLL_INTERVAL: int = 300
    AWC_MAX_RETRIES: int = 3
    AWC_BACKOFF_FACTOR: float = 2.0
    AWC_CB_FAILURE_THRESHOLD: int = 5
    AWC_CB_RECOVERY_TIMEOUT: int = 120
    AWC_CACHE_TTL: int = 600

    # Copernicus CAMS air-quality provider
    COPERNICUS_CAMS_ENABLED: bool = Field(
        default=False,
        validation_alias=AliasChoices("COPERNICUS_CAMS_ENABLED", "COPERNICUS_ENABLED"),
    )
    COPERNICUS_CAMS_ADS_URL: str = Field(
        default="https://ads.atmosphere.copernicus.eu/api",
        validation_alias=AliasChoices("COPERNICUS_CAMS_ADS_URL", "COPERNICUS_ADS_URL"),
    )
    COPERNICUS_CAMS_ADS_KEY: str | None = Field(
        default=None,
        validation_alias=AliasChoices("COPERNICUS_CAMS_ADS_KEY", "COPERNICUS_ADS_KEY"),
    )
    COPERNICUS_CAMS_DATASET: str = Field(
        default="cams-global-atmospheric-composition-forecasts",
        validation_alias=AliasChoices("COPERNICUS_CAMS_DATASET", "COPERNICUS_DATASET"),
    )
    COPERNICUS_CAMS_TIMEOUT: int = Field(
        default=300,
        validation_alias=AliasChoices("COPERNICUS_CAMS_TIMEOUT", "COPERNICUS_TIMEOUT"),
    )
    COPERNICUS_CAMS_MAX_RETRIES: int = Field(
        default=2,
        validation_alias=AliasChoices("COPERNICUS_CAMS_MAX_RETRIES", "COPERNICUS_MAX_RETRIES"),
    )
    COPERNICUS_CAMS_BACKOFF_FACTOR: float = Field(
        default=2.0,
        validation_alias=AliasChoices("COPERNICUS_CAMS_BACKOFF_FACTOR", "COPERNICUS_BACKOFF_FACTOR"),
    )
    COPERNICUS_CAMS_CB_FAILURE_THRESHOLD: int = Field(
        default=3,
        validation_alias=AliasChoices(
            "COPERNICUS_CAMS_CB_FAILURE_THRESHOLD",
            "COPERNICUS_CB_FAILURE_THRESHOLD",
        ),
    )
    COPERNICUS_CAMS_CB_RECOVERY_TIMEOUT: int = Field(
        default=300,
        validation_alias=AliasChoices(
            "COPERNICUS_CAMS_CB_RECOVERY_TIMEOUT",
            "COPERNICUS_CB_RECOVERY_TIMEOUT",
        ),
    )
    COPERNICUS_CAMS_CACHE_TTL: int = 1800

    # Copernicus CEMS disaster context provider
    COPERNICUS_CEMS_ENABLED: bool = False
    COPERNICUS_CEMS_RAPID_MAPPING_URL: str = (
        "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/"
    )
    COPERNICUS_CEMS_RISK_RECOVERY_URL: str = (
        "https://riskandrecovery.emergency.copernicus.eu/api/public-activations/"
    )
    COPERNICUS_CEMS_PAGE_LIMIT: int = 25
    COPERNICUS_CEMS_TIMEOUT: int = 300
    COPERNICUS_CEMS_MAX_RETRIES: int = 2
    COPERNICUS_CEMS_BACKOFF_FACTOR: float = 2.0
    COPERNICUS_CEMS_CB_FAILURE_THRESHOLD: int = 3
    COPERNICUS_CEMS_CB_RECOVERY_TIMEOUT: int = 300
    COPERNICUS_CEMS_CACHE_TTL: int = 1800


    # ── Aircraft Coverage Bounds (global by default) ──────────────
    AIRCRAFT_MIN_LAT: float = 5.0
    AIRCRAFT_MAX_LAT: float = 37.0
    AIRCRAFT_MIN_LON: float = 68.0
    AIRCRAFT_MAX_LON: float = 97.0

    # ── Weather Airspace Bounds (India) ────────────────────────────
    AIRSPACE_MIN_LAT: float = 6.0
    AIRSPACE_MAX_LAT: float = 38.0
    AIRSPACE_MIN_LON: float = 68.0
    AIRSPACE_MAX_LON: float = 98.0
    WEATHER_GRID_STEP: int = 1

    # ── Map Tile Configuration ──────────────────────────────────────
    DEFAULT_TILE_SERVER: str = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
    OSM_TILE_SERVER: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    PRECIPITATION_TILE_SERVER: str = "https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/2/1_1.png"

    # ── Default Map View ─────────────────────────────────────────────
    DEFAULT_MAP_CENTER_LAT: float = 18.0
    DEFAULT_MAP_CENTER_LON: float = 10.0
    DEFAULT_MAP_ZOOM: float = 2.4
    WEATHER_MAP_CENTER_LAT: float = 20.5937
    WEATHER_MAP_CENTER_LON: float = 78.9629
    WEATHER_MAP_ZOOM: float = 4.5

    # ── Weather Display Thresholds ──────────────────────────────────
    HUMIDITY_DETAIL_ZOOM_THRESHOLD: float = 7.1
    PRESSURE_STATE_ZOOM_THRESHOLD: float = 4.6
    PRESSURE_CAPITAL_ZOOM_THRESHOLD: float = 5.8
    PRESSURE_REGION_ZOOM_THRESHOLD: float = 7.1
    PRESSURE_DETAIL_ZOOM_THRESHOLD: float = 8.5

    # ── Animation Parameters ─────────────────────────────────────────
    WIND_PARTICLES_COUNT: int = 2000
    WIND_PARTICLE_SPEED: float = 0.8
    AIRCRAFT_ANIMATION_STEPS: int = 18
    AIRCRAFT_ANIMATION_DURATION: int = 14000

    # ── Color Theme Configuration ────────────────────────────────────
    TEMPERATURE_MIN: float = 5.0
    TEMPERATURE_MAX: float = 40.0
    HUMIDITY_BASE_HUE: int = 190
    PRESSURE_MIN: float = 980.0
    PRESSURE_MAX: float = 1030.0
    WIND_MAX_SPEED: float = 30.0

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
        allowed = {"spire", "opensky", "adsbexchange", "adsblol", "icao"}
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
            if not self.AUTH_PASSWORD_HASH and not self.AUTH_PASSWORD:
                raise ValueError(
                    "AUTH_PASSWORD_HASH or AUTH_PASSWORD is required when ENVIRONMENT=production"
                )
            if not self.cors_allowed_origins:
                raise ValueError(
                    "At least one frontend CORS origin is required via FRONTEND_APP_URL or CORS_ALLOWED_ORIGINS"
                )
            if self.ENABLE_LEGACY_UNPREFIXED_ROUTES:
                raise ValueError(
                    "ENABLE_LEGACY_UNPREFIXED_ROUTES must be false when ENVIRONMENT=production"
                )
        if self.REQUIRE_API_KEY and not self.API_KEYS:
            raise ValueError("API_KEYS must be configured when REQUIRE_API_KEY=true")
        if "spire" in self.aircraft_sources and not self.SPIRE_API_TOKEN:
            raise ValueError("SPIRE_API_TOKEN is required when AIRCRAFT_SOURCES includes spire")
        if "adsbexchange" in self.aircraft_sources and not self.ADSBEXCHANGE_API_KEY:
            raise ValueError(
                "ADSBEXCHANGE_API_KEY is required when AIRCRAFT_SOURCES includes adsbexchange"
            )
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

    @staticmethod
    def _normalise_origin(value: str) -> str | None:
        candidate = value.strip().rstrip("/")
        if not candidate:
            return None
        parsed = urlsplit(candidate)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
        return candidate if "://" in candidate else None

    @property
    def cors_allowed_origins(self) -> list[str]:
        origins: list[str] = []
        frontend_origin = self._normalise_origin(self.FRONTEND_APP_URL)
        if frontend_origin:
            origins.append(frontend_origin)

        for raw_origin in self.CORS_ALLOWED_ORIGINS.split(","):
            normalised = self._normalise_origin(raw_origin)
            if normalised:
                origins.append(normalised)

        deduped: list[str] = []
        for origin in origins:
            if origin not in deduped:
                deduped.append(origin)
        return deduped

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

    @property
    def map_config(self) -> dict[str, Any]:
        """Return map configuration for frontend."""
        return {
            "default_center": {
                "lat": self.DEFAULT_MAP_CENTER_LAT,
                "lon": self.DEFAULT_MAP_CENTER_LON,
            },
            "default_zoom": self.DEFAULT_MAP_ZOOM,
            "weather_center": {
                "lat": self.WEATHER_MAP_CENTER_LAT,
                "lon": self.WEATHER_MAP_CENTER_LON,
            },
            "weather_zoom": self.WEATHER_MAP_ZOOM,
            "tiles": {
                "basemap": self.DEFAULT_TILE_SERVER,
                "osm": self.OSM_TILE_SERVER,
                "precipitation": self.PRECIPITATION_TILE_SERVER,
            },
            "zoom_thresholds": {
                "humidity_detail": self.HUMIDITY_DETAIL_ZOOM_THRESHOLD,
                "pressure_state": self.PRESSURE_STATE_ZOOM_THRESHOLD,
                "pressure_capital": self.PRESSURE_CAPITAL_ZOOM_THRESHOLD,
                "pressure_region": self.PRESSURE_REGION_ZOOM_THRESHOLD,
                "pressure_detail": self.PRESSURE_DETAIL_ZOOM_THRESHOLD,
            },
            "animation": {
                "wind_particles_count": self.WIND_PARTICLES_COUNT,
                "wind_particle_speed": self.WIND_PARTICLE_SPEED,
                "aircraft_steps": self.AIRCRAFT_ANIMATION_STEPS,
                "aircraft_duration": self.AIRCRAFT_ANIMATION_DURATION,
            },
        }

    @property
    def provider_domains(self) -> dict[str, str]:
        return {
            "general_weather_provider": self.GENERAL_WEATHER_PROVIDER,
            "aviation_weather_provider": self.AVIATION_WEATHER_PROVIDER,
            "air_quality_provider": self.AIR_QUALITY_PROVIDER,
            "disaster_provider": self.DISASTER_PROVIDER,
        }

    @property
    def cache_namespaces(self) -> dict[str, str]:
        return {
            "weather": self.GENERAL_WEATHER_CACHE_NAMESPACE,
            "forecast": self.FORECAST_CACHE_NAMESPACE,
            "aviation_metar": self.AVIATION_METAR_CACHE_NAMESPACE,
            "aviation_taf": self.AVIATION_TAF_CACHE_NAMESPACE,
            "aviation_sigmet": self.AVIATION_SIGMET_CACHE_NAMESPACE,
            "air_quality": self.AIR_QUALITY_CACHE_NAMESPACE,
            "disaster": self.DISASTER_CACHE_NAMESPACE,
        }

    @property
    def weather_data_cache_key(self) -> str:
        return f"{self.GENERAL_WEATHER_CACHE_NAMESPACE}:data"

    @property
    def air_quality_data_cache_key(self) -> str:
        return f"{self.AIR_QUALITY_CACHE_NAMESPACE}:data"

    @property
    def disaster_data_cache_key(self) -> str:
        return f"{self.DISASTER_CACHE_NAMESPACE}:data"


@lru_cache
def get_settings() -> Settings:
    """Return cached singleton Settings instance."""
    return Settings()  # type: ignore[call-arg]
