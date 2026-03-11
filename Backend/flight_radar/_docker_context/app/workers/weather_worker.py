"""
Background weather ingestion worker.
Uses configured weather source to populate grid cells in Redis.
"""
from __future__ import annotations

import asyncio
import logging

import redis.asyncio as aioredis

from app.cache.redis_client import RedisClient, get_pool
from app.core.config import get_settings
from app.ingestion.aviationweather import fetch_weather_grid as fetch_aviationweather_grid
from app.ingestion.icao_weather import fetch_weather as fetch_icao_weather
from app.ingestion.openweather import fetch_weather

logger = logging.getLogger(__name__)
settings = get_settings()


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


async def weather_ingestion_loop() -> None:
    """Runs forever; designed to be launched as an asyncio task."""
    logger.info(
        "Weather ingestion worker started",
        extra={"interval": settings.OPENWEATHER_POLL_INTERVAL, "source": settings.WEATHER_SOURCE},
    )
    pool = get_pool()
    grid = _grid_points()
    logger.info("Weather grid size", extra={"cells": len(grid)})

    while True:
        updated = 0
        errors = 0

        client = aioredis.Redis(connection_pool=pool, decode_responses=True)
        redis = RedisClient(client)
        try:
            if settings.WEATHER_SOURCE == "aviationweather":
                updated, errors = await fetch_aviationweather_grid(grid, redis)
            else:
                for lat, lon in grid:
                    try:
                        if settings.WEATHER_SOURCE == "icao":
                            weather = await fetch_icao_weather(lat, lon, redis)
                        else:
                            weather = await fetch_weather(lat, lon, redis)
                        if weather:
                            updated += 1
                        else:
                            errors += 1
                        # Small sleep to avoid hammering external APIs
                        await asyncio.sleep(0.25)
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        logger.warning("Weather cell error (%s, %s): %s", lat, lon, exc)
                        errors += 1
        except asyncio.CancelledError:
            logger.info("Weather ingestion worker cancelled")
            raise
        finally:
            await client.aclose()

        logger.info(
            "Weather grid cycle complete",
            extra={"updated": updated, "errors": errors},
        )
        await asyncio.sleep(settings.OPENWEATHER_POLL_INTERVAL)
