"""Health-check endpoints."""
from __future__ import annotations

import time

from fastapi import APIRouter, Response

from app.cache.redis_client import RedisClient, get_pool
from app.core.config import get_settings
from app.ingestion.adsbexchange import get_adsbexchange_circuit
from app.ingestion.adsblol import get_adsblol_circuit
from app.ingestion.awc import (
    get_awc_metar_circuit,
    get_awc_sigmet_circuit,
    get_awc_taf_circuit,
)
from app.ingestion.copernicus_cams import get_copernicus_cams_circuit
from app.ingestion.copernicus_cems import get_copernicus_cems_circuit
from app.ingestion.icao_aircraft import get_icao_aircraft_circuit
from app.ingestion.openmeteo import get_openmeteo_circuit
from app.ingestion.opensky import get_opensky_circuit
from app.schemas.auth import AircraftWorkerHealth, HealthLive, HealthReady

import redis.asyncio as aioredis

router = APIRouter(prefix="/health", tags=["Health"])
settings = get_settings()


@router.get("/live", response_model=HealthLive)
async def liveness() -> HealthLive:
    """Kubernetes liveness probe — always returns 200 if the process is alive."""
    return HealthLive(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
    )


@router.get("/ready", response_model=HealthReady, response_model_exclude_none=True)
async def readiness(response: Response) -> HealthReady:
    """
    Kubernetes readiness probe.
    Returns 200 only when all critical dependencies are healthy.
    """
    # Check Redis
    aircraft_worker: AircraftWorkerHealth | None = None
    try:
        client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
        redis = RedisClient(client)
        redis_ok = await redis.ping()
        if redis_ok:
            sample_icao = await client.srandmember("aircraft:all")
            if sample_icao is None:
                aircraft_worker = AircraftWorkerHealth(status="no_data")
            else:
                raw = await redis.hgetall(f"aircraft:{sample_icao}")
                observed_at_raw = raw.get("observed_at")
                observed_at = _parse_observed_at(observed_at_raw)
                if observed_at is None:
                    aircraft_worker = AircraftWorkerHealth(status="degraded")
                else:
                    age_seconds = time.time() - observed_at
                    if age_seconds > settings.SPIRE_POLL_INTERVAL * 3:
                        aircraft_worker = AircraftWorkerHealth(
                            status="degraded",
                            age_seconds=age_seconds,
                        )
        await client.aclose()
    except Exception:
        redis_ok = False

    opensky_state = get_opensky_circuit().state.value
    adsbexchange_state = get_adsbexchange_circuit().state.value
    adsblol_state = get_adsblol_circuit().state.value
    icao_aircraft_state = get_icao_aircraft_circuit().state.value
    openmeteo_state = get_openmeteo_circuit().state.value
    awc_metar_state = get_awc_metar_circuit().state.value
    awc_taf_state = get_awc_taf_circuit().state.value
    awc_sigmet_state = get_awc_sigmet_circuit().state.value
    copernicus_cams_state = (
        get_copernicus_cams_circuit().state.value if settings.COPERNICUS_CAMS_ENABLED else None
    )
    copernicus_cems_state = (
        get_copernicus_cems_circuit().state.value if settings.COPERNICUS_CEMS_ENABLED else None
    )

    enabled_aircraft_states: list[str] = []
    for source in settings.aircraft_sources:
        if source == "opensky":
            enabled_aircraft_states.append(opensky_state)
        elif source == "adsbexchange":
            enabled_aircraft_states.append(adsbexchange_state)
        elif source == "adsblol":
            enabled_aircraft_states.append(adsblol_state)
        elif source == "icao":
            enabled_aircraft_states.append(icao_aircraft_state)

    aircraft_ok = all(state != "open" for state in enabled_aircraft_states)
    weather_ok = openmeteo_state != "open"
    air_quality_ok = not settings.COPERNICUS_CAMS_ENABLED or copernicus_cams_state != "open"
    disaster_ok = not settings.COPERNICUS_CEMS_ENABLED or copernicus_cems_state != "open"
    dependencies_ok = redis_ok and aircraft_ok and weather_ok and air_quality_ok and disaster_ok
    aircraft_worker_issue = aircraft_worker is not None and aircraft_worker.status != "ok"
    overall_ok = dependencies_ok and not aircraft_worker_issue

    if not dependencies_ok:
        response.status_code = 503

    return HealthReady(
        status="ok" if overall_ok else "degraded",
        redis="ok" if redis_ok else "error",
        opensky_circuit=opensky_state,
        adsbexchange_circuit=adsbexchange_state,
        openmeteo_circuit=openmeteo_state,
        awc_metar_circuit=awc_metar_state,
        awc_taf_circuit=awc_taf_state,
        awc_sigmet_circuit=awc_sigmet_state,
        copernicus_cams_circuit=copernicus_cams_state,
        copernicus_cems_circuit=copernicus_cems_state,
        adsblol_circuit=adsblol_state,
        icao_aircraft_circuit=icao_aircraft_state,
        aircraft_worker=aircraft_worker,
    )


def _parse_observed_at(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except ValueError:
        return None
