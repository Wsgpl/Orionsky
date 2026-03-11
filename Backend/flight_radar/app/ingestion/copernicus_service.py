"""
Copernicus CAMS air-quality adapter.

This module owns the air-quality provider domain and does not replace the
Open-Meteo general weather / forecast pipeline.
"""
from __future__ import annotations

import asyncio
import logging
import math
import tempfile
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Sequence

from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError

try:
    import cdsapi
except ModuleNotFoundError:  # pragma: no cover - optional runtime dependency
    cdsapi = None  # type: ignore[assignment]

try:
    from netCDF4 import Dataset
except ModuleNotFoundError:  # pragma: no cover - optional runtime dependency
    Dataset = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)
settings = get_settings()

COPERNICUS_CAMS_SOURCE = "copernicus_cams"
_ANALYSIS_LAG_HOURS = 8
_ANALYSIS_LOOKBACK_CYCLES = 4
_AREA_PADDING_DEGREES = 0.5
_UG_PER_KG = 1_000_000_000.0
_LATITUDE_VARIABLE_CANDIDATES = ("latitude", "lat")
_LONGITUDE_VARIABLE_CANDIDATES = ("longitude", "lon")
_POLLUTANT_VARIABLE_CANDIDATES: dict[str, tuple[str, ...]] = {
    "pm25": ("particulate_matter_2.5um", "pm2p5", "particulate_matter_2p5um"),
    "pm10": ("particulate_matter_10um", "pm10"),
    "ozone": ("total_column_ozone", "gtco3", "tco3"),
    "no2": ("total_column_nitrogen_dioxide", "tcno2"),
    "so2": ("total_column_sulphur_dioxide", "tcso2"),
    "co": ("total_column_carbon_monoxide", "tcco"),
}
_REQUEST_VARIABLES = (
    "particulate_matter_2.5um",
    "particulate_matter_10um",
    "total_column_ozone",
    "total_column_nitrogen_dioxide",
    "total_column_sulphur_dioxide",
    "total_column_carbon_monoxide",
)

_copernicus_cams_circuit_breaker = CircuitBreaker(
    name="copernicus_cams_air_quality",
    failure_threshold=settings.COPERNICUS_CAMS_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.COPERNICUS_CAMS_CB_RECOVERY_TIMEOUT,
)


@dataclass(slots=True, frozen=True)
class CopernicusAirQualityPoint:
    lat: float
    lon: float
    timestamp: str
    pm25: float | None = None
    pm10: float | None = None
    ozone: float | None = None
    no2: float | None = None
    so2: float | None = None
    co: float | None = None
    aqi_category: str | None = None
    source: str = COPERNICUS_CAMS_SOURCE


class AirQualityProviderError(RuntimeError):
    """Raised when Copernicus CAMS cannot provide the requested air-quality grid."""


def get_copernicus_cams_circuit() -> CircuitBreaker:
    return _copernicus_cams_circuit_breaker


def get_copernicus_circuit() -> CircuitBreaker:
    """Backward-compatible alias for CAMS circuit lookups."""
    return get_copernicus_cams_circuit()


