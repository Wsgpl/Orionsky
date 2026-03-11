"""Route-based aviation risk service built on top of point-risk evaluation."""
from __future__ import annotations

import asyncio
import logging
from math import asin, cos, radians, sin, sqrt

from fastapi import HTTPException, status

from app.cache.redis_client import RedisClient
from app.engines.route_risk_engine import RouteRiskEngineSample, build_route_risk_assessment
from app.schemas.aviation import AviationForecastResponse, AviationMetarResponse
from app.schemas.forecast import ForecastResponse
from app.schemas.route_risk import RouteRiskAnalyzeRequest, RouteRiskCoordinate, RouteRiskResponse
from app.schemas.weather import WeatherGridResponse
from app.services.aviation_risk_service import (
    build_aviation_risk_point_response,
    get_aviation_risk_domain_snapshot,
    resolve_airport_selection,
)
from app.services.aviation_weather_service import get_metar_response, get_taf_response
from app.services.forecast_service import get_forecast
from app.utils.route_sampling import RouteSamplePoint, RouteVertex, build_route_sampling_plan

logger = logging.getLogger(__name__)

_FORECAST_CONCURRENCY = 10
_MAX_ROUTE_RISK_SAMPLES = 30
_MAX_WEATHER_GRID_DISTANCE_KM = 125.0


def _empty_metar_response() -> AviationMetarResponse:
    return AviationMetarResponse(count=0, metars=[])


def _empty_taf_response() -> AviationForecastResponse:
    return AviationForecastResponse(count=0, tafs=[])


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = radians(lat1)
    lon1_rad = radians(lon1)
    lat2_rad = radians(lat2)
    lon2_rad = radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))


def _sample_has_nearby_weather_grid(
    weather_grid: WeatherGridResponse | None,
    sample: RouteSamplePoint,
) -> bool:
    if weather_grid is None or not weather_grid.cells:
        return False

    best_distance: float | None = None
    for cell in weather_grid.cells:
        distance = _haversine_km(sample.lat, sample.lon, cell.data.latitude, cell.data.longitude)
        if best_distance is None or distance < best_distance:
            best_distance = distance

    return best_distance is not None and best_distance <= _MAX_WEATHER_GRID_DISTANCE_KM


async def _prefetch_route_forecasts(
    redis: RedisClient,
    samples: list[RouteSamplePoint],
    weather_grid: WeatherGridResponse | None,
) -> dict[int, ForecastResponse | None]:
    semaphore = asyncio.Semaphore(_FORECAST_CONCURRENCY)
    forecasts: dict[int, ForecastResponse | None] = {
        index: None
        for index, sample in enumerate(samples)
        if _sample_has_nearby_weather_grid(weather_grid, sample)
    }

    async def _fetch(index: int, sample: RouteSamplePoint) -> tuple[int, ForecastResponse | None]:
        async with semaphore:
            try:
                forecast = await get_forecast(redis, lat=sample.lat, lon=sample.lon)
            except Exception as exc:
                logger.warning(
                    "Route-risk forecast input unavailable",
                    extra={"error": str(exc), "sample_index": index, "lat": sample.lat, "lon": sample.lon},
                )
                forecast = None
            return index, forecast

    fetch_targets = [
        (index, sample)
        for index, sample in enumerate(samples)
        if index not in forecasts
    ]

    if not fetch_targets:
        return forecasts

    logger.info(
        "Route-risk exact forecast fetches scheduled",
        extra={
            "requested_sample_count": len(samples),
            "forecast_fetch_count": len(fetch_targets),
        },
    )

    for index, forecast in await asyncio.gather(
        *(_fetch(index, sample) for index, sample in fetch_targets)
    ):
        forecasts[index] = forecast

    return forecasts


def _build_effective_sampling_plan(
    route: list[RouteVertex],
    requested_sample_spacing_km: float,
):
    initial_plan = build_route_sampling_plan(route, requested_sample_spacing_km)
    if len(initial_plan.samples) <= _MAX_ROUTE_RISK_SAMPLES:
        return initial_plan, False

    target_sample_count = max(_MAX_ROUTE_RISK_SAMPLES, len(initial_plan.route))
    adjusted_spacing_km = max(
        requested_sample_spacing_km,
        initial_plan.total_distance_km / max(target_sample_count - 1, 1),
    )
    adjusted_plan = build_route_sampling_plan(route, adjusted_spacing_km)

    while (
        len(adjusted_plan.samples) > _MAX_ROUTE_RISK_SAMPLES
        and adjusted_spacing_km < adjusted_plan.total_distance_km
    ):
        adjusted_spacing_km *= 1.2
        adjusted_plan = build_route_sampling_plan(route, adjusted_spacing_km)

    return adjusted_plan, True


