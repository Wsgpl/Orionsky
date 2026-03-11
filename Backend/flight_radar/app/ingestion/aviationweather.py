"""
AviationWeather.gov METAR ingestion client.
"""
from __future__ import annotations

import logging
import math
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError
from app.schemas.weather import WeatherData

logger = logging.getLogger(__name__)
settings = get_settings()

_circuit_breaker = CircuitBreaker(
    name="aviationweather",
    failure_threshold=settings.AVIATIONWEATHER_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.AVIATIONWEATHER_CB_RECOVERY_TIMEOUT,
)


def get_aviationweather_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _relative_humidity_from_temp_dewpoint(temp_c: float, dewpoint_c: float) -> float:
    if temp_c <= -273.15 or dewpoint_c <= -273.15:
        return 0.0
    # Magnus approximation
    a = 17.625
    b = 243.04
    saturation = math.exp((a * temp_c) / (b + temp_c))
    actual = math.exp((a * dewpoint_c) / (b + dewpoint_c))
    if saturation <= 0:
        return 0.0
    return max(0.0, min(100.0, (actual / saturation) * 100.0))


def _cloud_cover_percent(record: dict[str, Any]) -> float:
    cover = str(record.get("cover") or "").upper()
    cover_map = {
        "CLR": 0.0,
        "SKC": 0.0,
        "FEW": 25.0,
        "SCT": 50.0,
        "BKN": 75.0,
        "OVC": 100.0,
    }
    if cover in cover_map:
        return cover_map[cover]
    return _safe_float(record.get("cloud_cover"), default=0.0)


def _normalise_record(record: dict[str, Any]) -> WeatherData | None:
    lat = _safe_float(record.get("lat") or record.get("latitude"), default=999.0)
    lon = _safe_float(record.get("lon") or record.get("longitude"), default=999.0)
    if abs(lat) > 90 or abs(lon) > 180:
        return None

    temp_c = _safe_float(record.get("temp") or record.get("temperature"), default=0.0)
    dewpoint_c = _safe_float(record.get("dewp") or record.get("dewpoint"), default=temp_c)
    humidity = _safe_float(record.get("rh"), default=-1.0)
    if humidity < 0:
        humidity = _relative_humidity_from_temp_dewpoint(temp_c, dewpoint_c)

    pressure_hpa = _safe_float(record.get("slp") or record.get("pressure"), default=1013.25)
    if pressure_hpa < 200:
        # altimeter often appears in inHg
        pressure_hpa = pressure_hpa * 33.8639

    wind_speed_ms = _safe_float(record.get("wspd") or record.get("wind_speed"), default=0.0) * 0.514444
    visibility_m = _safe_float(record.get("visib") or record.get("visibility"), default=10000.0)
    if visibility_m < 100:
        # visib field is frequently statute miles
        visibility_m = visibility_m * 1609.34

    condition = (
        str(record.get("wxString") or record.get("wx_string") or record.get("condition") or "METAR")
        .strip()
        or "METAR"
    )

    return WeatherData(
        latitude=lat,
        longitude=lon,
        temperature=temp_c,
        humidity=max(0.0, min(100.0, humidity)),
        pressure=max(800.0, pressure_hpa),
        wind_speed=max(0.0, wind_speed_ms),
        wind_direction=_safe_float(record.get("wdir") or record.get("wind_direction"), default=0.0) % 360,
        cloud_cover=max(0.0, min(100.0, _cloud_cover_percent(record))),
        visibility=max(0.0, visibility_m),
        condition=condition,
        source="aviationweather",
    )


def _nearest(lat: float, lon: float, stations: list[WeatherData]) -> WeatherData | None:
    if not stations:
        return None
    return min(
        stations,
        key=lambda s: (s.latitude - lat) ** 2 + (s.longitude - lon) ** 2,
    )


async def _fetch_raw() -> list[WeatherData]:
    bbox = (
        f"{settings.AIRSPACE_MIN_LAT},{settings.AIRSPACE_MIN_LON},"
        f"{settings.AIRSPACE_MAX_LAT},{settings.AIRSPACE_MAX_LON}"
    )
    params = {
        "format": "json",
        "bbox": bbox,
        "hours": settings.AVIATIONWEATHER_HOURS,
    }
    async with httpx.AsyncClient(timeout=settings.AVIATIONWEATHER_TIMEOUT) as client:
        resp = await client.get(settings.AVIATIONWEATHER_BASE_URL, params=params)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    payload = resp.json()
    records: list[dict[str, Any]]
    if isinstance(payload, list):
        records = [item for item in payload if isinstance(item, dict)]
    elif isinstance(payload, dict):
        data = payload.get("data")
        records = [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []
    else:
        records = []

    stations = [w for w in (_normalise_record(record) for record in records) if w is not None]
    logger.info(
        "AviationWeather fetch complete",
        extra={"station_count": len(stations), "raw_records": len(records)},
    )
    return stations


@retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    stop=stop_after_attempt(settings.AVIATIONWEATHER_MAX_RETRIES),
    wait=wait_exponential(multiplier=settings.AVIATIONWEATHER_BACKOFF_FACTOR, min=1, max=30),
    reraise=True,
)
async def _fetch_with_retry() -> list[WeatherData]:
    return await _fetch_raw()


async def fetch_weather_grid(
    grid: list[tuple[float, float]],
    redis: RedisClient,
) -> tuple[int, int]:
    try:
        stations = await _circuit_breaker.call(_fetch_with_retry)
    except CircuitBreakerError as exc:
        logger.warning("AviationWeather circuit open: %s", exc)
        return 0, len(grid)
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("AviationWeather fetch failed after retries: %s", exc)
        return 0, len(grid)
    except Exception as exc:
        logger.exception("Unexpected AviationWeather error: %s", exc)
        return 0, len(grid)

    updated = 0
    errors = 0
    for lat, lon in grid:
        station = _nearest(lat, lon, stations)
        if station is None:
            errors += 1
            continue

        hash_key = f"weather:{int(lat)}:{int(lon)}"
        await redis.hset(
            hash_key,
            mapping={
                "temperature": str(station.temperature),
                "humidity": str(station.humidity),
                "pressure": str(station.pressure),
                "wind_speed": str(station.wind_speed),
                "wind_direction": str(station.wind_direction),
                "cloud_cover": str(station.cloud_cover),
                "visibility": str(station.visibility),
                "condition": station.condition,
                "source": station.source,
            },
        )
        await redis.expire(hash_key, settings.OPENWEATHER_CACHE_TTL)
        updated += 1

    return updated, errors
