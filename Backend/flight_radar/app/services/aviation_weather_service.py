"""AWC-backed aviation weather service with Redis caching."""
from __future__ import annotations

import logging
import re

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.ingestion.awc import AviationProviderError, fetch_metars, fetch_sigmets, fetch_tafs
from app.schemas.aviation import (
    AviationAlertResponse,
    AviationForecastResponse,
    AviationMetarResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

_STATION_ID_RE = re.compile(r"^[A-Z0-9]{2,8}$")


def _normalise_station_ids(ids: str) -> list[str]:
    parts = [part.strip().upper() for part in ids.split(",") if part.strip()]
    if not parts:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="ids must include at least one station identifier",
        )
    normalised: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not _STATION_ID_RE.fullmatch(part):
            logger.warning("Rejected invalid aviation station identifier", extra={"station_id": part})
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid station identifier: {part}",
            )
        if part not in seen:
            seen.add(part)
            normalised.append(part)
    return normalised


def _cache_suffix(ids: list[str]) -> str:
    return ",".join(ids).lower()


def _metar_cache_key(ids: list[str]) -> str:
    return f"{settings.AVIATION_METAR_CACHE_NAMESPACE}:{_cache_suffix(ids)}"


def _taf_cache_key(ids: list[str]) -> str:
    return f"{settings.AVIATION_TAF_CACHE_NAMESPACE}:{_cache_suffix(ids)}"


def _sigmet_cache_key() -> str:
    return f"{settings.AVIATION_SIGMET_CACHE_NAMESPACE}:current"


async def _get_cached_response(redis: RedisClient, cache_key: str, model_type):
    cached = await redis.get_json(cache_key)
    if not isinstance(cached, dict):
        return None
    try:
        response = model_type.model_validate(cached)
    except ValidationError as exc:
        logger.warning(
            "Discarding malformed aviation cache entry",
            extra={"cache_key": cache_key, "error": str(exc)},
        )
        await redis.delete(cache_key)
        return None
    logger.info(
        "Aviation cache hit",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Aviation cache payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response


async def get_metar_response(redis: RedisClient, ids: str) -> AviationMetarResponse:
    station_ids = _normalise_station_ids(ids)
    cache_key = _metar_cache_key(station_ids)
    cached = await _get_cached_response(redis, cache_key, AviationMetarResponse)
    if cached is not None:
        return cached
    logger.info("Aviation cache miss", extra={"cache_key": cache_key})

    try:
        metars = await fetch_metars(",".join(station_ids))
    except AviationProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    response = AviationMetarResponse(count=len(metars), metars=metars)
    await redis.set_json(cache_key, response.model_dump(mode="json"), ex=settings.AWC_CACHE_TTL)
    logger.info(
        "Aviation cache write",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Aviation normalized METAR payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response


async def get_taf_response(redis: RedisClient, ids: str) -> AviationForecastResponse:
    station_ids = _normalise_station_ids(ids)
    cache_key = _taf_cache_key(station_ids)
    cached = await _get_cached_response(redis, cache_key, AviationForecastResponse)
    if cached is not None:
        return cached
    logger.info("Aviation cache miss", extra={"cache_key": cache_key})

    try:
        tafs = await fetch_tafs(",".join(station_ids))
    except AviationProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    response = AviationForecastResponse(count=len(tafs), tafs=tafs)
    await redis.set_json(cache_key, response.model_dump(mode="json"), ex=settings.AWC_CACHE_TTL)
    logger.info(
        "Aviation cache write",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Aviation normalized TAF payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response


async def get_sigmet_response(redis: RedisClient) -> AviationAlertResponse:
    cache_key = _sigmet_cache_key()
    cached = await _get_cached_response(redis, cache_key, AviationAlertResponse)
    if cached is not None:
        return cached
    logger.info("Aviation cache miss", extra={"cache_key": cache_key})

    try:
        sigmets = await fetch_sigmets()
    except AviationProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

    response = AviationAlertResponse(count=len(sigmets), sigmets=sigmets)
    await redis.set_json(cache_key, response.model_dump(mode="json"), ex=settings.AWC_CACHE_TTL)
    logger.info(
        "Aviation cache write",
        extra={"cache_key": cache_key, "count": response.count},
    )
    logger.debug(
        "Aviation normalized SIGMET payload",
        extra={"cache_key": cache_key, "payload": response.model_dump(mode="json")},
    )
    return response
