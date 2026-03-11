"""AWC aviation weather adapter for METAR / TAF / SIGMET products."""
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

from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError
from app.schemas.aviation import (
    AviationAlertData,
    AviationAirportWeatherData,
    AviationCloudLayer,
    AviationForecastData,
    AviationForecastPeriod,
)

logger = logging.getLogger(__name__)
settings = get_settings()

AWC_SOURCE = "awc"
_HPA_TO_INHG = 0.0295299830714


class AviationProviderError(RuntimeError):
    """Raised when AWC cannot provide a requested aviation product."""


_awc_metar_circuit_breaker = CircuitBreaker(
    name="awc_metar",
    failure_threshold=settings.AWC_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.AWC_CB_RECOVERY_TIMEOUT,
)
_awc_taf_circuit_breaker = CircuitBreaker(
    name="awc_taf",
    failure_threshold=settings.AWC_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.AWC_CB_RECOVERY_TIMEOUT,
)
_awc_sigmet_circuit_breaker = CircuitBreaker(
    name="awc_sigmet",
    failure_threshold=settings.AWC_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.AWC_CB_RECOVERY_TIMEOUT,
)


def get_awc_metar_circuit() -> CircuitBreaker:
    return _awc_metar_circuit_breaker


def get_awc_taf_circuit() -> CircuitBreaker:
    return _awc_taf_circuit_breaker


def get_awc_sigmet_circuit() -> CircuitBreaker:
    return _awc_sigmet_circuit_breaker


def _awx_headers() -> dict[str, str]:
    return {"User-Agent": f"{settings.APP_NAME}/{settings.APP_VERSION} (+AWC backend integration)"}


