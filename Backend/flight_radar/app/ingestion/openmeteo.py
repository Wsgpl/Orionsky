"""
Open-Meteo weather and forecast adapter.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.cache.redis_client import RedisClient
from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError
from app.schemas.forecast import (
    DailyForecastItem,
    ForecastCurrent,
    ForecastLocation,
    ForecastResponse,
    HourlyForecastItem,
)
from app.schemas.weather import WeatherData

logger = logging.getLogger(__name__)
settings = get_settings()

TEMPERATURE_RANGE_C = (-50.0, 55.0)
WIND_RANGE_MS = (0.0, 41.67)  # equivalent to ~150 km/h
HUMIDITY_RANGE = (0.0, 100.0)
PRESSURE_RANGE_HPA = (850.0, 1100.0)
VISIBILITY_RANGE_M = (0.0, 100000.0)
CLOUD_COVER_RANGE = (0.0, 100.0)
PRECIPITATION_RANGE_MM = (0.0, 500.0)

_weather_circuit_breaker = CircuitBreaker(
    name="openmeteo_weather",
    failure_threshold=settings.OPEN_METEO_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.OPEN_METEO_CB_RECOVERY_TIMEOUT,
)

_forecast_circuit_breaker = CircuitBreaker(
    name="openmeteo_forecast",
    failure_threshold=settings.OPEN_METEO_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.OPEN_METEO_CB_RECOVERY_TIMEOUT,
)

_WMO_CODE_LABELS: dict[int, str] = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def get_openmeteo_circuit() -> CircuitBreaker:
    return _weather_circuit_breaker


def _safe_float_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _required_numeric_value(value: Any, field_name: str, context: str) -> float:
    if value is None or value == "":
        raise ValueError(f"{context} missing required field '{field_name}'")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{context} field '{field_name}' is not numeric: {value!r}") from exc


def _required_float(container: dict[str, Any], key: str) -> float:
    value = container.get(key)
    if value is None or value == "":
        raise ValueError(f"Open-Meteo payload missing required field '{key}'")
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Open-Meteo field '{key}' is not numeric: {value!r}") from exc


def _optional_float(container: dict[str, Any], key: str) -> float | None:
    value = container.get(key)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_list(payload: dict[str, Any], key: str) -> list[Any]:
    value = payload.get(key)
    return value if isinstance(value, list) else []


def _condition_from_code(value: Any) -> str | None:
    try:
        code = int(value)
    except (TypeError, ValueError):
        return None
    return _WMO_CODE_LABELS.get(code)


async def _request_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=settings.OPEN_METEO_TIMEOUT) as client:
        response = await client.get(url, params=params)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("Unexpected Open-Meteo payload")
    logger.debug(
        "Open-Meteo raw response",
        extra={"url": url, "params": params, "payload": payload},
    )
    return payload


def _weather_params(lat: float, lon: float) -> dict[str, Any]:
    return {
        "latitude": lat,
        "longitude": lon,
        "current": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "pressure_msl",
                "wind_speed_10m",
                "wind_direction_10m",
                "precipitation",
                "cloud_cover",
                "visibility",
                "weather_code",
            ]
        ),
        "wind_speed_unit": "ms",
    }


def _forecast_params(lat: float, lon: float) -> dict[str, Any]:
    return {
        "latitude": lat,
        "longitude": lon,
        "timezone": "auto",
        "forecast_days": 7,
        "wind_speed_unit": "ms",
        "current": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "pressure_msl",
                "wind_speed_10m",
                "wind_direction_10m",
                "precipitation",
                "cloud_cover",
                "visibility",
                "weather_code",
            ]
        ),
        "hourly": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "pressure_msl",
                "wind_speed_10m",
                "wind_direction_10m",
                "cloud_cover",
                "visibility",
                "precipitation_probability",
                "precipitation",
                "weather_code",
            ]
        ),
        "daily": ",".join(
            [
                "temperature_2m_min",
                "temperature_2m_max",
                "precipitation_probability_max",
                "precipitation_sum",
                "weather_code",
                "wind_speed_10m_max",
            ]
        ),
    }


def _validate_range(name: str, value: float, minimum: float, maximum: float) -> float:
    if value < minimum or value > maximum:
        raise ValueError(
            f"Open-Meteo field '{name}' out of expected range: {value} not in [{minimum}, {maximum}]"
        )
    return value


def _validate_current_values(current: dict[str, Any]) -> dict[str, float | None]:
    precipitation = _optional_float(current, "precipitation")
    if precipitation is not None:
        precipitation = _validate_range(
            "precipitation",
            precipitation,
            *PRECIPITATION_RANGE_MM,
        )

    validated = {
        "temperature": _validate_range(
            "temperature_2m",
            _required_float(current, "temperature_2m"),
            *TEMPERATURE_RANGE_C,
        ),
        "apparent_temperature": _optional_float(current, "apparent_temperature"),
        "humidity": _validate_range(
            "relative_humidity_2m",
            _required_float(current, "relative_humidity_2m"),
            *HUMIDITY_RANGE,
        ),
        "pressure": _validate_range(
            "pressure_msl",
            _required_float(current, "pressure_msl"),
            *PRESSURE_RANGE_HPA,
        ),
        "wind_speed": _validate_range(
            "wind_speed_10m",
            _required_float(current, "wind_speed_10m"),
            *WIND_RANGE_MS,
        ),
        "wind_direction": _required_float(current, "wind_direction_10m") % 360,
        "precipitation": precipitation,
        "cloud_cover": _validate_range(
            "cloud_cover",
            _required_float(current, "cloud_cover"),
            *CLOUD_COVER_RANGE,
        ),
        "visibility": _validate_range(
            "visibility",
            _required_float(current, "visibility"),
            *VISIBILITY_RANGE_M,
        ),
    }

    apparent_temperature = validated["apparent_temperature"]
    if apparent_temperature is not None:
        _validate_range("apparent_temperature", apparent_temperature, *TEMPERATURE_RANGE_C)
    return validated


def _current_log_payload(current: dict[str, Any]) -> dict[str, Any]:
    return {
        "time": current.get("time"),
        "temperature_2m": current.get("temperature_2m"),
        "apparent_temperature": current.get("apparent_temperature"),
        "relative_humidity_2m": current.get("relative_humidity_2m"),
        "pressure_msl": current.get("pressure_msl"),
        "wind_speed_10m": current.get("wind_speed_10m"),
        "wind_direction_10m": current.get("wind_direction_10m"),
        "precipitation": current.get("precipitation"),
        "cloud_cover": current.get("cloud_cover"),
        "visibility": current.get("visibility"),
        "weather_code": current.get("weather_code"),
    }


def _first_series_log_payload(
    block: dict[str, Any],
    fields: tuple[str, ...],
) -> dict[str, Any] | None:
    times = _safe_list(block, "time")
    if not times:
        return None

    payload: dict[str, Any] = {"time": times[0]}
    for field in fields:
        values = _safe_list(block, field)
        payload[field] = values[0] if values else None
    return payload


def _normalise_weather(payload: dict[str, Any], lat: float, lon: float) -> WeatherData:
    current = payload.get("current")
    if not isinstance(current, dict):
        raise ValueError("Open-Meteo weather response missing current block")
    logger.debug(
        "Open-Meteo raw current values",
        extra={
            "latitude": lat,
            "longitude": lon,
            "current": _current_log_payload(current),
        },
    )
    validated = _validate_current_values(current)
    weather = WeatherData(
        latitude=lat,
        longitude=lon,
        temperature=float(validated["temperature"]),
        humidity=float(validated["humidity"]),
        pressure=float(validated["pressure"]),
        wind_speed=float(validated["wind_speed"]),
        wind_direction=float(validated["wind_direction"]),
        precip_mm=(
            float(validated["precipitation"])
            if validated["precipitation"] is not None
            else None
        ),
        cloud_cover=float(validated["cloud_cover"]),
        visibility=float(validated["visibility"]),
        condition=_condition_from_code(current.get("weather_code")),
        source=settings.GENERAL_WEATHER_PROVIDER,
    )
    logger.debug(
        "Open-Meteo parsed weather values",
        extra={
            "latitude": lat,
            "longitude": lon,
            "weather": weather.model_dump(mode="json"),
        },
    )
    return weather


def _extract_current(payload: dict[str, Any]) -> ForecastCurrent | None:
    current = payload.get("current")
    if not isinstance(current, dict):
        return None
    validated = _validate_current_values(current)
    forecast_current = ForecastCurrent(
        source=settings.GENERAL_WEATHER_PROVIDER,
        temperature=float(validated["temperature"]),
        apparent_temperature=(
            float(validated["apparent_temperature"])
            if validated["apparent_temperature"] is not None
            else None
        ),
        humidity=float(validated["humidity"]),
        pressure=float(validated["pressure"]),
        wind_speed=float(validated["wind_speed"]),
        wind_direction=float(validated["wind_direction"]),
        precipitation_amount=(
            float(validated["precipitation"])
            if validated["precipitation"] is not None
            else None
        ),
        cloud_cover=float(validated["cloud_cover"]),
        visibility=float(validated["visibility"]),
        condition=_condition_from_code(current.get("weather_code")),
        observed_at=str(current.get("time")) if current.get("time") is not None else None,
    )
    logger.debug(
        "Open-Meteo parsed forecast current values",
        extra={
            "latitude": _safe_float_or_none(payload.get("latitude")),
            "longitude": _safe_float_or_none(payload.get("longitude")),
            "current": forecast_current.model_dump(mode="json"),
        },
    )
    return forecast_current


def _extract_hourly(payload: dict[str, Any]) -> list[HourlyForecastItem]:
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        return []

    times = _safe_list(hourly, "time")
    temperatures = _safe_list(hourly, "temperature_2m")
    humidity = _safe_list(hourly, "relative_humidity_2m")
    pressure = _safe_list(hourly, "pressure_msl")
    wind_speed = _safe_list(hourly, "wind_speed_10m")
    wind_direction = _safe_list(hourly, "wind_direction_10m")
    cloud_cover = _safe_list(hourly, "cloud_cover")
    visibility = _safe_list(hourly, "visibility")
    precipitation_probability = _safe_list(hourly, "precipitation_probability")
    precipitation = _safe_list(hourly, "precipitation")
    weather_codes = _safe_list(hourly, "weather_code")

    items: list[HourlyForecastItem] = []
    for index, time_value in enumerate(times):
        hourly_wind_direction = (
            _safe_float_or_none(wind_direction[index]) if index < len(wind_direction) else None
        )
        items.append(
            HourlyForecastItem(
                source=settings.GENERAL_WEATHER_PROVIDER,
                time=str(time_value),
                temperature=_safe_float_or_none(temperatures[index]) if index < len(temperatures) else None,
                humidity=_safe_float_or_none(humidity[index]) if index < len(humidity) else None,
                pressure=_safe_float_or_none(pressure[index]) if index < len(pressure) else None,
                wind_speed=_safe_float_or_none(wind_speed[index]) if index < len(wind_speed) else None,
                wind_direction=hourly_wind_direction % 360 if hourly_wind_direction is not None else None,
                cloud_cover=_safe_float_or_none(cloud_cover[index]) if index < len(cloud_cover) else None,
                visibility=_safe_float_or_none(visibility[index]) if index < len(visibility) else None,
                precipitation_probability=(
                    _safe_float_or_none(precipitation_probability[index])
                    if index < len(precipitation_probability)
                    else None
                ),
                precipitation_amount=_safe_float_or_none(precipitation[index]) if index < len(precipitation) else None,
                condition=_condition_from_code(weather_codes[index]) if index < len(weather_codes) else None,
            )
        )
    logger.debug(
        "Open-Meteo parsed first hourly point",
        extra={
            "latitude": _safe_float_or_none(payload.get("latitude")),
            "longitude": _safe_float_or_none(payload.get("longitude")),
            "first_hourly": items[0].model_dump(mode="json") if items else None,
        },
    )
    return items


def _extract_daily(payload: dict[str, Any]) -> list[DailyForecastItem]:
    daily = payload.get("daily")
    if not isinstance(daily, dict):
        return []

    dates = _safe_list(daily, "time")
    temp_min = _safe_list(daily, "temperature_2m_min")
    temp_max = _safe_list(daily, "temperature_2m_max")
    precipitation_probability = _safe_list(daily, "precipitation_probability_max")
    precipitation = _safe_list(daily, "precipitation_sum")
    weather_codes = _safe_list(daily, "weather_code")
    wind_speed = _safe_list(daily, "wind_speed_10m_max")

    items: list[DailyForecastItem] = []
    for index, date_value in enumerate(dates):
        items.append(
            DailyForecastItem(
                source=settings.GENERAL_WEATHER_PROVIDER,
                date=str(date_value),
                temp_min=_safe_float_or_none(temp_min[index]) if index < len(temp_min) else None,
                temp_max=_safe_float_or_none(temp_max[index]) if index < len(temp_max) else None,
                wind_speed=_safe_float_or_none(wind_speed[index]) if index < len(wind_speed) else None,
                precipitation_probability=(
                    _safe_float_or_none(precipitation_probability[index])
                    if index < len(precipitation_probability)
                    else None
                ),
                precipitation_amount=_safe_float_or_none(precipitation[index]) if index < len(precipitation) else None,
                condition=_condition_from_code(weather_codes[index]) if index < len(weather_codes) else None,
            )
        )
    logger.debug(
        "Open-Meteo parsed first daily point",
        extra={
            "latitude": _safe_float_or_none(payload.get("latitude")),
            "longitude": _safe_float_or_none(payload.get("longitude")),
            "first_daily": items[0].model_dump(mode="json") if items else None,
        },
    )
    return items


async def _resolve_query(query: str) -> tuple[str, float, float]:
    params = {
        "name": query,
        "count": 1,
        "language": "en",
        "format": "json",
    }
    payload = await _request_json(settings.OPEN_METEO_GEOCODING_URL, params=params)
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        raise ValueError(f"Location not found for query '{query}'")
    match = results[0]
    if not isinstance(match, dict):
        raise ValueError(f"Unexpected geocoding payload for query '{query}'")

    lat = _required_numeric_value(
        match.get("latitude"),
        "latitude",
        f"Open-Meteo geocoding result for '{query}'",
    )
    lon = _required_numeric_value(
        match.get("longitude"),
        "longitude",
        f"Open-Meteo geocoding result for '{query}'",
    )
    name_parts = [
        str(match.get("name")).strip() if match.get("name") else "",
        str(match.get("admin1")).strip() if match.get("admin1") else "",
        str(match.get("country")).strip() if match.get("country") else "",
    ]
    label = ", ".join(part for part in name_parts if part) or query
    return label, lat, lon


async def _fetch_weather_raw(lat: float, lon: float) -> WeatherData:
    payload = await _request_json(settings.OPEN_METEO_FORECAST_URL, params=_weather_params(lat, lon))
    return _normalise_weather(payload, lat=lat, lon=lon)


async def _fetch_forecast_raw(query: str, lat: float | None, lon: float | None) -> ForecastResponse:
    resolved_query = query
    resolved_lat = lat
    resolved_lon = lon

    if resolved_lat is None or resolved_lon is None:
        resolved_query, resolved_lat, resolved_lon = await _resolve_query(query)

    assert resolved_lat is not None and resolved_lon is not None
    payload = await _request_json(settings.OPEN_METEO_FORECAST_URL, params=_forecast_params(resolved_lat, resolved_lon))
    if isinstance(payload.get("current"), dict):
        logger.debug(
            "Open-Meteo raw forecast current values",
            extra={
                "query": resolved_query,
                "latitude": resolved_lat,
                "longitude": resolved_lon,
                "current": _current_log_payload(payload["current"]),
            },
        )
    if isinstance(payload.get("hourly"), dict):
        logger.debug(
            "Open-Meteo raw first hourly point",
            extra={
                "query": resolved_query,
                "latitude": resolved_lat,
                "longitude": resolved_lon,
                "first_hourly": _first_series_log_payload(
                    payload["hourly"],
                    (
                        "temperature_2m",
                        "apparent_temperature",
                        "relative_humidity_2m",
                        "pressure_msl",
                        "wind_speed_10m",
                        "wind_direction_10m",
                        "precipitation_probability",
                        "precipitation",
                        "cloud_cover",
                        "visibility",
                        "weather_code",
                    ),
                ),
            },
        )
    if isinstance(payload.get("daily"), dict):
        logger.debug(
            "Open-Meteo raw first daily point",
            extra={
                "query": resolved_query,
                "latitude": resolved_lat,
                "longitude": resolved_lon,
                "first_daily": _first_series_log_payload(
                    payload["daily"],
                    (
                        "temperature_2m_min",
                        "temperature_2m_max",
                        "precipitation_probability_max",
                        "precipitation_sum",
                        "weather_code",
                        "wind_speed_10m_max",
                    ),
                ),
            },
        )

    forecast = ForecastResponse(
        source=settings.GENERAL_WEATHER_PROVIDER,
        location=ForecastLocation(
            query=resolved_query,
            latitude=_safe_float_or_none(payload.get("latitude")),
            longitude=_safe_float_or_none(payload.get("longitude")),
        ),
        current=_extract_current(payload),
        hourly=_extract_hourly(payload),
        daily=_extract_daily(payload),
    )
    logger.debug(
        "Open-Meteo parsed forecast values",
        extra={
            "query": resolved_query,
            "latitude": resolved_lat,
            "longitude": resolved_lon,
            "current": forecast.current.model_dump(mode="json") if forecast.current else None,
            "first_hourly": forecast.hourly[0].model_dump(mode="json") if forecast.hourly else None,
            "first_daily": forecast.daily[0].model_dump(mode="json") if forecast.daily else None,
        },
    )
    return forecast


def _make_weather_retry(lat: float, lon: float):
    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(settings.OPEN_METEO_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.OPEN_METEO_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> WeatherData:
        return await _fetch_weather_raw(lat, lon)

    return _inner


def _make_forecast_retry(query: str, lat: float | None, lon: float | None):
    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(settings.OPEN_METEO_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.OPEN_METEO_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> ForecastResponse:
        return await _fetch_forecast_raw(query=query, lat=lat, lon=lon)

    return _inner


async def fetch_weather(lat: float, lon: float, redis: RedisClient) -> WeatherData | None:
    hash_key = f"{settings.GENERAL_WEATHER_CACHE_NAMESPACE}:{int(lat)}:{int(lon)}"

    try:
        weather = await _weather_circuit_breaker.call(_make_weather_retry(lat, lon))
    except CircuitBreakerError as exc:
        logger.warning("Open-Meteo weather circuit open: %s", exc)
        return None
    except (httpx.RequestError, httpx.HTTPStatusError, ValueError) as exc:
        logger.error(
            "Open-Meteo weather fetch failed for (%s, %s): %s",
            lat,
            lon,
            exc,
        )
        return None
    except Exception as exc:
        logger.exception("Unexpected Open-Meteo weather error: %s", exc)
        return None

    mapping = {
        "temperature": str(weather.temperature),
        "humidity": str(weather.humidity),
        "pressure": str(weather.pressure),
        "wind_speed": str(weather.wind_speed),
        "wind_direction": str(weather.wind_direction),
        "cloud_cover": str(weather.cloud_cover),
        "visibility": str(weather.visibility),
        "source": weather.source,
    }
    if weather.condition is not None:
        mapping["condition"] = weather.condition
    if weather.precip_mm is not None:
        mapping["precip_mm"] = str(weather.precip_mm)
    logger.debug(
        "Open-Meteo weather Redis write payload",
        extra={"hash_key": hash_key, "payload": mapping},
    )
    await redis.hset(hash_key, mapping=mapping)
    if weather.condition is None:
        await redis.hdel(hash_key, "condition")
    if weather.precip_mm is None:
        await redis.hdel(hash_key, "precip_mm")
    await redis.expire(hash_key, settings.OPEN_METEO_CACHE_TTL)
    return weather


async def fetch_forecast(query: str, lat: float | None = None, lon: float | None = None) -> ForecastResponse:
    try:
        return await _forecast_circuit_breaker.call(_make_forecast_retry(query=query, lat=lat, lon=lon))
    except CircuitBreakerError as exc:
        logger.warning("Open-Meteo forecast circuit open: %s", exc)
        raise
