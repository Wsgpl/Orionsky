"""Disaster context service backed by Copernicus CEMS and Redis cache."""
from __future__ import annotations

import logging

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.ingestion.copernicus_cems import DisasterProviderError, fetch_disaster_contexts
from app.schemas.disaster import DisasterContextResponse

logger = logging.getLogger(__name__)
settings = get_settings()
DISASTER_SOURCE = settings.DISASTER_PROVIDER


def _normalise_source(value: object | None) -> str | None:
    if value is None:
        return None
    normalised = str(value).strip().lower()
    return normalised or None


def _empty_response() -> DisasterContextResponse:
    return DisasterContextResponse(source=DISASTER_SOURCE, count=0, events=[])


async def _get_cached_response(redis: RedisClient) -> DisasterContextResponse | None:
    cache_key = settings.disaster_data_cache_key
    cached = await redis.get_json(cache_key)
    if not isinstance(cached, dict):
        return None

    try:
        response = DisasterContextResponse.model_validate(cached)
    except ValidationError as exc:
        logger.warning(
            "Discarding malformed disaster cache entry",
            extra={"cache_key": cache_key, "error": str(exc)},
        )
        await redis.delete(cache_key)
        return None

    if _normalise_source(response.source) != DISASTER_SOURCE:
        logger.warning(
            "Discarding disaster cache entry with invalid source",
            extra={"cache_key": cache_key, "source": response.source},
        )
        await redis.delete(cache_key)
        return None

    logger.info(
        "Disaster cache hit",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Disaster cache read payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response


async def get_disaster_contexts(redis: RedisClient) -> DisasterContextResponse:
    if not settings.COPERNICUS_CEMS_ENABLED:
        logger.info(
            "Disaster provider disabled; returning empty response",
            extra={"provider": DISASTER_SOURCE},
        )
        return _empty_response()

    cache_key = settings.disaster_data_cache_key
    cached = await _get_cached_response(redis)
    if cached is not None:
        return cached

    logger.info(
        "Disaster cache miss",
        extra={"cache_key": cache_key, "page_limit": settings.COPERNICUS_CEMS_PAGE_LIMIT},
    )

    try:
        events = await fetch_disaster_contexts(settings.COPERNICUS_CEMS_PAGE_LIMIT)
    except DisasterProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    response = DisasterContextResponse(
        source=DISASTER_SOURCE,
        count=len(events),
        events=events,
    )
    await redis.set_json(cache_key, response.model_dump(mode="json"), ex=settings.COPERNICUS_CEMS_CACHE_TTL)
    logger.info(
        "Disaster cache write",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Disaster cache write payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response
