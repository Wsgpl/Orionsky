"""
OpenSky Network ingestion client.
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

from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError
from app.schemas.aircraft import AircraftState

logger = logging.getLogger(__name__)
settings = get_settings()

_circuit_breaker = CircuitBreaker(
    name="opensky",
    failure_threshold=settings.OPENSKY_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.OPENSKY_CB_RECOVERY_TIMEOUT,
)


def get_opensky_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _parse_states(raw_states: list) -> list[AircraftState]:
    aircraft: list[AircraftState] = []

    for state in raw_states:
        try:
            icao: str = state[0]
            callsign: str | None = state[1]
            lon: float | None = state[5]
            lat: float | None = state[6]
            baro_alt: float | None = state[7]
            velocity: float | None = state[9]
            heading: float | None = state[10]
            on_ground: bool = bool(state[8])

            if lat is None or lon is None:
                continue

            if not (
                settings.AIRSPACE_MIN_LAT <= lat <= settings.AIRSPACE_MAX_LAT
                and settings.AIRSPACE_MIN_LON <= lon <= settings.AIRSPACE_MAX_LON
            ):
                continue

            # Metres to feet
            altitude_ft = (baro_alt or 0) * 3.28084

            # m/s to km/h
            velocity_kmh = (velocity or 0) * 3.6

            aircraft.append(
                AircraftState(
                    icao=icao,
                    callsign=callsign.strip() if callsign else None,
                    latitude=lat,
                    longitude=lon,
                    altitude=max(0.0, altitude_ft),
                    velocity=velocity_kmh,
                    heading=heading or 0.0,
                    on_ground=on_ground,
                )
            )
        except (IndexError, TypeError, ValueError) as exc:
            logger.debug("Skipping malformed state vector: %s", exc)

    return aircraft


async def _fetch_raw() -> list[AircraftState]:
    params: dict = {
        "lamin": settings.AIRSPACE_MIN_LAT,
        "lamax": settings.AIRSPACE_MAX_LAT,
        "lomin": settings.AIRSPACE_MIN_LON,
        "lomax": settings.AIRSPACE_MAX_LON,
    }

    auth: tuple[str, str] | None = None
    if settings.OPENSKY_USERNAME and settings.OPENSKY_PASSWORD:
        auth = (settings.OPENSKY_USERNAME, settings.OPENSKY_PASSWORD)

    async with httpx.AsyncClient(timeout=settings.OPENSKY_TIMEOUT) as client:
        resp = await client.get(settings.OPENSKY_URL, params=params, auth=auth)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    data = resp.json()
    states = data.get("states") or []
    aircraft = _parse_states(states)

    logger.info(
        "OpenSky fetch complete",
        extra={"aircraft_count": len(aircraft), "raw_states": len(states)},
    )
    return aircraft


@retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    stop=stop_after_attempt(settings.OPENSKY_MAX_RETRIES),
    wait=wait_exponential(
        multiplier=settings.OPENSKY_BACKOFF_FACTOR, min=1, max=30
    ),
    reraise=True,
)
async def _fetch_with_retry() -> list[AircraftState]:
    return await _fetch_raw()


async def fetch_aircraft() -> list[AircraftState]:
    try:
        return await _circuit_breaker.call(_fetch_with_retry)
    except CircuitBreakerError as exc:
        logger.warning("OpenSky circuit open: %s", exc)
        return []
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("OpenSky fetch failed after retries: %s", exc)
        return []
    except Exception as exc:
        logger.exception("Unexpected error fetching OpenSky data: %s", exc)
        return []