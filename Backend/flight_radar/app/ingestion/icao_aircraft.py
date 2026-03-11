"""
ICAO aircraft ingestion client.

This adapter expects a JSON response where aircraft are either:
1) a top-level list, or
2) under one of: data, aircraft, items
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

from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError
from app.schemas.aircraft import AircraftState
from app.utils.aircraft_classification import first_present_label

logger = logging.getLogger(__name__)
settings = get_settings()

_circuit_breaker = CircuitBreaker(
    name="icao_aircraft",
    failure_threshold=settings.ICAO_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.ICAO_CB_RECOVERY_TIMEOUT,
)


def get_icao_aircraft_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalise_heading(value: Any) -> float:
    return _safe_float(value, 0.0) % 360


def _within_aircraft_scope(lat: float, lon: float) -> bool:
    return (
        settings.AIRCRAFT_MIN_LAT <= lat <= settings.AIRCRAFT_MAX_LAT
        and settings.AIRCRAFT_MIN_LON <= lon <= settings.AIRCRAFT_MAX_LON
    )


def _extract_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("data", "aircraft", "items"):
        candidate = payload.get(key)
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]

    return []


def _parse_aircraft(items: list[dict[str, Any]]) -> list[AircraftState]:
    parsed: list[AircraftState] = []
    for item in items:
        try:
            icao = str(
                item.get("icao")
                or item.get("icao24")
                or item.get("hex")
                or ""
            ).strip().lower()
            if not icao:
                continue

            lat = _safe_float(item.get("lat") or item.get("latitude"), default=999.0)
            lon = _safe_float(item.get("lon") or item.get("longitude"), default=999.0)
            if abs(lat) > 90 or abs(lon) > 180 or not _within_aircraft_scope(lat, lon):
                continue

            altitude_ft = _safe_float(
                item.get("altitude_ft")
                or item.get("altitude")
                or item.get("baro_altitude"),
                default=0.0,
            )
            speed_kmh = _safe_float(
                item.get("ground_speed_kmh")
                or item.get("velocity_kmh")
                or item.get("speed")
                or item.get("ground_speed"),
                default=0.0,
            )

            callsign_raw = item.get("callsign") or item.get("flight")
            callsign = str(callsign_raw).strip() if callsign_raw else None
            category = first_present_label(item.get("category"), item.get("emitter_category"))
            aircraft_type = first_present_label(
                item.get("aircraft_type"),
                item.get("type"),
                item.get("vehicle_type"),
                item.get("description"),
            )

            parsed.append(
                AircraftState(
                    icao=icao,
                    callsign=callsign,
                    latitude=lat,
                    longitude=lon,
                    altitude=max(0.0, altitude_ft),
                    velocity=max(0.0, speed_kmh),
                    heading=_normalise_heading(item.get("heading") or item.get("track")),
                    on_ground=bool(item.get("on_ground") or item.get("gnd")),
                    source="icao",
                    aircraft_type=aircraft_type,
                    category=category,
                )
            )
        except Exception as exc:
            logger.debug("Skipping malformed ICAO aircraft row: %s", exc)

    return parsed


async def _fetch_raw() -> list[AircraftState]:
    if not settings.ICAO_AIRCRAFT_URL:
        logger.warning("ICAO_AIRCRAFT_URL is empty; skipping ICAO aircraft ingestion")
        return []

    headers: dict[str, str] = {}
    if settings.ICAO_API_KEY:
        headers["Authorization"] = f"Bearer {settings.ICAO_API_KEY}"

    async with httpx.AsyncClient(timeout=settings.ICAO_TIMEOUT) as client:
        resp = await client.get(settings.ICAO_AIRCRAFT_URL, headers=headers)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    items = _extract_items(resp.json())
    aircraft = _parse_aircraft(items)
    logger.info(
        "ICAO aircraft fetch complete",
        extra={"aircraft_count": len(aircraft), "raw_items": len(items)},
    )
    return aircraft


@retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    stop=stop_after_attempt(settings.ICAO_MAX_RETRIES),
    wait=wait_exponential(multiplier=settings.ICAO_BACKOFF_FACTOR, min=1, max=30),
    reraise=True,
)
async def _fetch_with_retry() -> list[AircraftState]:
    return await _fetch_raw()


async def fetch_aircraft() -> list[AircraftState]:
    try:
        return await _circuit_breaker.call(_fetch_with_retry)
    except CircuitBreakerError as exc:
        logger.warning("ICAO aircraft circuit open: %s", exc)
        return []
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("ICAO aircraft fetch failed after retries: %s", exc)
        return []
    except Exception as exc:
        logger.exception("Unexpected error fetching ICAO aircraft data: %s", exc)
        return []
