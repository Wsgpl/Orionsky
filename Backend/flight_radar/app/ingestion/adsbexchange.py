"""
ADS-B Exchange ingestion client.
"""
from __future__ import annotations

import asyncio
import logging
import math
from typing import Any, TypedDict

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

Bounds = tuple[float, float, float, float]
DEFAULT_INDIA_ADSB_BOUNDS: Bounds = (5.0, 37.0, 68.0, 97.0)


class NormalizedAircraftRecord(TypedDict):
    id: str
    latitude: float
    longitude: float
    altitude: float
    speed: float
    heading: float
    callsign: str | None
    category: str | None


_circuit_breaker = CircuitBreaker(
    name="adsbexchange",
    failure_threshold=settings.ADSBEXCHANGE_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.ADSBEXCHANGE_CB_RECOVERY_TIMEOUT,
)


def get_adsbexchange_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "ground"}


def _normalise_heading(value: Any) -> float:
    return _safe_float(value, 0.0) % 360


def _configured_aircraft_bounds() -> Bounds:
    return (
        settings.AIRCRAFT_MIN_LAT,
        settings.AIRCRAFT_MAX_LAT,
        settings.AIRCRAFT_MIN_LON,
        settings.AIRCRAFT_MAX_LON,
    )


def _is_global_aircraft_scope() -> bool:
    min_lat, max_lat, min_lon, max_lon = _configured_aircraft_bounds()
    return (
        min_lat <= -90.0
        and max_lat >= 90.0
        and min_lon <= -180.0
        and max_lon >= 180.0
    )


def _active_bounds() -> Bounds:
    if _is_global_aircraft_scope():
        return DEFAULT_INDIA_ADSB_BOUNDS
    return _configured_aircraft_bounds()


def _within_active_bounds(lat: float, lon: float) -> bool:
    min_lat, max_lat, min_lon, max_lon = _active_bounds()
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def _radius_km() -> float:
    return max(50.0, settings.ADSBEXCHANGE_RADIUS_NM * 1.852)


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
    # overlap slightly and cover the full bounding box without gaps.
    step = (max_value - min_value) / count
    return [min_value + step * (index + 0.5) for index in range(count)]


def _build_zone_centers() -> list[tuple[float, float]]:
    min_lat, max_lat, min_lon, max_lon = _active_bounds()
    lat_span = max_lat - min_lat
    lon_span = max_lon - min_lon
    radius_km = _radius_km()
    lat_radius_deg = radius_km / 111.0
    mid_lat = (min_lat + max_lat) / 2
    lon_km_per_deg = max(10.0, 111.320 * math.cos(math.radians(mid_lat)))
    lon_radius_deg = radius_km / lon_km_per_deg

    rows = _zone_count_for_span(lat_span, lat_radius_deg)
    cols = _zone_count_for_span(lon_span, lon_radius_deg)
    zone_centers: list[tuple[float, float]] = []
    for lat in _axis_centers(min_lat, max_lat, rows):
        for lon in _axis_centers(min_lon, max_lon, cols):
            zone_centers.append((round(lat, 4), round(lon, 4)))

    return list(dict.fromkeys(zone_centers))


def _extract_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for candidate in (payload.get("aircraft"), payload.get("ac"), payload.get("data")):
        if isinstance(candidate, list):
            return [item for item in candidate if isinstance(item, dict)]
    return []


def _normalize_record(item: dict[str, Any]) -> tuple[NormalizedAircraftRecord, bool, str | None] | None:
    icao = str(item.get("hex") or item.get("icao24") or "").strip().lower()
    if not icao:
        return None

    lat = _safe_float(item.get("lat") or item.get("latitude"), default=999.0)
    lon = _safe_float(item.get("lon") or item.get("longitude"), default=999.0)
    if abs(lat) > 90 or abs(lon) > 180 or not _within_active_bounds(lat, lon):
        return None

    altitude_raw = item.get("alt_baro")
    if altitude_raw is None:
        altitude_raw = item.get("altitude")

    altitude_ft = 0.0 if str(altitude_raw).strip().lower() == "ground" else max(
        0.0, _safe_float(altitude_raw, 0.0)
    )
    speed_kt = _safe_float(item.get("gs") or item.get("ground_speed"), 0.0)
    speed_kmh = max(0.0, speed_kt * 1.852)
    heading = _normalise_heading(
        item.get("track") or item.get("true_heading") or item.get("heading")
    )

    callsign_raw = item.get("flight") or item.get("callsign")
    callsign = str(callsign_raw).strip() if callsign_raw else None
    category = first_present_label(item.get("category"), item.get("emitter_category"))
    aircraft_type = first_present_label(
        item.get("t"),
        item.get("aircraft_type"),
        item.get("desc"),
    )

    on_ground = (
        str(altitude_raw).strip().lower() == "ground"
        or _safe_bool(item.get("gnd"))
        or _safe_bool(item.get("on_ground"))
    )

    normalized: NormalizedAircraftRecord = {
        "id": icao,
        "latitude": lat,
        "longitude": lon,
        "altitude": altitude_ft,
        "speed": speed_kmh,
        "heading": heading,
        "callsign": callsign,
        "category": category,
    }
    return normalized, on_ground, aircraft_type


