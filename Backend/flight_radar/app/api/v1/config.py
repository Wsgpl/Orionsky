"""
Configuration API endpoint to serve frontend configuration.
"""
from fastapi import APIRouter, Depends
from app.core.config import Settings, get_settings

router = APIRouter()


@router.get("/config")
async def get_frontend_config(settings: Settings = Depends(get_settings)):
    """
    Get frontend configuration including map settings, thresholds, and animation parameters.
    """
    return {
        "providers": settings.provider_domains,
        "cache_namespaces": settings.cache_namespaces,
        "map": settings.map_config,
        "airspace": {
            "min_lat": settings.AIRSPACE_MIN_LAT,
            "max_lat": settings.AIRSPACE_MAX_LAT,
            "min_lon": settings.AIRSPACE_MIN_LON,
            "max_lon": settings.AIRSPACE_MAX_LON,
        },
        "weather": {
            "provider": settings.GENERAL_WEATHER_PROVIDER,
            "grid_step": settings.WEATHER_GRID_STEP,
            "poll_interval": settings.OPEN_METEO_POLL_INTERVAL,
            "cache_ttl": settings.OPEN_METEO_CACHE_TTL,
        },
        "aviation_weather": {
            "provider": settings.AVIATION_WEATHER_PROVIDER,
            "poll_interval": settings.AWC_POLL_INTERVAL,
            "cache_ttl": settings.AWC_CACHE_TTL,
        },
        "air_quality": {
            "provider": settings.AIR_QUALITY_PROVIDER,
            "enabled": settings.COPERNICUS_CAMS_ENABLED,
            "dataset": settings.COPERNICUS_CAMS_DATASET,
            "cache_ttl": settings.COPERNICUS_CAMS_CACHE_TTL,
        },
        "disaster_context": {
            "provider": settings.DISASTER_PROVIDER,
            "enabled": settings.COPERNICUS_CEMS_ENABLED,
            "feeds": ["rapid_mapping", "risk_recovery"],
            "page_limit": settings.COPERNICUS_CEMS_PAGE_LIMIT,
            "cache_ttl": settings.COPERNICUS_CEMS_CACHE_TTL,
        },
        "theme": {
            "temperature": {
                "min": settings.TEMPERATURE_MIN,
                "max": settings.TEMPERATURE_MAX,
            },
            "humidity": {
                "base_hue": settings.HUMIDITY_BASE_HUE,
            },
            "pressure": {
                "min": settings.PRESSURE_MIN,
                "max": settings.PRESSURE_MAX,
            },
            "wind": {
                "max_speed": settings.WIND_MAX_SPEED,
            },
        },
    }
