"""
ADSB.lol ingestion client.
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

logger = logging.getLogger(__name__)
settings = get_settings()

_circuit_breaker = CircuitBreaker(
    name="adsblol",
    failure_threshold=settings.ADSBLOL_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.ADSBLOL_CB_RECOVERY_TIMEOUT,
)


def get_adsblol_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalise_heading(value: Any) -> float:
    return _safe_float(value, 0.0) % 360


def _within_airspace(lat: float, lon: float) -> bool:
    return (
        settings.AIRSPACE_MIN_LAT <= lat <= settings.AIRSPACE_MAX_LAT
        and settings.AIRSPACE_MIN_LON <= lon <= settings.AIRSPACE_MAX_LON
    )


def _parse_aircraft(items: list[dict[str, Any]]) -> list[AircraftState]:
    parsed: list[AircraftState] = []
    for item in items:
        try:
            icao = str(item.get("icao24") or item.get("hex") or "").strip().lower()
            if not icao:
                continue

            lat = _safe_float(item.get("lat") or item.get("latitude"), default=999.0)
            lon = _safe_float(item.get("lon") or item.get("longitude"), default=999.0)
            if abs(lat) > 90 or abs(lon) > 180 or not _within_airspace(lat, lon):
                continue

            # Common ADS-B fields: alt_baro (ft), gs (kt), track (deg), gnd (bool)
            altitude_ft = max(0.0, _safe_float(item.get("alt_baro") or item.get("altitude"), 0.0))
            speed_kt = _safe_float(item.get("gs") or item.get("ground_speed"), 0.0)
            speed_kmh = max(0.0, speed_kt * 1.852)
            heading = _normalise_heading(item.get("track") or item.get("heading"))

            on_ground_raw = item.get("gnd")
            if on_ground_raw is None:
                on_ground_raw = item.get("on_ground")
            on_ground = bool(on_ground_raw)

            callsign_raw = item.get("flight") or item.get("callsign")
            callsign = str(callsign_raw).strip() if callsign_raw else None

            parsed.append(
                AircraftState(
                    icao=icao,
                    callsign=callsign,
                    latitude=lat,
                    longitude=lon,
                    altitude=altitude_ft,
                    velocity=speed_kmh,
                    heading=heading,
                    on_ground=on_ground,
                )
            )
        except Exception as exc:
            logger.debug("Skipping malformed ADSB.lol aircraft row: %s", exc)

    return parsed


def _extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = (
        payload.get("ac"),
        payload.get("aircraft"),
        payload.get("data"),
    )
    for candidate in candidates:
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]
    return []


async def _fetch_raw() -> list[AircraftState]:
    center_lat = (settings.AIRSPACE_MIN_LAT + settings.AIRSPACE_MAX_LAT) / 2
    center_lon = (settings.AIRSPACE_MIN_LON + settings.AIRSPACE_MAX_LON) / 2
    url = (
        f"{settings.ADSBLOL_BASE_URL.rstrip('/')}/v2/lat/{center_lat}"
        f"/lon/{center_lon}/dist/{settings.ADSBLOL_RADIUS_NM}"
    )

    headers: dict[str, str] = {}
    if settings.ADSBLOL_API_KEY:
        headers["Authorization"] = f"Bearer {settings.ADSBLOL_API_KEY}"

    async with httpx.AsyncClient(timeout=settings.ADSBLOL_TIMEOUT) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    payload: dict[str, Any] = resp.json()
    items = _extract_items(payload)
    aircraft = _parse_aircraft(items)
    logger.info(
        "ADSB.lol fetch complete",
        extra={"aircraft_count": len(aircraft), "raw_items": len(items)},
    )
    return aircraft


@retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    stop=stop_after_attempt(settings.ADSBLOL_MAX_RETRIES),
    wait=wait_exponential(multiplier=settings.ADSBLOL_BACKOFF_FACTOR, min=1, max=30),
    reraise=True,
)
async def _fetch_with_retry() -> list[AircraftState]:
    return await _fetch_raw()


async def fetch_aircraft() -> list[AircraftState]:
    try:
        return await _circuit_breaker.call(_fetch_with_retry)
    except CircuitBreakerError as exc:
        logger.warning("ADSB.lol circuit open: %s", exc)
        return []
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("ADSB.lol fetch failed after retries: %s", exc)
        return []
    except Exception as exc:
        logger.exception("Unexpected error fetching ADSB.lol data: %s", exc)
        return []