async def _prefetch_route_aviation_weather(
    redis: RedisClient,
    station_ids: list[str],
) -> tuple[AviationMetarResponse, AviationForecastResponse]:
    if not station_ids:
        return _empty_metar_response(), _empty_taf_response()

    ids = ",".join(station_ids)
    metar_result, taf_result = await asyncio.gather(
        get_metar_response(redis, ids=ids),
        get_taf_response(redis, ids=ids),
        return_exceptions=True,
    )

    metar_response = _empty_metar_response()
    taf_response = _empty_taf_response()

    if isinstance(metar_result, AviationMetarResponse):
        metar_response = metar_result
    elif isinstance(metar_result, Exception):
        logger.warning(
            "Route-risk METAR batch unavailable",
            extra={"error": str(metar_result), "station_count": len(station_ids)},
        )

    if isinstance(taf_result, AviationForecastResponse):
        taf_response = taf_result
    elif isinstance(taf_result, Exception):
        logger.warning(
            "Route-risk TAF batch unavailable",
            extra={"error": str(taf_result), "station_count": len(station_ids)},
        )

    return metar_response, taf_response


async def get_route_risk_response(
    redis: RedisClient,
    request: RouteRiskAnalyzeRequest,
) -> RouteRiskResponse:
    try:
        route_vertices = [RouteVertex(lat=point.lat, lon=point.lon) for point in request.normalized_route]
        sampling_plan, sampling_adjusted = _build_effective_sampling_plan(
            route_vertices,
            request.sample_spacing_km,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    domain_snapshot = await get_aviation_risk_domain_snapshot(redis)

    unique_station_ids: list[str] = []
    seen_station_ids: set[str] = set()
    for sample in sampling_plan.samples:
        airport_selection = resolve_airport_selection(domain_snapshot.airports, sample.lat, sample.lon)
        selected_airport = airport_selection.selected_airport
        if selected_airport is None:
            continue
        station_id = selected_airport.icao.upper()
        if station_id not in seen_station_ids:
            seen_station_ids.add(station_id)
            unique_station_ids.append(station_id)

    forecast_map, aviation_weather = await asyncio.gather(
        _prefetch_route_forecasts(redis, sampling_plan.samples, domain_snapshot.weather_grid),
        _prefetch_route_aviation_weather(redis, unique_station_ids),
    )
    metar_response, taf_response = aviation_weather

    engine_samples: list[RouteRiskEngineSample] = []
    for index, sample in enumerate(sampling_plan.samples):
        forecast = forecast_map.get(index)
        point_risk = await build_aviation_risk_point_response(
            redis,
            lat=sample.lat,
            lon=sample.lon,
            domain_snapshot=domain_snapshot,
            forecast=forecast,
            metar_response=metar_response,
            taf_response=taf_response,
            fetch_forecast_if_missing=False,
            fetch_aviation_weather_if_missing=False,
        )
        engine_samples.append(
            RouteRiskEngineSample(
                sample_index=index,
                coordinate=RouteRiskCoordinate(lat=sample.lat, lon=sample.lon),
                distance_from_start_km=sample.distance_from_start_km,
                is_route_vertex=sample.is_route_vertex,
                point_risk=point_risk,
            )
        )

    response = build_route_risk_assessment(
        route_point_count=len(sampling_plan.route),
        total_distance_km=sampling_plan.total_distance_km,
        requested_sample_spacing_km=request.sample_spacing_km,
        sample_spacing_km=sampling_plan.sample_spacing_km,
        sampling_adjusted=sampling_adjusted,
        samples=engine_samples,
    )
    logger.info(
        "Route risk computed",
        extra={
            "route_point_count": len(sampling_plan.route),
            "sample_point_count": len(engine_samples),
            "total_distance_km": sampling_plan.total_distance_km,
            "sampling_adjusted": sampling_adjusted,
            "overall_level": response.overall_level,
            "overall_score": response.overall_score,
        },
    )
    logger.debug(
        "Route risk payload",
        extra={"payload": response.model_dump(mode="json")},
    )
    return response
