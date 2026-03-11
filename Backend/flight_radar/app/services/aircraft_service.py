"""
Aircraft service — orchestrates Redis reads and returns typed models.
"""
from __future__ import annotations

import asyncio
import logging
import time

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.schemas.aircraft import AircraftListResponse, AircraftState

logger = logging.getLogger(__name__)
settings = get_settings()

STALE_AIRCRAFT_WINDOW_SECONDS = max(90, settings.SPIRE_POLL_INTERVAL * 4)
RECENT_LANDING_WINDOW_SECONDS = 20 * 60
GROUND_MOVEMENT_SPEED_KMH = 20.0
LOW_ALTITUDE_FEET = 5000.0
ALTITUDE_DIRECTION_DELTA_FEET = 400.0
AIRCRAFT_DATA_CACHE_KEY = "aircraft:data"
AIRCRAFT_DATA_CACHE_TTL = 60
AIRCRAFT_ALL_KEY = "aircraft:all"
AIRCRAFT_ALL_NEXT_KEY = "aircraft:all:next"


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() == "true"


def _parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _derive_flight_status(raw: dict[str, str], previous: dict[str, str] | None, now: float) -> str:
    on_ground = _parse_bool(raw.get("on_ground"))
    altitude = _parse_float(raw.get("altitude"))
    velocity = _parse_float(raw.get("velocity"))

    prev_on_ground = _parse_bool(previous.get("on_ground")) if previous else False
    prev_altitude = _parse_float(previous.get("altitude")) if previous else None
    last_landed_at = _parse_float(raw.get("last_landed_at"))

    if not on_ground:
        if altitude is not None and altitude <= LOW_ALTITUDE_FEET:
            if previous and prev_on_ground:
                return "departing"
            if prev_altitude is not None:
                if altitude > prev_altitude + ALTITUDE_DIRECTION_DELTA_FEET:
                    return "departing"
                if altitude + ALTITUDE_DIRECTION_DELTA_FEET < prev_altitude:
                    return "arriving"
        return "airborne"

    if velocity is not None and velocity >= GROUND_MOVEMENT_SPEED_KMH:
        return "taxiing"

    if last_landed_at is not None and now - last_landed_at <= RECENT_LANDING_WINDOW_SECONDS:
        return "recently_landed"

    return "ground"

async def list_aircraft(redis: RedisClient) -> AircraftListResponse:
    icao_ids: set[str] = await redis.smembers(AIRCRAFT_ALL_KEY)
    aircraft: list[AircraftState] = []
    now = time.time()
    stale_skipped = 0
    malformed_skipped = 0
    status_counts: dict[str, int] = {}

    for icao in icao_ids:
        raw = await redis.hgetall(f"aircraft:{icao}")
        if not raw:
            continue

        observed_at = _parse_float(raw.get("observed_at"))
        if observed_at is not None and now - observed_at > STALE_AIRCRAFT_WINDOW_SECONDS:
            stale_skipped += 1
            continue

        previous = await redis.hgetall(f"aircraft:prev:{icao}")
        flight_status = _derive_flight_status(raw, previous or None, now)
        status_counts[flight_status] = status_counts.get(flight_status, 0) + 1

        try:
            aircraft.append(
                AircraftState(
                    icao=raw["icao"],
                    callsign=raw.get("callsign") or None,
                    latitude=float(raw["latitude"]),
                    longitude=float(raw["longitude"]),
                    altitude=_parse_float(raw.get("altitude")),
                    velocity=_parse_float(raw.get("velocity")),
                    heading=_parse_float(raw.get("heading")),
                    on_ground=_parse_bool(raw.get("on_ground")),
                    source=raw.get("source") or None,
                    aircraft_type=raw.get("aircraft_type") or None,
                    category=raw.get("category") or None,
                    flight_status=flight_status,
                )
            )
        except (KeyError, ValueError) as exc:
            malformed_skipped += 1
            logger.warning("Skipping malformed aircraft record %s: %s", icao, exc)

    logger.info(
        "Aircraft returned from Redis",
        extra={
            "redis_record_count": len(icao_ids),
            "returned_count": len(aircraft),
            "stale_skipped_count": stale_skipped,
            "malformed_skipped_count": malformed_skipped,
            "status_counts": status_counts,
        },
    )
    return AircraftListResponse(count=len(aircraft), aircraft=aircraft)


async def write_aircraft(redis: RedisClient, aircraft_list: list[AircraftState]) -> int:
    """Bulk-write aircraft states to Redis. Returns count written."""
    keys = [f"aircraft:{ac.icao}" for ac in aircraft_list]
    snapshots = await asyncio.gather(*[redis.hgetall(key) for key in keys])
    previous_map = dict(zip([ac.icao for ac in aircraft_list], snapshots))

    pipe = redis.pipeline(transaction=False)
    observed_at = time.time()

    # Build the next membership set separately, then atomically swap it into place.
    pipe.delete(AIRCRAFT_ALL_NEXT_KEY)

    for ac in aircraft_list:
        current_key = f"aircraft:{ac.icao}"
        previous_snapshot = previous_map[ac.icao]
        if previous_snapshot:
            pipe.hset(f"aircraft:prev:{ac.icao}", mapping=previous_snapshot)
            pipe.expire(f"aircraft:prev:{ac.icao}", 300)

        last_landed_at = previous_snapshot.get("last_landed_at", "") if previous_snapshot else ""
        previous_on_ground = _parse_bool(previous_snapshot.get("on_ground")) if previous_snapshot else False
        if ac.on_ground and previous_snapshot and not previous_on_ground:
            last_landed_at = str(observed_at)

        mapping = {
            "icao": ac.icao,
            "callsign": ac.callsign or "",
            "latitude": str(ac.latitude),
            "longitude": str(ac.longitude),
            "altitude": "" if ac.altitude is None else str(ac.altitude),
            "velocity": "" if ac.velocity is None else str(ac.velocity),
            "heading": "" if ac.heading is None else str(ac.heading),
            "on_ground": str(ac.on_ground).lower(),
            "source": ac.source or "",
            "aircraft_type": ac.aircraft_type or "",
            "category": ac.category or "",
            "observed_at": str(observed_at),
            "last_landed_at": last_landed_at,
        }
        pipe.hdel(current_key, "is_drone")
        pipe.hset(current_key, mapping=mapping)
        pipe.expire(current_key, 300)
        pipe.sadd(AIRCRAFT_ALL_NEXT_KEY, ac.icao)

    if aircraft_list:
        pipe.rename(AIRCRAFT_ALL_NEXT_KEY, AIRCRAFT_ALL_KEY)
    else:
        pipe.delete(AIRCRAFT_ALL_KEY)

    await pipe.execute()
    await redis.set_json(
        AIRCRAFT_DATA_CACHE_KEY,
        [aircraft.model_dump(mode="json") for aircraft in aircraft_list],
        ex=AIRCRAFT_DATA_CACHE_TTL,
    )
    logger.info("Aircraft written to Redis", extra={"count": len(aircraft_list)})
    return len(aircraft_list)
