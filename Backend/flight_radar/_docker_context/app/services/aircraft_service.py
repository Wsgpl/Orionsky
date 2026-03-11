"""
Aircraft service — orchestrates Redis reads and returns typed models.
"""
from __future__ import annotations

import logging
import time

from app.cache.redis_client import RedisClient
from app.schemas.aircraft import AircraftListResponse, AircraftState

logger = logging.getLogger(__name__)


async def list_aircraft(redis: RedisClient) -> AircraftListResponse:
    icao_ids: set[str] = await redis.smembers("aircraft:all")
    aircraft: list[AircraftState] = []

    for icao in icao_ids:
        raw = await redis.hgetall(f"aircraft:{icao}")
        if not raw:
            continue
        try:
            aircraft.append(
                AircraftState(
                    icao=raw["icao"],
                    callsign=raw.get("callsign") or None,
                    latitude=float(raw["latitude"]),
                    longitude=float(raw["longitude"]),
                    altitude=float(raw.get("altitude", 0)),
                    velocity=float(raw.get("velocity", 0)),
                    heading=float(raw.get("heading", 0)),
                    on_ground=raw.get("on_ground", "false").lower() == "true",
                )
            )
        except (KeyError, ValueError) as exc:
            logger.warning("Skipping malformed aircraft record %s: %s", icao, exc)

    return AircraftListResponse(count=len(aircraft), aircraft=aircraft)


async def write_aircraft(redis: RedisClient, aircraft_list: list[AircraftState]) -> int:
    """Bulk-write aircraft states to Redis. Returns count written."""
    pipe = redis.pipeline(transaction=False)
    observed_at = time.time()

    # Atomically clear then re-populate the tracking set
    pipe.delete("aircraft:all")

    for ac in aircraft_list:
        current_key = f"aircraft:{ac.icao}"
        previous_snapshot = await redis.hgetall(current_key)
        if previous_snapshot:
            pipe.hset(f"aircraft:prev:{ac.icao}", mapping=previous_snapshot)

        mapping = {
            "icao": ac.icao,
            "callsign": ac.callsign or "",
            "latitude": str(ac.latitude),
            "longitude": str(ac.longitude),
            "altitude": str(ac.altitude),
            "velocity": str(ac.velocity),
            "heading": str(ac.heading),
            "on_ground": str(ac.on_ground).lower(),
            "observed_at": str(observed_at),
        }
        pipe.hset(current_key, mapping=mapping)
        pipe.sadd("aircraft:all", ac.icao)

    await pipe.execute()
    logger.info("Aircraft written to Redis", extra={"count": len(aircraft_list)})
    return len(aircraft_list)
