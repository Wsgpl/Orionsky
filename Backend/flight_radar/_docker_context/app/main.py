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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import aircraft, api_keys, auth, health, metrics, snapshot, weather
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info(
        "Starting FlightRadar backend",
        extra={"version": settings.APP_VERSION, "environment": settings.ENVIRONMENT},
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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if not settings.is_production else settings.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ─────────────────────────────────────────────────────
    api_prefix = settings.API_PREFIX
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(api_keys.router, prefix=api_prefix)
    app.include_router(aircraft.router, prefix=api_prefix)
    app.include_router(weather.router, prefix=api_prefix)
    app.include_router(snapshot.router, prefix=api_prefix)

    if settings.ENABLE_LEGACY_UNPREFIXED_ROUTES:
        app.include_router(auth.router)
        app.include_router(api_keys.router)
        app.include_router(aircraft.router)
        app.include_router(weather.router)
        app.include_router(snapshot.router)
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
