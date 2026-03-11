"""
Background aircraft ingestion worker.
Fetches from configured sources and writes to Redis.
"""
from __future__ import annotations

import asyncio
import logging
import time

import redis.asyncio as aioredis

from app.cache.redis_client import RedisClient, get_pool
from app.core.config import Settings, get_settings
from app.ingestion import adsbexchange, adsblol, icao_aircraft, opensky, spire
from app.ingestion.spire import get_spire_circuit
from app.schemas.aircraft import AircraftState
from app.services.aircraft_service import write_aircraft

logger = logging.getLogger(__name__)
settings = get_settings()
_rolling_aircraft: dict[str, tuple[AircraftState, float]] = {}


def _within_settings_bounds(ac: AircraftState, app_settings: Settings) -> bool:
    return (
        app_settings.AIRCRAFT_MIN_LAT <= ac.latitude <= app_settings.AIRCRAFT_MAX_LAT
        and app_settings.AIRCRAFT_MIN_LON <= ac.longitude <= app_settings.AIRCRAFT_MAX_LON
    )


async def _fetch_from_sources() -> tuple[list[AircraftState], dict[str, int]]:
    source_fetchers = {
        "spire": spire.fetch_aircraft,
        "opensky": opensky.fetch_aircraft,
        "adsbexchange": adsbexchange.fetch_aircraft,
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

        logger.info("Calling aircraft source", extra={"source": source})
        aircraft = await fetcher()
        counts[source] = len(aircraft)
        logger.info(
            "Aircraft source response received",
            extra={"source": source, "response_count": len(aircraft)},
        )

        # Earlier sources have priority when ICAO duplicates appear.
        for ac in aircraft:
            merged.setdefault(ac.icao, ac)

    logger.info(
        "Aircraft fetched from sources",
        extra={"source_counts": counts, "merged_count": len(merged)},
    )

    now = time.time()
    for ac in merged.values():
        _rolling_aircraft[ac.icao] = (ac, now)

    cutoff = now - 180
    stale = [icao for icao, (_, ts) in _rolling_aircraft.items() if ts < cutoff]
    for icao in stale:
        del _rolling_aircraft[icao]

    return [ac for ac, _ in _rolling_aircraft.values()], counts


async def aircraft_ingestion_loop() -> None:
    """Runs forever; designed to be launched as an asyncio task."""
    logger.info(
        "Aircraft ingestion worker started",
        extra={"interval": settings.SPIRE_POLL_INTERVAL, "sources": settings.aircraft_sources},
    )
    pool = get_pool()
    get_spire_circuit().reset()

    while True:
        try:
            client = aioredis.Redis(connection_pool=pool, decode_responses=True)
            redis = RedisClient(client)
            try:
                aircraft, source_counts = await _fetch_from_sources()

                if aircraft:
                    bounded_aircraft = [
                        ac for ac in aircraft if _within_settings_bounds(ac, settings)
                    ]
                    count = await write_aircraft(redis, bounded_aircraft)
                    logger.info(
                        "Aircraft ingestion cycle",
                        extra={
                            "count": count,
                            "sources": source_counts,
                            "fetched_count": len(aircraft),
                            "bounded_count": len(bounded_aircraft),
                        },
                    )
            finally:
                await client.aclose()
        except asyncio.CancelledError:
            logger.info("Aircraft ingestion worker cancelled")
            raise
        except Exception as exc:
            logger.exception("Aircraft ingestion cycle error: %s", exc)

        await asyncio.sleep(settings.SPIRE_POLL_INTERVAL)