def _safe_float_or_none(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _air_quality_cell_key(lat: float, lon: float) -> str:
    return f"{settings.AIR_QUALITY_CACHE_NAMESPACE}:{int(lat)}:{int(lon)}"


def _candidate_analysis_times(now: datetime | None = None) -> list[datetime]:
    current = (now or datetime.now(timezone.utc)) - timedelta(hours=_ANALYSIS_LAG_HOURS)
    current = current.replace(minute=0, second=0, microsecond=0)
    floored_hour = (current.hour // 6) * 6
    cycle = current.replace(hour=floored_hour)
    return [cycle - timedelta(hours=6 * offset) for offset in range(_ANALYSIS_LOOKBACK_CYCLES)]


def _request_area() -> list[str]:
    north = min(90.0, settings.AIRSPACE_MAX_LAT + _AREA_PADDING_DEGREES)
    west = max(-180.0, settings.AIRSPACE_MIN_LON - _AREA_PADDING_DEGREES)
    south = max(-90.0, settings.AIRSPACE_MIN_LAT - _AREA_PADDING_DEGREES)
    east = min(180.0, settings.AIRSPACE_MAX_LON + _AREA_PADDING_DEGREES)
    return [f"{north:.2f}", f"{west:.2f}", f"{south:.2f}", f"{east:.2f}"]


def _build_request(cycle: datetime) -> dict[str, Any]:
    return {
        "date": cycle.strftime("%Y-%m-%d"),
        "time": cycle.strftime("%H:00"),
        "type": "analysis",
        "leadtime_hour": "0",
        "variable": list(_REQUEST_VARIABLES),
        "format": "netcdf_zip",
        "area": _request_area(),
    }


def _build_client():
    if cdsapi is None:
        raise RuntimeError("cdsapi is not installed")

    kwargs: dict[str, Any] = {
        "url": settings.COPERNICUS_CAMS_ADS_URL,
        "quiet": True,
        "progress": False,
        "timeout": settings.COPERNICUS_CAMS_TIMEOUT,
    }
    if settings.COPERNICUS_CAMS_ADS_KEY:
        kwargs["key"] = settings.COPERNICUS_CAMS_ADS_KEY
    return cdsapi.Client(**kwargs)


def _extract_zip_member(zip_path: Path, output_dir: Path) -> Path:
    with zipfile.ZipFile(zip_path) as archive:
        members = [name for name in archive.namelist() if name.lower().endswith((".nc", ".nc4"))]
        if not members:
            raise ValueError("Copernicus CAMS response did not contain a NetCDF payload")
        member = members[0]
        archive.extract(member, path=output_dir)
    return output_dir / member


def _read_variable_names(dataset: Any) -> tuple[str, ...]:
    return tuple(str(name) for name in getattr(dataset, "variables", {}).keys())


def _find_variable(dataset: Any, candidates: Sequence[str], *, required: bool) -> Any | None:
    variables = getattr(dataset, "variables", {})
    for candidate in candidates:
        if candidate in variables:
            return variables[candidate]

    lower_lookup = {str(name).lower(): name for name in _read_variable_names(dataset)}
    for candidate in candidates:
        matched_name = lower_lookup.get(candidate.lower())
        if matched_name:
            return variables[matched_name]

    if required:
        raise ValueError(f"Unable to locate NetCDF variable from candidates: {candidates}")
    return None


def _normalise_coordinate_values(variable: Any) -> list[float]:
    values = variable[:]
    if hasattr(values, "filled"):
        values = values.filled(float("nan"))

    result: list[float] = []
    for value in values.tolist():
        number = _safe_float_or_none(value)
        if number is None:
            raise ValueError(f"Invalid CAMS coordinate value: {value!r}")
        result.append(number)
    return result


def _select_2d_grid(variable: Any) -> Any:
    values = variable[:]
    if hasattr(values, "filled"):
        values = values.filled(float("nan"))

    dimensions = getattr(values, "ndim", 0)
    while dimensions > 2:
        values = values[0]
        dimensions = getattr(values, "ndim", 0)

    if dimensions != 2:
        raise ValueError("Unexpected CAMS pollutant grid dimensions")
    return values


def _nearest_index(values: Sequence[float], target: float) -> int:
    return min(range(len(values)), key=lambda index: abs(values[index] - target))


def _extract_grid_value(grid: Any, row: int, column: int) -> float | None:
    value = grid[row][column]
    if hasattr(value, "filled"):
        value = value.filled(float("nan"))
    return _safe_float_or_none(value)


def _kg_m3_to_ug_m3(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.0, value * _UG_PER_KG)


def _map_points_to_air_quality(
    points: Sequence[tuple[float, float]],
    latitudes: Sequence[float],
    longitudes: Sequence[float],
    pollutant_grids: dict[str, Any | None],
    cycle: datetime,
) -> dict[str, CopernicusAirQualityPoint]:
    mapped: dict[str, CopernicusAirQualityPoint] = {}
    if not latitudes or not longitudes:
        return mapped

    timestamp = cycle.isoformat()
    for lat, lon in points:
        row = _nearest_index(latitudes, lat)
        column = _nearest_index(longitudes, lon)

        raw_pm25 = _extract_grid_value(pollutant_grids["pm25"], row, column) if pollutant_grids["pm25"] is not None else None
        raw_pm10 = _extract_grid_value(pollutant_grids["pm10"], row, column) if pollutant_grids["pm10"] is not None else None
        ozone = (
            _extract_grid_value(pollutant_grids["ozone"], row, column)
            if pollutant_grids["ozone"] is not None
            else None
        )
        no2 = _extract_grid_value(pollutant_grids["no2"], row, column) if pollutant_grids["no2"] is not None else None
        so2 = _extract_grid_value(pollutant_grids["so2"], row, column) if pollutant_grids["so2"] is not None else None
        co = _extract_grid_value(pollutant_grids["co"], row, column) if pollutant_grids["co"] is not None else None

        point = CopernicusAirQualityPoint(
            lat=lat,
            lon=lon,
            timestamp=timestamp,
            pm25=_kg_m3_to_ug_m3(raw_pm25),
            pm10=_kg_m3_to_ug_m3(raw_pm10),
            ozone=ozone,
            no2=no2,
            so2=so2,
            co=co,
        )
        if all(
            value is None
            for value in (point.pm25, point.pm10, point.ozone, point.no2, point.so2, point.co)
        ):
            continue
        mapped[_air_quality_cell_key(lat, lon)] = point

    return mapped


def _download_air_quality_grid(points: Sequence[tuple[float, float]]) -> dict[str, CopernicusAirQualityPoint]:
    if Dataset is None:
        raise RuntimeError("netCDF4 is not installed")

    client = _build_client()
    last_error: Exception | None = None

    with tempfile.TemporaryDirectory(prefix="copernicus_air_quality_") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        for cycle in _candidate_analysis_times():
            target = temp_dir / f"cams_{cycle.strftime('%Y%m%d%H')}.zip"
            request_payload = _build_request(cycle)
            logger.info(
                "Copernicus CAMS provider request",
                extra={
                    "dataset": settings.COPERNICUS_CAMS_DATASET,
                    "cycle": cycle.isoformat(),
                    "variable_count": len(request_payload["variable"]),
                    "area": request_payload["area"],
                },
            )
            try:
                client.retrieve(settings.COPERNICUS_CAMS_DATASET, request_payload, str(target))
                dataset_path = _extract_zip_member(target, temp_dir)
                with Dataset(str(dataset_path)) as dataset:
                    available_variables = _read_variable_names(dataset)
                    logger.info(
                        "Copernicus CAMS provider response",
                        extra={
                            "dataset": settings.COPERNICUS_CAMS_DATASET,
                            "cycle": cycle.isoformat(),
                            "variable_count": len(available_variables),
                            "sample_variables": available_variables[:12],
                        },
                    )

                    latitudes = _normalise_coordinate_values(
                        _find_variable(dataset, _LATITUDE_VARIABLE_CANDIDATES, required=True)
                    )
                    longitudes = _normalise_coordinate_values(
                        _find_variable(dataset, _LONGITUDE_VARIABLE_CANDIDATES, required=True)
                    )

                    pollutant_grids: dict[str, Any | None] = {}
                    missing_fields: list[str] = []
                    for field, candidates in _POLLUTANT_VARIABLE_CANDIDATES.items():
                        variable = _find_variable(dataset, candidates, required=False)
                        if variable is None:
                            missing_fields.append(field)
                            pollutant_grids[field] = None
                            continue
                        pollutant_grids[field] = _select_2d_grid(variable)

                    if all(grid is None for grid in pollutant_grids.values()):
                        raise ValueError("CAMS response did not include any requested pollutant variables")

                    mapped = _map_points_to_air_quality(points, latitudes, longitudes, pollutant_grids, cycle)
                    logger.info(
                        "Copernicus CAMS normalized payload",
                        extra={
                            "cycle": cycle.isoformat(),
                            "mapped_count": len(mapped),
                            "missing_fields": missing_fields,
                            "sample": asdict(next(iter(mapped.values()))) if mapped else None,
                        },
                    )
                    return mapped
            except Exception as exc:  # pragma: no cover - network/runtime integration path
                last_error = exc
                logger.warning(
                    "Copernicus CAMS fetch failed for cycle",
                    extra={"cycle": cycle.isoformat(), "error": str(exc)},
                )

    if last_error is not None:
        raise last_error
    return {}


def _make_retry(points: Sequence[tuple[float, float]]):
    @retry(
        retry=retry_if_exception_type(Exception),
        stop=stop_after_attempt(settings.COPERNICUS_CAMS_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.COPERNICUS_CAMS_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> dict[str, CopernicusAirQualityPoint]:
        return await asyncio.to_thread(_download_air_quality_grid, tuple(points))

    return _inner


async def fetch_air_quality_grid(
    points: Sequence[tuple[float, float]],
) -> dict[str, CopernicusAirQualityPoint]:
    if not settings.COPERNICUS_CAMS_ENABLED:
        return {}
    if not points:
        return {}

    try:
        return await _copernicus_cams_circuit_breaker.call(_make_retry(points))
    except CircuitBreakerError as exc:
        logger.warning("Copernicus CAMS circuit open", extra={"error": str(exc)})
        raise AirQualityProviderError("Copernicus CAMS circuit open") from exc
    except Exception as exc:  # pragma: no cover - external integration path
        logger.error("Copernicus CAMS request failed", extra={"error": str(exc)})
        raise AirQualityProviderError("Copernicus CAMS request failed") from exc
