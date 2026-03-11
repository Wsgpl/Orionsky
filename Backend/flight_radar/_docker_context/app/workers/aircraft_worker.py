"""
Background aircraft ingestion worker.
Fetches from configured sources and writes to Redis.
"""
from __future__ import annotations

import asyncio
import logging

import redis.asyncio as aioredis

from app.cache.redis_client import RedisClient, get_pool
from app.core.config import get_settings
from app.ingestion import adsblol, icao_aircraft, opensky
from app.schemas.aircraft import AircraftState
from app.services.aircraft_service import write_aircraft

logger = logging.getLogger(__name__)
settings = get_settings()


async def _fetch_from_sources() -> tuple[list[AircraftState], dict[str, int]]:
    source_fetchers = {
        "opensky": opensky.fetch_aircraft,
        "adsblol": adsblol.fetch_aircraft,
        "icao": icao_aircraft.fetch_aircraft,
    }

    counts: dict[str, int] = {}
    merged: dict[str, AircraftState] = {}

    for source in settings.aircraft_sources:
        fetcher = source_fetchers.get(source)
        if fetcher is None:
            logger.warning("Unknown aircraft source %s; skipping", source)
            continue

        aircraft = await fetcher()
        counts[source] = len(aircraft)

        # Earlier sources have priority when ICAO duplicates appear.
        for ac in aircraft:
            merged.setdefault(ac.icao, ac)

    return list(merged.values()), counts


async def aircraft_ingestion_loop() -> None:
    """Runs forever; designed to be launched as an asyncio task."""
    logger.info(
        "Aircraft ingestion worker started",
        extra={"interval": settings.OPENSKY_POLL_INTERVAL, "sources": settings.aircraft_sources},
    )
    pool = get_pool()

    while True:
        try:
            aircraft, source_counts = await _fetch_from_sources()
            if aircraft:
                client = aioredis.Redis(connection_pool=pool, decode_responses=True)
                redis = RedisClient(client)
                try:
                    count = await write_aircraft(redis, aircraft)
                    logger.info(
                        "Aircraft ingestion cycle",
                        extra={"count": count, "sources": source_counts},
                    )
                finally:
                    await client.aclose()
        except asyncio.CancelledError:
            logger.info("Aircraft ingestion worker cancelled")
            raise
        except Exception as exc:
            logger.exception("Aircraft ingestion cycle error: %s", exc)

        await asyncio.sleep(settings.OPENSKY_POLL_INTERVAL)
