"""Health-check endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Response

from app.cache.redis_client import RedisClient, get_pool
from app.core.config import get_settings
from app.ingestion.adsblol import get_adsblol_circuit
from app.ingestion.aviationweather import get_aviationweather_circuit
from app.ingestion.icao_aircraft import get_icao_aircraft_circuit
from app.ingestion.icao_weather import get_icao_weather_circuit
from app.ingestion.opensky import get_opensky_circuit
from app.ingestion.openweather import get_openweather_circuit
from app.schemas.auth import HealthLive, HealthReady

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


@router.get("/ready", response_model=HealthReady)
async def readiness(response: Response) -> HealthReady:
    """
    Kubernetes readiness probe.
    Returns 200 only when all critical dependencies are healthy.
    """
    # Check Redis
    try:
        client = aioredis.Redis(connection_pool=get_pool(), decode_responses=True)
        redis = RedisClient(client)
        redis_ok = await redis.ping()
        await client.aclose()
    except Exception:
        redis_ok = False

    opensky_state = get_opensky_circuit().state.value
    adsblol_state = get_adsblol_circuit().state.value
    icao_aircraft_state = get_icao_aircraft_circuit().state.value
    openweather_state = get_openweather_circuit().state.value
    aviationweather_state = get_aviationweather_circuit().state.value
    icao_weather_state = get_icao_weather_circuit().state.value

    enabled_aircraft_states: list[str] = []
    for source in settings.aircraft_sources:
        if source == "opensky":
            enabled_aircraft_states.append(opensky_state)
        elif source == "adsblol":
            enabled_aircraft_states.append(adsblol_state)
        elif source == "icao":
            enabled_aircraft_states.append(icao_aircraft_state)

    weather_state = {
        "openweather": openweather_state,
        "aviationweather": aviationweather_state,
        "icao": icao_weather_state,
    }[settings.WEATHER_SOURCE]

    aircraft_ok = all(state != "open" for state in enabled_aircraft_states)
    weather_ok = weather_state != "open"
    all_ok = redis_ok and aircraft_ok and weather_ok

    if not all_ok:
        response.status_code = 503

    return HealthReady(
        status="ok" if all_ok else "degraded",
        redis="ok" if redis_ok else "error",
        opensky_circuit=opensky_state,
        openweather_circuit=openweather_state,
        adsblol_circuit=adsblol_state,
        icao_aircraft_circuit=icao_aircraft_state,
        aviationweather_circuit=aviationweather_state,
        icao_weather_circuit=icao_weather_state,
    )
