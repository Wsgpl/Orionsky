"""Forecast service backed by Redis cache and provider adapters."""
from __future__ import annotations

import logging

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.ingestion.openmeteo import fetch_forecast
from app.schemas.forecast import (
    ForecastLocation,
    ForecastResponse,
)

FORECAST_QUERY_TTL_SECONDS = 1800
FORECAST_COORDS_TTL_SECONDS = 900

logger = logging.getLogger(__name__)
settings = get_settings()


def _query_cache_key(query: str) -> str:
    return f"{settings.FORECAST_CACHE_NAMESPACE}:query:{query.strip().lower()}"


def _coords_cache_key(lat: float, lon: float) -> str:
    return f"{settings.FORECAST_CACHE_NAMESPACE}:coords:{lat:.4f}:{lon:.4f}"


def _requested_location_query(query: str | None, lat: float | None, lon: float | None) -> str:
    if query:
        return query.strip()
    if lat is not None and lon is not None:
        return f"{lat:.4f},{lon:.4f}"
    return "India"


def _empty_forecast_response(
    query: str | None,
    lat: float | None,
    lon: float | None,
) -> ForecastResponse:
    return ForecastResponse(
        source="unavailable",
        location=ForecastLocation(
            query=_requested_location_query(query, lat, lon),
            latitude=lat,
            longitude=lon,
        ),
        current=None,
        hourly=[],
        daily=[],
    )


def _is_synthetic_forecast_source(source: str | None) -> bool:
    if not source:
        return False
    lowered = source.lower()
    return "fallback" in lowered or lowered == "unavailable"


def _forecast_log_payload(forecast: ForecastResponse) -> dict[str, object | None]:
    return {
        "source": forecast.source,
        "location": forecast.location.model_dump(mode="json"),
        "current": forecast.current.model_dump(mode="json") if forecast.current else None,
        "first_hourly": forecast.hourly[0].model_dump(mode="json") if forecast.hourly else None,
        "first_daily": forecast.daily[0].model_dump(mode="json") if forecast.daily else None,
        "hourly_count": len(forecast.hourly),
        "daily_count": len(forecast.daily),
    }


async def get_forecast(
    redis: RedisClient,
    query: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
) -> ForecastResponse:
    if query is None and (lat is None or lon is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either query or both lat and lon",
        )

    cache_key = _coords_cache_key(lat, lon) if lat is not None and lon is not None else _query_cache_key(query or "")
    cached = await redis.get_json(cache_key)
    if isinstance(cached, dict):
        try:
            cached_forecast = ForecastResponse.model_validate(cached)
        except ValidationError as exc:
            logger.warning(
                "Discarding malformed forecast cache entry",
                extra={"cache_key": cache_key, "error": str(exc)},
            )
            await redis.delete(cache_key)
            cached_forecast = None
        if cached_forecast is None:
            pass
        elif _is_synthetic_forecast_source(cached_forecast.source):
            logger.warning(
                "Discarding synthetic forecast cache entry",
                extra={"cache_key": cache_key, "source": cached_forecast.source},
            )
            await redis.delete(cache_key)
        else:
            logger.info(
                "Forecast cache hit",
                extra={
                    "cache_key": cache_key,
                    "source": cached_forecast.source,
                    "hourly_count": len(cached_forecast.hourly),
                    "daily_count": len(cached_forecast.daily),
                },
            )
            logger.debug(
                "Forecast cache payload",
                extra={"cache_key": cache_key, "forecast": _forecast_log_payload(cached_forecast)},
            )
            return cached_forecast

    resolved_query = _requested_location_query(query, lat, lon)

    try:
        forecast = await fetch_forecast(query=resolved_query, lat=lat, lon=lon)
        logger.info(
            "Forecast provider response",
            extra={
                "query": resolved_query,
                "source": forecast.source,
                "hourly_count": len(forecast.hourly),
                "daily_count": len(forecast.daily),
            },
        )
        logger.debug(
            "Forecast provider payload",
            extra={"query": resolved_query, "forecast": _forecast_log_payload(forecast)},
        )
    except Exception as exc:
        logger.error(
            "Forecast provider failed; returning empty forecast",
            extra={"error": str(exc), "query": resolved_query},
        )
        return _empty_forecast_response(query=query, lat=lat, lon=lon)

    ttl = FORECAST_COORDS_TTL_SECONDS if lat is not None and lon is not None else FORECAST_QUERY_TTL_SECONDS
    await redis.set_json(cache_key, forecast.model_dump(mode="json"), ex=ttl)
    logger.info(
        "Forecast response cached",
        extra={
            "cache_key": cache_key,
            "source": forecast.source,
            "hourly_count": len(forecast.hourly),
            "daily_count": len(forecast.daily),
        },
    )
    logger.debug(
        "Forecast cache write payload",
        extra={"cache_key": cache_key, "forecast": _forecast_log_payload(forecast)},
    )
    return forecast
