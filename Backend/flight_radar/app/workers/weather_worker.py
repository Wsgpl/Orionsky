"""
Background weather ingestion worker backed by Open-Meteo.
"""
from __future__ import annotations

import asyncio
import logging

import redis.asyncio as aioredis

from app.cache.redis_client import RedisClient, get_pool
from app.core.config import get_settings
from app.ingestion.openmeteo import fetch_weather
from app.schemas.weather import WeatherData

logger = logging.getLogger(__name__)
settings = get_settings()
GENERAL_WEATHER_SOURCE = settings.GENERAL_WEATHER_PROVIDER
WEATHER_DATA_CACHE_KEY = settings.weather_data_cache_key
WEATHER_DATA_CACHE_TTL = settings.OPEN_METEO_CACHE_TTL


def _normalise_weather_source(value: object | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().lower()
    return normalized or None


def _grid_points() -> list[tuple[float, float]]:
    step = settings.WEATHER_GRID_STEP
    points: list[tuple[float, float]] = []
    lat = settings.AIRSPACE_MIN_LAT
    while lat < settings.AIRSPACE_MAX_LAT:
        lon = settings.AIRSPACE_MIN_LON
        while lon < settings.AIRSPACE_MAX_LON:
            points.append((float(lat), float(lon)))
            lon += step
        lat += step
    return points


async def _purge_non_openmeteo_cells(redis: RedisClient) -> int:
    removed = 0
    keys = await redis.keys(f"{settings.GENERAL_WEATHER_CACHE_NAMESPACE}:*")
    for key in keys:
        raw = await redis.hgetall(key)
        source = _normalise_weather_source(raw.get("source")) if raw else None
        if not raw or source != GENERAL_WEATHER_SOURCE:
            await redis.delete(key)
            removed += 1
    return removed


def _weather_hash_key(lat: float, lon: float) -> str:
    return f"{settings.GENERAL_WEATHER_CACHE_NAMESPACE}:{int(lat)}:{int(lon)}"


def _serialise_weather_cells(cells: list[WeatherData]) -> list[dict[str, object]]:
    return [cell.model_dump(mode="json") for cell in cells]


async def _load_cached_weather(redis: RedisClient) -> list[WeatherData]:
    cached = await redis.get_json(WEATHER_DATA_CACHE_KEY)
    if not isinstance(cached, list):
        return []
    logger.debug(
        "Weather aggregate cache read payload",
        extra={
            "cache_key": WEATHER_DATA_CACHE_KEY,
            "count": len(cached),
            "sample": cached[0] if cached else None,
        },
    )

    cells: list[WeatherData] = []
    for item in cached:
        if not isinstance(item, dict):
            continue
        source = _normalise_weather_source(item.get("source"))
        if source != GENERAL_WEATHER_SOURCE:
            logger.warning("Skipping cached weather cell with invalid source: %r", item.get("source"))
            continue
        try:
            cells.append(WeatherData.model_validate(item))
        except Exception as exc:
            logger.warning("Skipping malformed cached weather cell: %s", exc)
    return cells


async def _write_weather_hashes(
    redis: RedisClient,
    weather_cells: list[WeatherData],
) -> None:
    for weather in weather_cells:
        source = _normalise_weather_source(weather.source)
        if source != GENERAL_WEATHER_SOURCE:
            logger.warning("Skipping weather hash write for invalid source: %r", weather.source)
            continue

        hash_key = _weather_hash_key(weather.latitude, weather.longitude)
        mapping = {
            "temperature": str(weather.temperature),
            "humidity": str(weather.humidity),
            "pressure": str(weather.pressure),
            "wind_speed": str(weather.wind_speed),
            "wind_direction": str(weather.wind_direction),
            "cloud_cover": str(weather.cloud_cover),
            "visibility": str(weather.visibility),
            "source": source,
        }
        if weather.condition is not None:
            mapping["condition"] = weather.condition
        if weather.precip_mm is not None:
            mapping["precip_mm"] = str(weather.precip_mm)
        logger.debug(
            "Weather Redis write payload",
            extra={"hash_key": hash_key, "payload": mapping},
        )
        await redis.hset(hash_key, mapping=mapping)
        if weather.condition is None:
            await redis.hdel(hash_key, "condition")
        if weather.precip_mm is None:
            await redis.hdel(hash_key, "precip_mm")
        await redis.hdel(
            hash_key,
            "pm25",
            "pm10",
            "o3",
            "ozone",
            "no2",
            "so2",
            "co",
            "aqi",
            "aqi_category",
            "air_quality_source",
        )

        await redis.expire(hash_key, WEATHER_DATA_CACHE_TTL)


async def weather_ingestion_loop() -> None:
    """Runs forever; designed to be launched as an asyncio task."""
    logger.info(
        "Weather ingestion worker started",
        extra={"interval": settings.OPEN_METEO_POLL_INTERVAL, "source": settings.GENERAL_WEATHER_PROVIDER},
    )
    pool = get_pool()
    grid = _grid_points()
    logger.info("Weather grid size", extra={"cells": len(grid)})

    bootstrap_client = aioredis.Redis(connection_pool=pool, decode_responses=True)
    bootstrap_redis = RedisClient(bootstrap_client)
    try:
        removed = await _purge_non_openmeteo_cells(bootstrap_redis)
        if removed:
            logger.info(
                "Removed legacy weather cache entries",
                extra={"removed": removed, "source": GENERAL_WEATHER_SOURCE},
            )
    finally:
        await bootstrap_client.aclose()

    while True:
        updated = 0
        errors = 0
        cached_weather: list[WeatherData] = []
        weather_cells: list[WeatherData] = []

        client = aioredis.Redis(connection_pool=pool, decode_responses=True)
        redis = RedisClient(client)
        try:
            cached_weather = await _load_cached_weather(redis)
            cache_hit = bool(cached_weather)

            if cache_hit:
                logger.info(
                    "Weather cache hit",
                    extra={"cache_key": WEATHER_DATA_CACHE_KEY, "cached_count": len(cached_weather)},
                )
                weather_cells = cached_weather
            else:
                logger.info(
                    "Weather cache miss",
                    extra={"cache_key": WEATHER_DATA_CACHE_KEY, "grid_cell_count": len(grid)},
                )
                weather_cells: list[WeatherData] = []
                for lat, lon in grid:
                    try:
                        weather = await fetch_weather(lat, lon, redis)
                        if weather:
                            updated += 1
                            weather_cells.append(weather)
                        else:
                            errors += 1
                        await asyncio.sleep(0.25)
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        logger.warning("Weather cell error (%s, %s): %s", lat, lon, exc)
                        errors += 1

                if weather_cells:
                    logger.debug(
                        "Weather aggregate cache write payload",
                        extra={
                            "cache_key": WEATHER_DATA_CACHE_KEY,
                            "count": len(weather_cells),
                            "sample": weather_cells[0].model_dump(mode="json"),
                        },
                    )
                    await redis.set_json(
                        WEATHER_DATA_CACHE_KEY,
                        _serialise_weather_cells(weather_cells),
                        ex=WEATHER_DATA_CACHE_TTL,
                    )

            if weather_cells:
                await _write_weather_hashes(redis, weather_cells)
        except asyncio.CancelledError:
            logger.info("Weather ingestion worker cancelled")
            raise
        finally:
            await client.aclose()

        logger.info(
            "Weather grid cycle complete",
            extra={
                "updated": updated if updated else len(weather_cells),
                "errors": errors,
                "weather_cache_hit": bool(cached_weather),
            },
        )
        await asyncio.sleep(settings.OPEN_METEO_POLL_INTERVAL)
