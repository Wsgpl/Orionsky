"""
Spire Aviation aircraft ingestion client.
Connects to Spire AirSafe API for real-time aircraft tracking.
"""
from __future__ import annotations

import json
import logging
import re
import time

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
    name="spire",
    failure_threshold=settings.SPIRE_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.SPIRE_CB_RECOVERY_TIMEOUT,
)


def get_spire_circuit() -> CircuitBreaker:
    return _circuit_breaker


def _within_aircraft_scope(lat: float, lon: float) -> bool:
    return (
        settings.AIRCRAFT_MIN_LAT <= lat <= settings.AIRCRAFT_MAX_LAT
        and settings.AIRCRAFT_MIN_LON <= lon <= settings.AIRCRAFT_MAX_LON
    )


def _extract_spire_target(payload: dict) -> dict | None:
    if isinstance(payload.get("target"), dict):
        return payload["target"]
    if "icao_address" in payload:
        return payload
    return None


def _parse_spire_target(payload: dict) -> AircraftState | None:
    """
    Parse a single Spire target object into AircraftState.

    Spire's stream wraps the aircraft record inside ``{"target": {...}}``.
    The inner payload uses fields such as ``altitude_baro``, ``heading``,
    ``speed``, and ``aircraft_type_icao``.

    Example:
    {
        "target": {
            "icao_address": "49D13F",
            "latitude": 20.588472,
            "longitude": 86.816212,
            "altitude_baro": 30000,
            "heading": 70.52,
            "speed": 485.8,
            "on_ground": false,
            "callsign": "SEJ768",
            "aircraft_type_icao": "B738"
        }
    }
    """
    try:
        target = _extract_spire_target(payload)
        if not target:
            return None

        icao = target.get("icao_address", "").upper()
        if not icao or not re.fullmatch(r"[0-9A-F]{6}", icao):
            return None

        lat = target.get("latitude")
        lon = target.get("longitude")
        
        if lat is None or lon is None:
            return None

        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            return None

        if not _within_aircraft_scope(lat, lon):
            return None

        # Spire provides barometric altitude in feet.
        altitude_ft = target.get("altitude_ft")
        if altitude_ft is None:
            altitude_ft = target.get("altitude_baro", 0)
        if altitude_ft is None:
            altitude_ft = 0

        # Spire's stream reports speed in knots.
        speed_kts = target.get("ground_speed_kts")
        if speed_kts is None:
            speed_kts = target.get("speed", 0)
        if speed_kts is None:
            speed_kts = 0
        velocity_kmh = speed_kts * 1.852

        heading = target.get("track_degrees")
        if heading is None:
            heading = target.get("heading", 0)

        callsign = target.get("callsign")
        if callsign:
            callsign = callsign.strip() or None

        on_ground = target.get("on_ground", False)
        aircraft_type = target.get("aircraft_type") or target.get("aircraft_type_icao")
        category = target.get("category") or target.get("collection_type")

        return AircraftState(
            icao=icao,
            callsign=callsign,
            latitude=lat,
            longitude=lon,
            altitude=max(0.0, altitude_ft),
            velocity=max(0.0, velocity_kmh),
            heading=float(heading) % 360 if heading is not None else 0.0,
            on_ground=bool(on_ground),
            source="spire",
            aircraft_type=aircraft_type,
            category=category,
        )
    except (KeyError, TypeError, ValueError) as exc:
        logger.debug("Skipping malformed Spire target: %s", exc)
        return None


async def _fetch_raw() -> list[AircraftState]:
    """
    Fetch aircraft from Spire AirSafe API.
    The API returns streaming NDJSON (newline-delimited JSON).
    """
    if not settings.SPIRE_API_TOKEN:
        logger.error("SPIRE_API_TOKEN not configured")
        return []

    headers = {
        "Authorization": f"Bearer {settings.SPIRE_API_TOKEN}",
        "Accept": "application/json",
    }

    aircraft_by_icao: dict[str, AircraftState] = {}
    targets_received = 0
    started_at = time.monotonic()
    stop_reason = "stream_closed"

    try:
        async with httpx.AsyncClient(timeout=settings.SPIRE_TIMEOUT) as client:
            # Use streaming response for potentially large datasets
            async with client.stream(
                "GET",
                settings.SPIRE_API_URL,
                headers=headers,
            ) as response:
                if response.status_code == 401:
                    raise httpx.HTTPStatusError(
                        "Unauthorized - check SPIRE_API_TOKEN",
                        request=response.request,
                        response=response,
                    )

                if response.status_code == 429:
                    raise httpx.HTTPStatusError(
                        "Rate limited",
                        request=response.request,
                        response=response,
                    )

                response.raise_for_status()

                # Parse NDJSON stream
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue

                    try:
                        payload = json.loads(line)
                        if "target" not in payload and "icao_address" not in payload:
                            continue

                        targets_received += 1
                        parsed = _parse_spire_target(payload)
                        if parsed:
                            aircraft_by_icao[parsed.icao] = parsed

                        elapsed = time.monotonic() - started_at
                        if elapsed >= settings.SPIRE_COLLECTION_WINDOW_SECONDS:
                            stop_reason = "collection_window"
                            break
                        if len(aircraft_by_icao) >= settings.SPIRE_MAX_TARGETS_PER_POLL:
                            stop_reason = "max_targets"
                            break
                    except json.JSONDecodeError as exc:
                        logger.debug("Skipping malformed JSON line: %s", exc)

        logger.info(
            "Spire fetch complete",
            extra={
                "aircraft_count": len(aircraft_by_icao),
                "targets_received": targets_received,
                "collection_window_seconds": settings.SPIRE_COLLECTION_WINDOW_SECONDS,
                "stop_reason": stop_reason,
            },
        )
        return list(aircraft_by_icao.values())

    except httpx.HTTPStatusError as exc:
        logger.error(
            "Spire HTTP error",
            extra={"status_code": exc.response.status_code, "detail": str(exc)},
        )
        raise


@retry(
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
    stop=stop_after_attempt(settings.SPIRE_MAX_RETRIES),
    wait=wait_exponential(
        multiplier=settings.SPIRE_BACKOFF_FACTOR, min=1, max=30
    ),
    reraise=True,
)
async def _fetch_with_retry() -> list[AircraftState]:
    return await _fetch_raw()


async def fetch_aircraft() -> list[AircraftState]:
    """
    Main entry point for Spire aircraft fetching with circuit breaker.
    """
    try:
        return await _circuit_breaker.call(_fetch_with_retry)
    except CircuitBreakerError as exc:
        logger.warning("Spire circuit open: %s", exc)
        return []
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("Spire fetch failed after retries: %s", exc)
        return []
