"""
ICAO weather ingestion client.

This adapter expects a JSON response where weather rows are either:
1) a top-level list, or
2) under one of: data, weather, items
"""
from __future__ import annotations

import logging
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
    name="icao_weather",
    failure_threshold=settings.ICAO_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.ICAO_CB_RECOVERY_TIMEOUT,
)


def get_icao_weather_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _extract_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("data", "weather", "items"):
        candidate = payload.get(key)
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]
    return []


def _normalise_row(row: dict[str, Any], fallback_lat: float, fallback_lon: float) -> WeatherData:
    return WeatherData(
        latitude=_safe_float(row.get("lat") or row.get("latitude"), fallback_lat),
        longitude=_safe_float(row.get("lon") or row.get("longitude"), fallback_lon),
        temperature=_safe_float(row.get("temperature") or row.get("temp"), 0.0),
        humidity=max(0.0, min(100.0, _safe_float(row.get("humidity"), 0.0))),
        pressure=_safe_float(row.get("pressure"), 1013.25),
        wind_speed=max(0.0, _safe_float(row.get("wind_speed") or row.get("wspd"), 0.0)),
        wind_direction=_safe_float(row.get("wind_direction") or row.get("wdir"), 0.0) % 360,
        cloud_cover=max(0.0, min(100.0, _safe_float(row.get("cloud_cover"), 0.0))),
        visibility=max(0.0, _safe_float(row.get("visibility"), 10000.0)),
        condition=str(row.get("condition") or row.get("wxString") or "unknown"),
        source="icao",
    )


async def _fetch_raw(lat: float, lon: float) -> WeatherData | None:
    if not settings.ICAO_WEATHER_URL:
        logger.warning("ICAO_WEATHER_URL is empty; skipping ICAO weather ingestion")
        return None

    headers: dict[str, str] = {}
    if settings.ICAO_API_KEY:
        headers["Authorization"] = f"Bearer {settings.ICAO_API_KEY}"

    params = {"lat": lat, "lon": lon}
    async with httpx.AsyncClient(timeout=settings.ICAO_TIMEOUT) as client:
        resp = await client.get(settings.ICAO_WEATHER_URL, params=params, headers=headers)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    rows = _extract_rows(resp.json())
    if not rows:
        return None
    return _normalise_row(rows[0], fallback_lat=lat, fallback_lon=lon)


def _make_retry(lat: float, lon: float):
    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(settings.ICAO_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.ICAO_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> WeatherData | None:
        return await _fetch_raw(lat, lon)

    return _inner


async def fetch_weather(lat: float, lon: float, redis: RedisClient) -> WeatherData | None:
    hash_key = f"weather:{int(lat)}:{int(lon)}"
    try:
        weather = await _circuit_breaker.call(_make_retry(lat, lon))
    except CircuitBreakerError as exc:
        logger.warning("ICAO weather circuit open: %s", exc)
        return None
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("ICAO weather fetch failed for (%s, %s): %s", lat, lon, exc)
        return None
    except Exception as exc:
        logger.exception("Unexpected ICAO weather error: %s", exc)
        return None

    if weather is None:
        return None

    await redis.hset(
        hash_key,
        mapping={
            "temperature": str(weather.temperature),
            "humidity": str(weather.humidity),
            "pressure": str(weather.pressure),
            "wind_speed": str(weather.wind_speed),
            "wind_direction": str(weather.wind_direction),
            "cloud_cover": str(weather.cloud_cover),
            "visibility": str(weather.visibility),
            "condition": weather.condition,
            "source": weather.source,
        },
    )
    await redis.expire(hash_key, settings.OPENWEATHER_CACHE_TTL)
    return weather
