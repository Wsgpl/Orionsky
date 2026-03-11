"""
Weather service — reads weather from Redis cache and builds advisories.
"""
from __future__ import annotations

import logging

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.engines.weather_advisory import build_advisory
from app.schemas.conflict import WeatherAdvisory, WeatherAdvisoryResponse
from app.schemas.weather import WeatherCellResponse, WeatherData, WeatherGridResponse
from app.services.aircraft_service import list_aircraft

logger = logging.getLogger(__name__)
settings = get_settings()


async def get_weather_grid(redis: RedisClient) -> WeatherGridResponse:
    """Return all cached weather cells from Redis."""
    keys: list[str] = await redis.keys("weather:*")
    cells: list[WeatherCellResponse] = []

    for key in keys:
        raw = await redis.hgetall(key)
        if not raw:
            continue
        # Parse lat/lon from key "weather:<lat>:<lon>"
        try:
            parts = key.split(":")
            lat, lon = float(parts[1]), float(parts[2])
        except (IndexError, ValueError):
            continue

        try:
            data = WeatherData(
                latitude=lat,
                longitude=lon,
                temperature=float(raw.get("temperature", 0)),
                humidity=float(raw.get("humidity", 0)),
                pressure=float(raw.get("pressure", 1013)),
                wind_speed=float(raw.get("wind_speed", 0)),
                wind_direction=float(raw.get("wind_direction", 0)),
                cloud_cover=float(raw.get("cloud_cover", 0)),
                visibility=float(raw.get("visibility", 10000)),
                condition=raw.get("condition", "unknown"),
                source=raw.get("source", "openweather"),
            )
            cells.append(WeatherCellResponse(cell_key=key, data=data))
        except (ValueError, TypeError) as exc:
            logger.warning("Skipping malformed weather cell %s: %s", key, exc)

    return WeatherGridResponse(count=len(cells), cells=cells)


async def get_weather_advisories(redis: RedisClient) -> WeatherAdvisoryResponse:
    """Match each aircraft to its nearest weather cell and generate advisories."""
    ac_response = await list_aircraft(redis)
    advisories: list[WeatherAdvisory] = []

    step = settings.WEATHER_GRID_STEP
    for ac in ac_response.aircraft:
        # Snap to grid
        grid_lat = int(ac.latitude // step) * step
        grid_lon = int(ac.longitude // step) * step
        cache_key = f"weather:{grid_lat}:{grid_lon}"

        raw = await redis.hgetall(cache_key)
        if not raw:
            continue

        try:
            weather = WeatherData(
                latitude=float(grid_lat),
                longitude=float(grid_lon),
                temperature=float(raw.get("temperature", 0)),
                humidity=float(raw.get("humidity", 0)),
                pressure=float(raw.get("pressure", 1013)),
                wind_speed=float(raw.get("wind_speed", 0)),
                wind_direction=float(raw.get("wind_direction", 0)),
                cloud_cover=float(raw.get("cloud_cover", 0)),
                visibility=float(raw.get("visibility", 10000)),
                condition=raw.get("condition", "unknown"),
                source=raw.get("source", "openweather"),
            )
        except (ValueError, TypeError) as exc:
            logger.warning("Bad weather data for %s: %s", cache_key, exc)
            continue

        advisory = build_advisory(ac, weather)
        if advisory:
            advisories.append(advisory)

    return WeatherAdvisoryResponse(count=len(advisories), advisories=advisories)
