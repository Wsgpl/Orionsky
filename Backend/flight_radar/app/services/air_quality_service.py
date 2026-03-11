"""Air-quality service backed by Copernicus CAMS and Redis cache."""
from __future__ import annotations

import logging

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.ingestion.copernicus_cams import AirQualityProviderError, fetch_air_quality_grid
from app.schemas.air_quality import AirQualityCellResponse, AirQualityData, AirQualityGridResponse

logger = logging.getLogger(__name__)
settings = get_settings()
AIR_QUALITY_SOURCE = settings.AIR_QUALITY_PROVIDER


def _normalise_source(value: object | None) -> str | None:
    if value is None:
        return None
    normalised = str(value).strip().lower()
    return normalised or None


def _grid_points() -> list[tuple[float, float]]:
    step = settings.WEATHER_GRID_STEP
    points: list[tuple[float, float]] = []
    lat = settings.AIRSPACE_MIN_LAT
    while lat < settings.AIRSPACE_MAX_LAT:
        lon = settings.AIRSPACE_MIN_LON
        while lon < settings.AIRSPACE_MAX_LON:
            points.append((float(lat), float(lon)))
            lon += step
        lat += step
    return points


def _empty_response() -> AirQualityGridResponse:
    return AirQualityGridResponse(source=AIR_QUALITY_SOURCE, count=0, cells=[])


async def _get_cached_response(redis: RedisClient) -> AirQualityGridResponse | None:
    cache_key = settings.air_quality_data_cache_key
    cached = await redis.get_json(cache_key)
    if not isinstance(cached, dict):
        return None
    try:
        response = AirQualityGridResponse.model_validate(cached)
    except ValidationError as exc:
        logger.warning(
            "Discarding malformed air-quality cache entry",
            extra={"cache_key": cache_key, "error": str(exc)},
        )
        await redis.delete(cache_key)
        return None

    if _normalise_source(response.source) != AIR_QUALITY_SOURCE:
        logger.warning(
            "Discarding air-quality cache entry with invalid source",
            extra={"cache_key": cache_key, "source": response.source},
        )
        await redis.delete(cache_key)
        return None

    logger.info(
        "Air-quality cache hit",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Air-quality cache read payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response


async def get_air_quality_grid(redis: RedisClient) -> AirQualityGridResponse:
    cache_key = settings.air_quality_data_cache_key
    cached = await _get_cached_response(redis)
    if cached is not None:
        return cached

    if not settings.COPERNICUS_CAMS_ENABLED:
        logger.info(
            "Air-quality provider disabled; returning empty response",
            extra={"provider": AIR_QUALITY_SOURCE},
        )
        return _empty_response()

    logger.info(
        "Air-quality cache miss",
        extra={"cache_key": cache_key, "grid_cell_count": len(_grid_points())},
    )

    try:
        point_map = await fetch_air_quality_grid(_grid_points())
    except AirQualityProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    cells: list[AirQualityCellResponse] = []
    for cell_key, point in sorted(point_map.items()):
        source = _normalise_source(point.source)
        if source != AIR_QUALITY_SOURCE:
            logger.warning("Skipping air-quality point with invalid source: %r", point.source)
            continue
        cells.append(
            AirQualityCellResponse(
                cell_key=cell_key,
                data=AirQualityData(
                    latitude=point.lat,
                    longitude=point.lon,
                    timestamp=point.timestamp,
                    pm25=point.pm25,
                    pm10=point.pm10,
                    ozone=point.ozone,
                    no2=point.no2,
                    so2=point.so2,
                    co=point.co,
                    aqi_category=point.aqi_category,
                    source=source,
                ),
            )
        )

    response = AirQualityGridResponse(
        source=AIR_QUALITY_SOURCE,
        count=len(cells),
        cells=cells,
    )
    await redis.set_json(cache_key, response.model_dump(mode="json"), ex=settings.COPERNICUS_CAMS_CACHE_TTL)
    logger.info(
        "Air-quality cache write",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Air-quality cache write payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response
