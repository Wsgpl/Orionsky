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
GENERAL_WEATHER_SOURCE = settings.GENERAL_WEATHER_PROVIDER


def _required_float(raw: dict[str, str], key: str) -> float:
    value = raw.get(key)
    if value in (None, ""):
        raise ValueError(f"Missing required weather field: {key}")
    return float(value)


def _required_str(raw: dict[str, str], key: str) -> str:
    value = raw.get(key)
    if value is None:
        raise ValueError(f"Missing required weather field: {key}")
    value = str(value).strip()
    if not value:
        raise ValueError(f"Empty required weather field: {key}")
    return value


def _optional_str(raw: dict[str, str], key: str) -> str | None:
    value = raw.get(key)
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _weather_data_from_cache(raw: dict[str, str], lat: float, lon: float) -> WeatherData | None:
    logger.debug(
        "Weather Redis read payload",
        extra={"latitude": lat, "longitude": lon, "payload": raw},
    )
    source = _required_str(raw, "source").lower()
    if source != GENERAL_WEATHER_SOURCE:
        logger.warning(
            "Skipping weather cell from disabled provider",
            extra={"latitude": lat, "longitude": lon, "source": source},
        )
        return None

    data = WeatherData(
        latitude=lat,
        longitude=lon,
        temperature=_required_float(raw, "temperature"),
        precip_mm=float(raw["precip_mm"]) if raw.get("precip_mm") not in (None, "") else None,
        humidity=_required_float(raw, "humidity"),
        pressure=_required_float(raw, "pressure"),
        wind_speed=_required_float(raw, "wind_speed"),
        wind_direction=_required_float(raw, "wind_direction"),
        cloud_cover=_required_float(raw, "cloud_cover"),
        visibility=_required_float(raw, "visibility"),
        condition=_optional_str(raw, "condition"),
        source=source,
    )
    logger.debug(
        "Weather Redis parsed payload",
        extra={"latitude": lat, "longitude": lon, "weather": data.model_dump(mode="json")},
    )
    return data

async def get_weather_grid(redis: RedisClient) -> WeatherGridResponse:
    """Return all cached weather cells from Redis."""
    keys: list[str] = await redis.keys(f"{settings.GENERAL_WEATHER_CACHE_NAMESPACE}:*")
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
            data = _weather_data_from_cache(raw, lat, lon)
            if data is not None:
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
        cache_key = f"{settings.GENERAL_WEATHER_CACHE_NAMESPACE}:{grid_lat}:{grid_lon}"

        raw = await redis.hgetall(cache_key)
        if not raw:
            continue

        try:
            weather = _weather_data_from_cache(raw, float(grid_lat), float(grid_lon))
            if weather is None:
                continue
        except (ValueError, TypeError) as exc:
            logger.warning("Bad weather data for %s: %s", cache_key, exc)
            continue

        advisory = build_advisory(ac, weather)
        if advisory:
            advisories.append(advisory)

    return WeatherAdvisoryResponse(count=len(advisories), advisories=advisories)
