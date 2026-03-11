"""
FlightRadar Intelligence Backend — application entry point.

Startup sequence:
  1. Configure structured logging
  2. Build Redis connection pool
  3. Register middleware (exception handler, rate limiting, request tracking)
  4. Mount API routers
  5. Launch background ingestion workers as asyncio Tasks
  6. Expose /health and /metrics without auth

Shutdown:
  - asyncio tasks are cancelled and awaited cleanly
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

from app.api.v1 import (
    aircraft,
    air_quality,
    api_keys,
    auth,
    aviation,
    config,
    disaster,
    forecast,
    health,
    metrics,
    missions,
    mission_export,
    route_risk,
    snapshot,
    weather,
)
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.middleware.exception_handler import ExceptionHandlerMiddleware
from app.middleware.rate_limiting import RateLimitMiddleware
from app.middleware.request_tracking import RequestTrackingMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.workers.aircraft_worker import aircraft_ingestion_loop
from app.workers.weather_worker import weather_ingestion_loop

settings = get_settings()
configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
logger = logging.getLogger(__name__)

_background_tasks: list[asyncio.Task] = []


class LegacyRoutePrefixMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        legacy_prefixes = (
            "/auth/",
            "/aircraft",
            "/weather",
            "/forecast",
            "/aviation",
            "/air-quality",
            "/air_quality",
            "/disasters",
            "/disaster",
            "/config",
            "/snapshot",
            "/missions",
            "/route-risk",
            "/route_risk",
            "/api-keys",
            "/mission-export",
        )
        if any(path.startswith(prefix) for prefix in legacy_prefixes):
            new_url = request.url.replace(path=f"{settings.API_PREFIX}{path}")
            return RedirectResponse(url=str(new_url), status_code=307)
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info(
        "Starting FlightRadar backend",
        extra={"version": settings.APP_VERSION, "environment": settings.ENVIRONMENT},
    )
    if settings.WORKERS > 1:
        # Aircraft and weather ingestion loops are launched as asyncio Tasks inside
        # this lifespan context. When Gunicorn/Uvicorn spawns N worker processes each
        # process independently runs its own copy of these tasks, which means:
        #   - N concurrent writers to the same Redis keys (last-write-wins, data loss)
        #   - N x rate-limit hits on OpenSky / Open-Meteo
        #   - N x Copernicus CDS download requests
        # Always keep WORKERS=1 and scale horizontally via separate processes with
        # dedicated ingestion workers, or extract the workers into a standalone service.
        raise RuntimeError(
            f"WORKERS={settings.WORKERS} is not supported. "
            "Background ingestion workers run inside the app process — multiple "
            "Gunicorn/Uvicorn workers would duplicate Redis writes and external API calls. "
            "Set WORKERS=1 (the default) and scale horizontally instead."
        )

    _background_tasks.append(
        asyncio.create_task(aircraft_ingestion_loop(), name="aircraft-ingestion")
    )
    _background_tasks.append(
        asyncio.create_task(weather_ingestion_loop(), name="weather-ingestion")
    )

    yield

    logger.info("Shutting down — cancelling background workers")
    for task in _background_tasks:
        task.cancel()
    await asyncio.gather(*_background_tasks, return_exceptions=True)
    logger.info("Background workers stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        docs_url="/docs" if (not settings.is_production or settings.EXPOSE_DOCS_IN_PRODUCTION) else None,
        redoc_url="/redoc" if (not settings.is_production or settings.EXPOSE_DOCS_IN_PRODUCTION) else None,
        lifespan=lifespan,
    )

    # ── Middleware stack (applied in reverse order) ─────────────────
    app.add_middleware(ExceptionHandlerMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestTrackingMiddleware)
    if settings.ENABLE_LEGACY_UNPREFIXED_ROUTES:
        app.add_middleware(LegacyRoutePrefixMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ─────────────────────────────────────────────────────
    api_prefix = settings.API_PREFIX
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(api_keys.router, prefix=api_prefix)
    app.include_router(config.router, prefix=api_prefix)
    app.include_router(aircraft.router, prefix=api_prefix)
    app.include_router(air_quality.router, prefix=api_prefix)
    app.include_router(aviation.router, prefix=api_prefix)
    app.include_router(disaster.router, prefix=api_prefix)
    app.include_router(forecast.router, prefix=api_prefix)
    app.include_router(mission_export.router, prefix=api_prefix)
    app.include_router(missions.router, prefix=api_prefix)
    app.include_router(route_risk.router, prefix=api_prefix)
    app.include_router(weather.router, prefix=api_prefix)
    app.include_router(snapshot.router, prefix=api_prefix)
    # Health + metrics without auth prefix
    app.include_router(health.router)
    app.include_router(metrics.router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "docs": "/docs",
        }

    return app


app = create_app()
