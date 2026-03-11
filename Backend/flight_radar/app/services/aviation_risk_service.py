"""Derived aviation risk service built on top of existing provider domains."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from math import asin, cos, radians, sin, sqrt
from typing import Any

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.engines.aviation_risk_engine import AviationRiskEngineInput, build_aviation_risk_assessment
from app.models.config import Airport
from app.repositories.config_repository import ConfigRepository
from app.schemas.air_quality import AirQualityCellResponse, AirQualityGridResponse
from app.schemas.aviation import (
    AviationAlertData,
    AviationAlertResponse,
    AviationAirportWeatherData,
    AviationForecastData,
    AviationForecastPeriod,
    AviationForecastResponse,
    AviationMetarResponse,
)
from app.schemas.aviation_risk import AviationRiskAirportContext, AviationRiskResponse
from app.schemas.disaster import DisasterContextData, DisasterContextResponse, DisasterGeometry
from app.schemas.forecast import ForecastResponse
from app.schemas.weather import WeatherCellResponse, WeatherGridResponse
from app.services.air_quality_service import get_air_quality_grid
from app.services.aviation_weather_service import (
    get_metar_response,
    get_sigmet_response,
    get_taf_response,
)
from app.services.disaster_context_service import get_disaster_contexts
from app.services.forecast_service import get_forecast
from app.services.weather_service import get_weather_grid

logger = logging.getLogger(__name__)
settings = get_settings()

_MAX_WEATHER_CELL_DISTANCE_KM = 125.0
_MAX_AIR_QUALITY_CELL_DISTANCE_KM = 150.0
_MAX_AIRPORT_CONTEXT_DISTANCE_KM = 150.0
_MAX_AIRPORT_WEATHER_DISTANCE_KM = 75.0


@dataclass(slots=True)
class AviationRiskDomainSnapshot:
    weather_grid: WeatherGridResponse | None
    sigmet_response: AviationAlertResponse | None
    disaster_response: DisasterContextResponse | None
    air_quality_grid: AirQualityGridResponse | None
    airports: list[Airport]


@dataclass(slots=True)
class AviationRiskAirportSelection:
    nearest_airport: Airport | None
    nearest_distance_km: float | None
    selected_airport: Airport | None
    airport_context: AviationRiskAirportContext | None


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = radians(lat1)
    lon1_rad = radians(lon1)
    lat2_rad = radians(lat2)
    lon2_rad = radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))


def _nearest_weather_cell(
    response: WeatherGridResponse | None,
    lat: float,
    lon: float,
) -> tuple[WeatherCellResponse | None, float | None]:
    if response is None or not response.cells:
        return None, None
    best_cell: WeatherCellResponse | None = None
    best_distance: float | None = None
    for cell in response.cells:
        distance = _haversine_km(lat, lon, cell.data.latitude, cell.data.longitude)
        if best_distance is None or distance < best_distance:
            best_cell = cell
            best_distance = distance
    if best_distance is not None and best_distance > _MAX_WEATHER_CELL_DISTANCE_KM:
        return None, best_distance
    return best_cell, best_distance


def _nearest_air_quality_cell(
    response: AirQualityGridResponse | None,
    lat: float,
    lon: float,
) -> tuple[AirQualityCellResponse | None, float | None]:
    if response is None or not response.cells:
        return None, None
    best_cell: AirQualityCellResponse | None = None
    best_distance: float | None = None
    for cell in response.cells:
        distance = _haversine_km(lat, lon, cell.data.latitude, cell.data.longitude)
        if best_distance is None or distance < best_distance:
            best_cell = cell
            best_distance = distance
    if best_distance is not None and best_distance > _MAX_AIR_QUALITY_CELL_DISTANCE_KM:
        return None, best_distance
    return best_cell, best_distance


def _nearest_airport(
    airports: list[Airport],
    lat: float,
    lon: float,
) -> tuple[Airport | None, float | None]:
    if not airports:
        return None, None
    best_airport: Airport | None = None
    best_distance: float | None = None
    for airport in airports:
        distance = _haversine_km(lat, lon, airport.latitude, airport.longitude)
        if best_distance is None or distance < best_distance:
            best_airport = airport
            best_distance = distance
    return best_airport, best_distance


def _airport_context(airport: Airport, distance_km: float) -> AviationRiskAirportContext:
    return AviationRiskAirportContext(
        icao=airport.icao,
        iata=airport.iata,
        name=airport.name,
        city=airport.city,
        country=airport.country,
        latitude=airport.latitude,
        longitude=airport.longitude,
        distance_km=round(distance_km, 2),
    )


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _current_taf_period(taf: AviationForecastData | None, now: datetime) -> AviationForecastPeriod | None:
    if taf is None:
        return None
    for period in taf.forecast_periods:
        start = _parse_datetime(period.start_time)
        end = _parse_datetime(period.end_time)
        if start is not None and end is not None and start <= now <= end:
            return period
    return None


def _strip_single_outer_group(text: str) -> str:
    stripped = text.strip()
    if not (stripped.startswith("(") and stripped.endswith(")")):
        return stripped
    depth = 0
    for index, char in enumerate(stripped):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0 and index != len(stripped) - 1:
                return stripped
    return stripped[1:-1].strip()


def _split_top_level_groups(text: str) -> list[str]:
    groups: list[str] = []
    depth = 0
    start: int | None = None
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
            if depth == 1:
                start = index + 1
        elif char == ")":
            if depth == 1 and start is not None:
                groups.append(text[start:index].strip())
            depth = max(depth - 1, 0)
    return groups


def _parse_ring(text: str) -> list[tuple[float, float]] | None:
    points: list[tuple[float, float]] = []
    for pair in text.split(","):
        parts = [part for part in pair.strip().split() if part]
        if len(parts) < 2:
            return None
        try:
            lon = float(parts[0])
            lat = float(parts[1])
        except ValueError:
            return None
        points.append((lon, lat))
    return points if len(points) >= 3 else None


def _parse_polygon_rings(text: str) -> list[list[tuple[float, float]]]:
    inner = _strip_single_outer_group(text)
    ring_groups = _split_top_level_groups(inner)
    if not ring_groups:
        ring_groups = [inner]

    rings: list[list[tuple[float, float]]] = []
    for group in ring_groups:
        ring = _parse_ring(group)
        if ring is None:
            return []
        rings.append(ring)
    return rings


def _point_in_ring(lon: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    previous_index = len(ring) - 1
    for index, (x_i, y_i) in enumerate(ring):
        x_j, y_j = ring[previous_index]
        crosses_latitude = (y_i > lat) != (y_j > lat)
        if crosses_latitude:
            denominator = (y_j - y_i) or 1e-12
            x_intersection = ((x_j - x_i) * (lat - y_i) / denominator) + x_i
            if lon < x_intersection:
                inside = not inside
        previous_index = index
    return inside


def _point_in_polygon_rings(lon: float, lat: float, rings: list[list[tuple[float, float]]]) -> bool:
    if not rings:
        return False
    if not _point_in_ring(lon, lat, rings[0]):
        return False
    return not any(_point_in_ring(lon, lat, hole) for hole in rings[1:])


def _point_in_wkt_area(lon: float, lat: float, wkt: str) -> bool:
    text = wkt.strip()
    upper = text.upper()
    if upper.startswith("POLYGON"):
        body = text[text.find("(") :]
        return _point_in_polygon_rings(lon, lat, _parse_polygon_rings(body))
    if upper.startswith("MULTIPOLYGON"):
        body = _strip_single_outer_group(text[text.find("(") :])
        for polygon_text in _split_top_level_groups(body):
            if _point_in_polygon_rings(lon, lat, _parse_polygon_rings(polygon_text)):
                return True
    return False


def _has_evaluable_wkt_geometry(geometry: DisasterGeometry | None) -> bool:
    if geometry is None:
        return False
    if geometry.kind not in {"event_extent", "area_extent"}:
        return False
    upper = geometry.wkt.strip().upper()
    return upper.startswith("POLYGON") or upper.startswith("MULTIPOLYGON")


def _event_matches_location(event: DisasterContextData, lat: float, lon: float) -> bool:
    geometries: list[DisasterGeometry] = []
    if _has_evaluable_wkt_geometry(event.geometry):
        geometries.append(event.geometry)  # type: ignore[arg-type]
    for area in event.areas:
        if _has_evaluable_wkt_geometry(area.geometry):
            geometries.append(area.geometry)  # type: ignore[arg-type]
    return any(_point_in_wkt_area(lon, lat, geometry.wkt) for geometry in geometries)


def _matching_disaster_events(
    events: list[DisasterContextData],
    lat: float,
    lon: float,
) -> tuple[list[DisasterContextData], int]:
    matches: list[DisasterContextData] = []
    evaluable_count = 0
    for event in events:
        geometries = []
        if _has_evaluable_wkt_geometry(event.geometry):
            geometries.append(event.geometry)
        geometries.extend(
            area.geometry
            for area in event.areas
            if _has_evaluable_wkt_geometry(area.geometry)
        )
        if geometries:
            evaluable_count += 1
        if _event_matches_location(event, lat, lon):
            matches.append(event)
    return matches, evaluable_count


def _point_in_geojson_polygon(lon: float, lat: float, coordinates: Any) -> bool:
    if not isinstance(coordinates, list):
        return False
    rings: list[list[tuple[float, float]]] = []
    for ring in coordinates:
        if not isinstance(ring, list):
            return False
        parsed_ring: list[tuple[float, float]] = []
        for point in ring:
            if not isinstance(point, list) or len(point) < 2:
                return False
            try:
                parsed_ring.append((float(point[0]), float(point[1])))
            except (TypeError, ValueError):
                return False
        if len(parsed_ring) < 3:
            return False
        rings.append(parsed_ring)
    return _point_in_polygon_rings(lon, lat, rings)


def _has_evaluable_sigmet_geometry(geometry: dict[str, Any] | None) -> bool:
    if not isinstance(geometry, dict):
        return False
    geometry_type = str(geometry.get("type") or "").strip().lower()
    return geometry_type in {"polygon", "multipolygon"}


def _sigmet_matches_location(alert: AviationAlertData, lat: float, lon: float) -> bool:
    geometry = alert.geometry
    if not isinstance(geometry, dict):
        return False

    geometry_type = str(geometry.get("type") or "").strip().lower()
    coordinates = geometry.get("coordinates")
    if geometry_type == "polygon":
        return _point_in_geojson_polygon(lon, lat, coordinates)
    if geometry_type == "multipolygon" and isinstance(coordinates, list):
        return any(_point_in_geojson_polygon(lon, lat, polygon) for polygon in coordinates)
    return False


def _matching_sigmets(
    alerts: list[AviationAlertData],
    lat: float,
    lon: float,
) -> tuple[list[AviationAlertData], int]:
    matches: list[AviationAlertData] = []
    evaluable_count = 0
    for alert in alerts:
        if _has_evaluable_sigmet_geometry(alert.geometry):
            evaluable_count += 1
        if _sigmet_matches_location(alert, lat, lon):
            matches.append(alert)
    return matches, evaluable_count


def _select_metar(response: AviationMetarResponse | None, station_id: str | None) -> AviationAirportWeatherData | None:
    if response is None or not response.metars:
        return None
    if station_id is not None:
        for metar in response.metars:
            if metar.station_id.upper() == station_id.upper():
                return metar
        return None
    return response.metars[0]


def _select_taf(response: AviationForecastResponse | None, station_id: str | None) -> AviationForecastData | None:
    if response is None or not response.tafs:
        return None
    if station_id is not None:
        for taf in response.tafs:
            if taf.station_id.upper() == station_id.upper():
                return taf
        return None
    return response.tafs[0]


def resolve_airport_selection(
    airports: list[Airport],
    lat: float,
    lon: float,
) -> AviationRiskAirportSelection:
    nearest_airport, airport_distance_km = _nearest_airport(airports, lat, lon)
    if nearest_airport is None or airport_distance_km is None:
        return AviationRiskAirportSelection(
            nearest_airport=None,
            nearest_distance_km=None,
            selected_airport=None,
            airport_context=None,
        )

    airport_context = (
        _airport_context(nearest_airport, airport_distance_km)
        if airport_distance_km <= _MAX_AIRPORT_CONTEXT_DISTANCE_KM
        else None
    )
    selected_airport = (
        nearest_airport
        if airport_distance_km <= _MAX_AIRPORT_WEATHER_DISTANCE_KM
        else None
    )

    return AviationRiskAirportSelection(
        nearest_airport=nearest_airport,
        nearest_distance_km=airport_distance_km,
        selected_airport=selected_airport,
        airport_context=airport_context,
    )


async def get_aviation_risk_domain_snapshot(redis: RedisClient) -> AviationRiskDomainSnapshot:
    weather_grid_result, sigmet_result, disaster_result, air_quality_result, airports_result = await asyncio.gather(
        get_weather_grid(redis),
        get_sigmet_response(redis),
        get_disaster_contexts(redis),
        get_air_quality_grid(redis),
        ConfigRepository(redis).list_airports(),
        return_exceptions=True,
    )

    weather_grid = weather_grid_result if isinstance(weather_grid_result, WeatherGridResponse) else None
    sigmet_response = sigmet_result if isinstance(sigmet_result, AviationAlertResponse) else None
    disaster_response = disaster_result if isinstance(disaster_result, DisasterContextResponse) else None
    air_quality_grid = air_quality_result if isinstance(air_quality_result, AirQualityGridResponse) else None
    airports = airports_result if isinstance(airports_result, list) else []

    if isinstance(weather_grid_result, Exception):
        logger.warning("Aviation risk weather-grid input unavailable", extra={"error": str(weather_grid_result)})
    if isinstance(sigmet_result, Exception):
        logger.warning("Aviation risk SIGMET input unavailable", extra={"error": str(sigmet_result)})
    if isinstance(disaster_result, Exception):
        logger.warning("Aviation risk disaster input unavailable", extra={"error": str(disaster_result)})
    if isinstance(air_quality_result, Exception):
        logger.warning("Aviation risk air-quality input unavailable", extra={"error": str(air_quality_result)})
    if isinstance(airports_result, Exception):
        logger.warning("Aviation risk airport lookup unavailable", extra={"error": str(airports_result)})

    return AviationRiskDomainSnapshot(
        weather_grid=weather_grid,
        sigmet_response=sigmet_response,
        disaster_response=disaster_response,
        air_quality_grid=air_quality_grid,
        airports=airports,
    )


async def build_aviation_risk_point_response(
    redis: RedisClient,
    lat: float,
    lon: float,
    *,
    domain_snapshot: AviationRiskDomainSnapshot | None = None,
    forecast: ForecastResponse | None = None,
    metar_response: AviationMetarResponse | None = None,
    taf_response: AviationForecastResponse | None = None,
    fetch_forecast_if_missing: bool = True,
    fetch_aviation_weather_if_missing: bool = True,
) -> AviationRiskResponse:
    if domain_snapshot is None:
        domain_snapshot = await get_aviation_risk_domain_snapshot(redis)

    if forecast is None and fetch_forecast_if_missing:
        try:
            forecast = await get_forecast(redis, lat=lat, lon=lon)
        except Exception as exc:
            logger.warning(
                "Aviation risk forecast input unavailable",
                extra={"error": str(exc), "lat": lat, "lon": lon},
            )
            forecast = None

    nearest_weather_cell, weather_distance_km = _nearest_weather_cell(domain_snapshot.weather_grid, lat, lon)
    nearest_air_quality_cell, air_quality_distance_km = _nearest_air_quality_cell(domain_snapshot.air_quality_grid, lat, lon)
    airport_selection = resolve_airport_selection(domain_snapshot.airports, lat, lon)
    selected_airport = airport_selection.selected_airport
    airport_context = airport_selection.airport_context

    if (
        airport_selection.nearest_airport is not None
        and airport_selection.nearest_distance_km is not None
        and selected_airport is None
    ):
        logger.info(
            "Aviation risk nearest airport exceeds evaluation radius",
            extra={
                "lat": lat,
                "lon": lon,
                "station_id": airport_selection.nearest_airport.icao,
                "distance_km": round(airport_selection.nearest_distance_km, 2),
                "max_distance_km": _MAX_AIRPORT_WEATHER_DISTANCE_KM,
            },
        )

    if selected_airport is not None and fetch_aviation_weather_if_missing:
        aviation_fetches = []
        aviation_fetch_labels: list[str] = []
        if metar_response is None:
            aviation_fetches.append(get_metar_response(redis, ids=selected_airport.icao))
            aviation_fetch_labels.append("metar")
        if taf_response is None:
            aviation_fetches.append(get_taf_response(redis, ids=selected_airport.icao))
            aviation_fetch_labels.append("taf")

        if aviation_fetches:
            aviation_results = await asyncio.gather(*aviation_fetches, return_exceptions=True)
            for label, result in zip(aviation_fetch_labels, aviation_results, strict=True):
                if label == "metar":
                    if isinstance(result, AviationMetarResponse):
                        metar_response = result
                    elif isinstance(result, Exception):
                        logger.warning(
                            "Aviation risk METAR input unavailable",
                            extra={"error": str(result), "station_id": selected_airport.icao, "lat": lat, "lon": lon},
                        )
                if label == "taf":
                    if isinstance(result, AviationForecastResponse):
                        taf_response = result
                    elif isinstance(result, Exception):
                        logger.warning(
                            "Aviation risk TAF input unavailable",
                            extra={"error": str(result), "station_id": selected_airport.icao, "lat": lat, "lon": lon},
                        )

    metar = _select_metar(metar_response, selected_airport.icao if selected_airport is not None else None)
    taf = _select_taf(taf_response, selected_airport.icao if selected_airport is not None else None)
    now_utc = datetime.now(timezone.utc)
    taf_current_period = _current_taf_period(taf, now_utc)

    sigmets = domain_snapshot.sigmet_response.sigmets if domain_snapshot.sigmet_response is not None else []
    location_sigmets, sigmet_evaluable_count = _matching_sigmets(sigmets, lat, lon)

    disaster_events = domain_snapshot.disaster_response.events if domain_snapshot.disaster_response is not None else []
    location_disasters, disaster_evaluable_count = _matching_disaster_events(disaster_events, lat, lon)

    input_snapshot = {
        "location": {"lat": lat, "lon": lon},
        "nearest_weather_cell": {
            "cell_key": nearest_weather_cell.cell_key,
            "distance_km": round(weather_distance_km, 2) if weather_distance_km is not None else None,
            "data": nearest_weather_cell.data.model_dump(mode="json"),
        }
        if nearest_weather_cell is not None
        else None,
        "forecast_current": forecast.current.model_dump(mode="json") if forecast is not None and forecast.current is not None else None,
        "nearest_airport": airport_context.model_dump(mode="json") if airport_context is not None else None,
        "metar": metar.model_dump(mode="json") if metar is not None else None,
        "taf_current_period": taf_current_period.model_dump(mode="json") if taf_current_period is not None else None,
        "sigmet_count": len(sigmets),
        "matched_sigmet_count": len(location_sigmets),
        "sigmet_evaluable_count": sigmet_evaluable_count,
        "disaster_count": len(disaster_events),
        "matched_disaster_count": len(location_disasters),
        "disaster_evaluable_count": disaster_evaluable_count,
        "nearest_air_quality_cell": {
            "cell_key": nearest_air_quality_cell.cell_key,
            "distance_km": round(air_quality_distance_km, 2) if air_quality_distance_km is not None else None,
            "data": nearest_air_quality_cell.data.model_dump(mode="json"),
        }
        if nearest_air_quality_cell is not None
        else None,
    }
    logger.info(
        "Aviation risk input snapshot",
        extra={
            "lat": lat,
            "lon": lon,
            "nearest_airport": airport_context.icao if airport_context is not None else None,
            "matched_sigmet_count": len(location_sigmets),
            "matched_disaster_count": len(location_disasters),
        },
    )
    logger.debug("Aviation risk input payload", extra={"snapshot": input_snapshot})

    response = build_aviation_risk_assessment(
        AviationRiskEngineInput(
            latitude=lat,
            longitude=lon,
            evaluated_at=now_utc.isoformat(),
            nearest_airport=airport_context,
            weather=nearest_weather_cell.data if nearest_weather_cell is not None else None,
            forecast_current=forecast.current if forecast is not None else None,
            metar=metar,
            taf=taf,
            taf_current_period=taf_current_period,
            location_sigmets=location_sigmets,
            location_disasters=location_disasters,
            air_quality=nearest_air_quality_cell.data if nearest_air_quality_cell is not None else None,
            sigmet_data_available=domain_snapshot.sigmet_response is not None,
            sigmet_count=len(sigmets),
            disaster_data_available=domain_snapshot.disaster_response is not None and settings.COPERNICUS_CEMS_ENABLED,
            disaster_event_count=len(disaster_events),
            disaster_evaluable_count=disaster_evaluable_count,
        )
    )

    logger.info(
        "Aviation risk computed",
        extra={
            "lat": lat,
            "lon": lon,
            "overall_level": response.overall_level,
            "score": response.score,
            "factor_count": response.factor_count,
        },
    )
    logger.debug(
        "Aviation risk computed payload",
        extra={"factors": [factor.model_dump(mode="json") for factor in response.factors]},
    )
    return response


async def get_aviation_risk_response(redis: RedisClient, lat: float, lon: float) -> AviationRiskResponse:
    return await build_aviation_risk_point_response(redis, lat=lat, lon=lon)