def _parse_aircraft(items: list[dict[str, Any]]) -> list[AircraftState]:
    parsed: list[AircraftState] = []
    for item in items:
        try:
            normalized_row = _normalize_record(item)
            if normalized_row is None:
                continue

            normalized, on_ground, aircraft_type = normalized_row
            parsed.append(
                AircraftState(
                    icao=normalized["id"],
                    callsign=normalized["callsign"],
                    latitude=normalized["latitude"],
                    longitude=normalized["longitude"],
                    altitude=normalized["altitude"],
                    velocity=normalized["speed"],
                    heading=normalized["heading"],
                    on_ground=on_ground,
                    source="adsbexchange",
                    aircraft_type=aircraft_type,
                    category=normalized["category"],
                )
            )
        except Exception as exc:
            logger.debug("Skipping malformed ADS-B Exchange aircraft row: %s", exc)

    return parsed


async def _fetch_zone(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    center_lat: float,
    center_lon: float,
) -> tuple[list[AircraftState], int]:
    url = (
        f"{settings.ADSBEXCHANGE_BASE_URL.rstrip('/')}/api/aircraft/v2/lat/{center_lat}"
        f"/lon/{center_lon}/dist/{settings.ADSBEXCHANGE_RADIUS_NM}"
    )
    resp = await client.get(url, headers=headers)

    if resp.status_code == 429:
        raise httpx.HTTPStatusError("Rate limited", request=resp.request, response=resp)

    resp.raise_for_status()
    payload: dict[str, Any] = resp.json()
    items = _extract_items(payload)
    return _parse_aircraft(items), len(items)


async def _fetch_raw() -> list[AircraftState]:
    if not settings.ADSBEXCHANGE_API_KEY:
        logger.warning("ADSBEXCHANGE_API_KEY is not set; skipping ADS-B Exchange ingestion")
        return []

    min_lat, max_lat, min_lon, max_lon = _active_bounds()
    zone_centers = _build_zone_centers()

    headers = {
        "Accept": "application/json",
        "api-auth": settings.ADSBEXCHANGE_API_KEY,
    }

    async with httpx.AsyncClient(timeout=settings.ADSBEXCHANGE_TIMEOUT) as client:
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
                "ADS-B Exchange zone fetch failed",
                extra={"center_lat": center_lat, "center_lon": center_lon, "error": str(result)},
            )
            continue

        zone_aircraft, zone_raw_items = result
        raw_items += zone_raw_items
        for aircraft in zone_aircraft:
            merged.setdefault(aircraft.icao, aircraft)

    if not merged and retryable_error is not None:
        raise retryable_error

    aircraft = list(merged.values())
    logger.info(
        "ADS-B Exchange sweep complete",
        extra={
            "aircraft_count": len(aircraft),
            "raw_items": raw_items,
            "zones": len(zone_centers),
            "zone_failures": zone_failures,
            "bounds": {
                "min_lat": min_lat,
                "max_lat": max_lat,
                "min_lon": min_lon,
                "max_lon": max_lon,
            },
        },
    )
    return aircraft


@retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    stop=stop_after_attempt(settings.ADSBEXCHANGE_MAX_RETRIES),
    wait=wait_exponential(multiplier=settings.ADSBEXCHANGE_BACKOFF_FACTOR, min=1, max=30),
    reraise=True,
)
async def _fetch_with_retry() -> list[AircraftState]:
    return await _fetch_raw()


async def fetch_aircraft() -> list[AircraftState]:
    try:
        return await _circuit_breaker.call(_fetch_with_retry)
    except CircuitBreakerError as exc:
        logger.warning("ADS-B Exchange circuit open: %s", exc)
        return []
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("ADS-B Exchange fetch failed after retries: %s", exc)
        return []
    except Exception as exc:
        logger.exception("Unexpected error fetching ADS-B Exchange data: %s", exc)
        return []
