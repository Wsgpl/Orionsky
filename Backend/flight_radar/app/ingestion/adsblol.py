"""
ADSB.lol ingestion client.
"""
from __future__ import annotations

import asyncio
import logging
import math
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
ZONE_COVERAGE_FACTOR = 0.78

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


def _within_aircraft_scope(lat: float, lon: float) -> bool:
    return (
        settings.AIRCRAFT_MIN_LAT <= lat <= settings.AIRCRAFT_MAX_LAT
        and settings.AIRCRAFT_MIN_LON <= lon <= settings.AIRCRAFT_MAX_LON
    )


def _is_global_aircraft_scope() -> bool:
    return (
        settings.AIRCRAFT_MIN_LAT <= -90.0
        and settings.AIRCRAFT_MAX_LAT >= 90.0
        and settings.AIRCRAFT_MIN_LON <= -180.0
        and settings.AIRCRAFT_MAX_LON >= 180.0
    )


def _radius_km() -> float:
    return max(50.0, settings.ADSBLOL_RADIUS_NM * 1.852)


def _zone_count_for_span(span_deg: float, radius_deg: float) -> int:
    if span_deg <= 0:
        return 1
    # Use an intentionally smaller effective diameter than the raw query radius so
    # adjacent zone requests overlap more and reduce blind spots across India.
    diameter_deg = max(radius_deg * 2 * ZONE_COVERAGE_FACTOR, 0.1)
    return max(1, math.ceil(span_deg / diameter_deg))


def _axis_centers(min_value: float, max_value: float, count: int) -> list[float]:
    if count <= 1:
        return [(min_value + max_value) / 2]

    # Place centers at the midpoint of each coverage slice so adjacent radius queries
    # cover the full bounding box without leaving edge-aligned gaps.
    step = (max_value - min_value) / count
    return [min_value + step * (index + 0.5) for index in range(count)]


def _build_zone_centers() -> list[tuple[float, float]]:
    lat_span = settings.AIRCRAFT_MAX_LAT - settings.AIRCRAFT_MIN_LAT
    lon_span = settings.AIRCRAFT_MAX_LON - settings.AIRCRAFT_MIN_LON
    radius_km = _radius_km()
    lat_radius_deg = radius_km / 111.0
    mid_lat = (settings.AIRCRAFT_MIN_LAT + settings.AIRCRAFT_MAX_LAT) / 2
    lon_km_per_deg = max(10.0, 111.320 * math.cos(math.radians(mid_lat)))
    lon_radius_deg = radius_km / lon_km_per_deg

    rows = _zone_count_for_span(lat_span, lat_radius_deg)
    cols = _zone_count_for_span(lon_span, lon_radius_deg)
    zone_centers: list[tuple[float, float]] = []
    for lat in _axis_centers(settings.AIRCRAFT_MIN_LAT, settings.AIRCRAFT_MAX_LAT, rows):
        for lon in _axis_centers(settings.AIRCRAFT_MIN_LON, settings.AIRCRAFT_MAX_LON, cols):
            zone_centers.append((round(lat, 4), round(lon, 4)))

    return list(dict.fromkeys(zone_centers))


def _parse_aircraft(items: list[dict[str, Any]]) -> list[AircraftState]:
    parsed: list[AircraftState] = []
    for item in items:
        try:
            icao = str(item.get("icao24") or item.get("hex") or "").strip().lower()
            if not icao:
                continue

            lat = _safe_float(item.get("lat") or item.get("latitude"), default=999.0)
            lon = _safe_float(item.get("lon") or item.get("longitude"), default=999.0)
            if abs(lat) > 90 or abs(lon) > 180 or not _within_aircraft_scope(lat, lon):
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
            category = first_present_label(item.get("category"), item.get("emitter_category"))
            aircraft_type = first_present_label(
                item.get("aircraft_type"),
                item.get("type"),
                item.get("desc"),
                item.get("t"),
                item.get("emitter_type"),
            )

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
                    source="adsblol",
                    aircraft_type=aircraft_type,
                    category=category,
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


async def _fetch_zone(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    center_lat: float,
    center_lon: float,
) -> tuple[list[AircraftState], int]:
    url = (
        f"{settings.ADSBLOL_BASE_URL.rstrip('/')}/v2/lat/{center_lat}"
        f"/lon/{center_lon}/dist/{settings.ADSBLOL_RADIUS_NM}"
    )
    resp = await client.get(url, headers=headers)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    payload: dict[str, Any] = resp.json()
    items = _extract_items(payload)
    return _parse_aircraft(items), len(items)


async def _fetch_raw() -> list[AircraftState]:
    if _is_global_aircraft_scope():
        logger.info(
            "Skipping ADSB.lol fetch for global aircraft scope; current adapter is radius-limited"
        )
        return []

    zone_centers = _build_zone_centers()

    headers: dict[str, str] = {}
    if settings.ADSBLOL_API_KEY:
        headers["Authorization"] = f"Bearer {settings.ADSBLOL_API_KEY}"

    async with httpx.AsyncClient(timeout=settings.ADSBLOL_TIMEOUT) as client:
        results = await asyncio.gather(
            *[_fetch_zone(client, headers, lat, lon) for lat, lon in zone_centers],
            return_exceptions=True,
        )

    merged: dict[str, AircraftState] = {}
    raw_items = 0
    zone_failures = 0
    retryable_error: httpx.RequestError | httpx.HTTPStatusError | None = None

    for index, result in enumerate(results):
        if isinstance(result, Exception):
            zone_failures += 1
            if isinstance(result, (httpx.RequestError, httpx.HTTPStatusError)) and retryable_error is None:
                retryable_error = result
            center_lat, center_lon = zone_centers[index]
            logger.warning(
                "ADSB.lol zone fetch failed",
                extra={"center_lat": center_lat, "center_lon": center_lon, "error": str(result)},
            )
            continue

        zone_aircraft, zone_raw_items = result
        raw_items += zone_raw_items
        for ac in zone_aircraft:
            merged.setdefault(ac.icao, ac)

    if not merged and retryable_error is not None:
        raise retryable_error

    aircraft = list(merged.values())
    logger.info(
        "ADSB.lol sweep complete",
        extra={
            "aircraft_count": len(aircraft),
            "raw_items": raw_items,
            "zones": len(zone_centers),
            "zone_failures": zone_failures,
        },
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