def _optional_str(record: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = record.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _optional_float(record: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = record.get(key)
        if value in (None, ""):
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _optional_int(record: dict[str, Any], *keys: str) -> int | None:
    number = _optional_float(record, *keys)
    if number is None:
        return None
    return int(round(number))


def _pressure_hpa_from_record(record: dict[str, Any]) -> float | None:
    pressure_hpa = _optional_float(record, "slp", "seaLevelPressure", "pressure_hpa")
    if pressure_hpa is not None:
        return pressure_hpa
    return _optional_float(record, "altim")


def _altimeter_in_hg_from_record(record: dict[str, Any]) -> float | None:
    altimeter_in_hg = _optional_float(record, "altimeterInHg", "altimeter_in_hg")
    if altimeter_in_hg is not None:
        return altimeter_in_hg

    altimeter_hpa = _optional_float(record, "altim")
    if altimeter_hpa is None:
        return None
    return round(altimeter_hpa * _HPA_TO_INHG, 2)


def _normalise_cloud_layers(value: Any) -> list[AviationCloudLayer]:
    if not isinstance(value, list):
        return []

    layers: list[AviationCloudLayer] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        layer = AviationCloudLayer(
            coverage=_optional_str(item, "cover", "coverage", "skyCover", "sky_cover"),
            base_ft_agl=_optional_int(item, "base", "base_ft_agl", "cloudBaseFtAgl"),
            top_ft_agl=_optional_int(item, "top", "top_ft_agl", "cloudTopFtAgl"),
        )
        if layer.coverage is None and layer.base_ft_agl is None and layer.top_ft_agl is None:
            continue
        layers.append(layer)
    return layers


def _derive_ceiling_ft_agl(record: dict[str, Any], cloud_layers: list[AviationCloudLayer]) -> int | None:
    direct_ceiling = _optional_int(record, "ceiling", "ceil", "ceiling_ft_agl", "vertVis")
    if direct_ceiling is not None:
        return direct_ceiling

    candidate_bases = [
        layer.base_ft_agl
        for layer in cloud_layers
        if layer.base_ft_agl is not None and (layer.coverage or "").upper() in {"BKN", "OVC", "VV", "OVX"}
    ]
    return min(candidate_bases) if candidate_bases else None


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        raise ValueError("AWC payload was not JSON object/list")

    data = payload.get("data")
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]

    features = payload.get("features")
    if isinstance(features, list):
        records: list[dict[str, Any]] = []
        for feature in features:
            if not isinstance(feature, dict):
                continue
            properties = feature.get("properties")
            if not isinstance(properties, dict):
                continue
            record = dict(properties)
            if isinstance(feature.get("geometry"), dict):
                record["_geometry"] = feature["geometry"]
            records.append(record)
        return records

    return []


async def _request_records(product: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    url = f"{settings.AWC_BASE_URL.rstrip('/')}/{product}"
    logger.info("AWC provider request", extra={"product": product, "params": params})
    async with httpx.AsyncClient(timeout=settings.AWC_TIMEOUT, headers=_awx_headers()) as client:
        response = await client.get(url, params=params)

    if response.status_code == 204:
        logger.info("AWC provider response", extra={"product": product, "status_code": 204, "record_count": 0})
        return []

    response.raise_for_status()
    payload = response.json()
    records = _extract_records(payload)
    logger.info(
        "AWC provider response",
        extra={
            "product": product,
            "status_code": response.status_code,
            "record_count": len(records),
        },
    )
    logger.debug(
        "AWC provider response payload",
        extra={
            "product": product,
            "record_count": len(records),
            "sample_record": records[0] if records else None,
        },
    )
    return records


def _make_retry(product: str, params: dict[str, Any]):
    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(settings.AWC_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.AWC_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> list[dict[str, Any]]:
        return await _request_records(product, params)

    return _inner


async def _fetch_with_circuit(
    product: str,
    params: dict[str, Any],
    circuit: CircuitBreaker,
) -> list[dict[str, Any]]:
    try:
        return await circuit.call(_make_retry(product, params))
    except CircuitBreakerError as exc:
        logger.warning("AWC circuit open", extra={"product": product, "error": str(exc)})
        raise AviationProviderError(f"AWC {product} circuit open") from exc
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("AWC request failed", extra={"product": product, "error": str(exc)})
        raise AviationProviderError(f"AWC {product} request failed") from exc


def _normalise_metar_record(record: dict[str, Any]) -> AviationAirportWeatherData | None:
    station_id = _optional_str(record, "icaoId", "stationId", "station", "stid", "id")
    if station_id is None:
        return None

    cloud_layers = _normalise_cloud_layers(record.get("clouds"))
    pressure_hpa = _pressure_hpa_from_record(record)
    data = AviationAirportWeatherData(
        station_id=station_id,
        latitude=_optional_float(record, "lat", "latitude"),
        longitude=_optional_float(record, "lon", "longitude"),
        observation_time=_optional_str(record, "obsTime", "obsTimeUtc", "reportTime", "observationTime"),
        raw_text=_optional_str(record, "rawOb", "raw_text", "raw"),
        visibility_sm=_optional_float(record, "visib", "visibility", "visibilitySm"),
        wind_speed_kt=_optional_float(record, "wspd", "windSpeed", "wind_speed_kt"),
        wind_gust_kt=_optional_float(record, "wgst", "windGust", "wind_gust_kt"),
        wind_direction_deg=_optional_float(record, "wdir", "windDirection", "wind_direction_deg"),
        temperature_c=_optional_float(record, "temp", "temperature"),
        dewpoint_c=_optional_float(record, "dewp", "dewpoint", "dewPoint"),
        altimeter_in_hg=_altimeter_in_hg_from_record(record),
        pressure_hpa=pressure_hpa,
        cloud_layers=cloud_layers,
        ceiling_ft_agl=_derive_ceiling_ft_agl(record, cloud_layers),
        flight_category=_optional_str(record, "fltCat", "flightCategory"),
        source=AWC_SOURCE,
    )
    return data


def _normalise_forecast_period(record: dict[str, Any]) -> AviationForecastPeriod | None:
    cloud_layers = _normalise_cloud_layers(record.get("clouds"))
    period = AviationForecastPeriod(
        start_time=_optional_str(record, "fcstTimeFrom", "timeFrom", "startTime", "validFrom"),
        end_time=_optional_str(record, "fcstTimeTo", "timeTo", "endTime", "validTo"),
        change_indicator=_optional_str(record, "changeIndicator", "change_indicator"),
        probability_percent=_optional_int(record, "probability", "probabilityPercent"),
        raw_text=_optional_str(record, "rawTaf", "rawTAF", "raw_text", "raw"),
        visibility_sm=_optional_float(record, "visib", "visibility", "visibilitySm"),
        wind_speed_kt=_optional_float(record, "wspd", "windSpeed", "wind_speed_kt"),
        wind_gust_kt=_optional_float(record, "wgst", "windGust", "wind_gust_kt"),
        wind_direction_deg=_optional_float(record, "wdir", "windDirection", "wind_direction_deg"),
        cloud_layers=cloud_layers,
        weather=_optional_str(record, "wxString", "weather", "weatherString"),
        source=AWC_SOURCE,
    )
    has_period_data = any(
        value is not None
        for value in (
            period.start_time,
            period.end_time,
            period.change_indicator,
            period.raw_text,
            period.visibility_sm,
            period.wind_speed_kt,
            period.wind_gust_kt,
            period.wind_direction_deg,
            period.weather,
        )
    ) or bool(period.cloud_layers)
    return period if has_period_data else None


def _normalise_taf_record(record: dict[str, Any]) -> AviationForecastData | None:
    station_id = _optional_str(record, "icaoId", "stationId", "station", "stid", "id")
    if station_id is None:
        return None

    periods_raw = record.get("fcsts") or record.get("forecasts") or record.get("forecastPeriods") or []
    periods = []
    if isinstance(periods_raw, list):
        for item in periods_raw:
            if not isinstance(item, dict):
                continue
            normalised = _normalise_forecast_period(item)
            if normalised is not None:
                periods.append(normalised)

    return AviationForecastData(
        station_id=station_id,
        issue_time=_optional_str(record, "issueTime", "issue_time"),
        valid_from=_optional_str(record, "validTimeFrom", "validFrom", "valid_from"),
        valid_to=_optional_str(record, "validTimeTo", "validTo", "valid_to"),
        raw_text=_optional_str(record, "rawTAF", "rawTaf", "raw_text", "raw"),
        forecast_periods=periods,
        source=AWC_SOURCE,
    )


def _sigmet_geometry_from_record(record: dict[str, Any]) -> dict[str, Any] | None:
    geometry = record.get("_geometry")
    if isinstance(geometry, dict):
        return geometry

    geom_type = _optional_str(record, "geom", "geometryType")
    coords = record.get("coords")
    if geom_type is None or not isinstance(coords, list):
        return None

    points: list[list[float]] = []
    for item in coords:
        if not isinstance(item, dict):
            continue
        lon = _optional_float(item, "lon", "longitude")
        lat = _optional_float(item, "lat", "latitude")
        if lon is None or lat is None:
            continue
        points.append([lon, lat])

    geom_upper = geom_type.strip().upper()
    if geom_upper == "AREA" and len(points) >= 4:
        return {"type": "Polygon", "coordinates": [points]}
    if geom_upper in {"LINE", "LINESTRING"} and len(points) >= 2:
        return {"type": "LineString", "coordinates": points}
    if geom_upper == "POINT" and points:
        return {"type": "Point", "coordinates": points[0]}
    return None


def _normalise_sigmet_record(record: dict[str, Any]) -> AviationAlertData | None:
    alert_id = _optional_str(record, "sigmetId", "airsigmetId", "isigmetId", "sequence", "sequenceId", "id")
    raw_text = _optional_str(record, "rawSigmet", "rawAirSigmet", "rawText", "raw_text", "raw")
    description = _optional_str(record, "description", "details", "text", "body")
    hazard_type = _optional_str(record, "hazard", "hazardType", "phenomenon")
    if alert_id is None and raw_text is None and description is None and hazard_type is None:
        return None

    return AviationAlertData(
        alert_id=alert_id,
        designator=_optional_str(record, "seriesId", "series", "designator", "firId", "mwo"),
        issued_at=_optional_str(record, "issueTime", "issue_time"),
        valid_from=_optional_str(record, "validTimeFrom", "validFrom", "valid_from", "startTime"),
        valid_to=_optional_str(record, "validTimeTo", "validTo", "valid_to", "endTime"),
        hazard_type=hazard_type,
        description=description,
        raw_text=raw_text,
        affected_region=_optional_str(record, "region", "firName", "firId", "area"),
        geometry=_sigmet_geometry_from_record(record),
        source=AWC_SOURCE,
    )


def _sigmet_dedupe_key(alert: AviationAlertData) -> str:
    if alert.alert_id:
        return f"id:{alert.alert_id.strip().lower()}"
    if alert.raw_text:
        return f"raw:{alert.raw_text.strip().lower()}"
    return "|".join(
        (
            alert.designator or "",
            alert.valid_from or "",
            alert.valid_to or "",
            alert.hazard_type or "",
            alert.affected_region or "",
        )
    ).strip().lower()


async def fetch_metars(ids: str) -> list[AviationAirportWeatherData]:
    records = await _fetch_with_circuit(
        "metar",
        {"ids": ids, "format": "json"},
        _awc_metar_circuit_breaker,
    )
    metars = [item for item in (_normalise_metar_record(record) for record in records) if item is not None]
    logger.info(
        "AWC normalized METAR summary",
        extra={
            "requested_ids": ids,
            "raw_count": len(records),
            "normalized_count": len(metars),
            "dropped_count": len(records) - len(metars),
        },
    )
    logger.debug(
        "AWC normalized METAR payload",
        extra={"count": len(metars), "sample": metars[0].model_dump(mode="json") if metars else None},
    )
    return metars


async def fetch_tafs(ids: str) -> list[AviationForecastData]:
    records = await _fetch_with_circuit(
        "taf",
        {"ids": ids, "format": "json"},
        _awc_taf_circuit_breaker,
    )
    tafs = [item for item in (_normalise_taf_record(record) for record in records) if item is not None]
    logger.info(
        "AWC normalized TAF summary",
        extra={
            "requested_ids": ids,
            "raw_count": len(records),
            "normalized_count": len(tafs),
            "dropped_count": len(records) - len(tafs),
        },
    )
    logger.debug(
        "AWC normalized TAF payload",
        extra={"count": len(tafs), "sample": tafs[0].model_dump(mode="json") if tafs else None},
    )
    return tafs


async def fetch_sigmets() -> list[AviationAlertData]:
    conus_records = await _fetch_with_circuit(
        "airsigmet",
        {"format": "json"},
        _awc_sigmet_circuit_breaker,
    )
    intl_records = await _fetch_with_circuit(
        "isigmet",
        {"format": "json"},
        _awc_sigmet_circuit_breaker,
    )
    normalised_alerts = [
        item
        for item in (_normalise_sigmet_record(record) for record in [*conus_records, *intl_records])
        if item is not None
    ]
    alerts: list[AviationAlertData] = []
    seen_keys: set[str] = set()
    duplicate_count = 0
    for alert in normalised_alerts:
        dedupe_key = _sigmet_dedupe_key(alert)
        if dedupe_key in seen_keys:
            duplicate_count += 1
            continue
        seen_keys.add(dedupe_key)
        alerts.append(alert)

    logger.info(
        "AWC normalized SIGMET summary",
        extra={
            "conus_raw_count": len(conus_records),
            "intl_raw_count": len(intl_records),
            "raw_count": len(conus_records) + len(intl_records),
            "normalized_count": len(normalised_alerts),
            "duplicate_count": duplicate_count,
            "final_count": len(alerts),
        },
    )
    logger.debug(
        "AWC normalized SIGMET payload",
        extra={"count": len(alerts), "sample": alerts[0].model_dump(mode="json") if alerts else None},
    )
    return alerts
