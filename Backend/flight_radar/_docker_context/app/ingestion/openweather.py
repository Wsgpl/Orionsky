"""
OpenWeatherMap ingestion client.
"""
from __future__ import annotations

import logging

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
    name="openweather",
    failure_threshold=settings.OPENWEATHER_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.OPENWEATHER_CB_RECOVERY_TIMEOUT,
)


def get_openweather_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _normalise_response(raw: dict, lat: float, lon: float) -> WeatherData:
    main = raw.get("main", {})
    wind = raw.get("wind", {})
    clouds = raw.get("clouds", {})
    weather_desc = raw.get("weather", [{}])[0]

    # Clamp wind direction to 0-360 safely
    wind_dir = float(wind.get("deg", 0)) % 360

    return WeatherData(
        latitude=lat,
        longitude=lon,
        temperature=main.get("temp", 273.15) - 273.15,  # Kelvin → Celsius
        humidity=float(main.get("humidity", 0)),
        pressure=float(main.get("pressure", 1013)),
        wind_speed=float(wind.get("speed", 0)),
        wind_direction=wind_dir,
        cloud_cover=float(clouds.get("all", 0)),
        visibility=float(raw.get("visibility", 10000)),
        condition=weather_desc.get("description", "unknown"),
        source="openweather",
    )


async def _fetch_raw(lat: float, lon: float) -> WeatherData:
    if not settings.OPENWEATHER_API_KEY:
        raise ValueError("OPENWEATHER_API_KEY is required for OpenWeather ingestion")

    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.OPENWEATHER_API_KEY,
    }
    async with httpx.AsyncClient(timeout=settings.OPENWEATHER_TIMEOUT) as client:
        resp = await client.get(settings.OPENWEATHER_BASE_URL, params=params)

    if resp.status_code == 401:
        raise ValueError("Invalid OpenWeather API key (HTTP 401)")

    resp.raise_for_status()
    return _normalise_response(resp.json(), lat, lon)


def _make_retry(lat: float, lon: float):
    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(settings.OPENWEATHER_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.OPENWEATHER_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> WeatherData:
        return await _fetch_raw(lat, lon)
    return _inner


async def fetch_weather(
    lat: float,
    lon: float,
    redis: RedisClient,
) -> WeatherData | None:
    hash_key = f"weather:{int(lat)}:{int(lon)}"

    # Check Redis cache first
    existing = await redis.hgetall(hash_key)
    if existing and existing.get("condition"):
        try:
            return WeatherData(
                latitude=lat,
                longitude=lon,
                temperature=float(existing.get("temperature", 0)),
                humidity=float(existing.get("humidity", 0)),
                pressure=float(existing.get("pressure", 1013)),
                wind_speed=float(existing.get("wind_speed", 0)),
                wind_direction=float(existing.get("wind_direction", 0)),
                cloud_cover=float(existing.get("cloud_cover", 0)),
                visibility=float(existing.get("visibility", 10000)),
                condition=existing.get("condition", "unknown"),
                source=existing.get("source", "openweather"),
            )
        except (ValueError, TypeError):
            pass

    try:
        weather = await _circuit_breaker.call(_make_retry(lat, lon))
    except CircuitBreakerError as exc:
        logger.warning("OpenWeather circuit open: %s", exc)
        return None
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
        logger.error("OpenWeather fetch failed for (%s, %s): %s", lat, lon, exc)
        return None
    except Exception as exc:
        logger.exception("Unexpected OpenWeather error: %s", exc)
        return None

    # Store as hash in Redis
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
