"""Copernicus CEMS disaster-context adapter."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.ingestion.circuit_breaker import CircuitBreaker, CircuitBreakerError
from app.schemas.disaster import (
    DisasterArea,
    DisasterContextData,
    DisasterGeometry,
    DisasterLinks,
)

logger = logging.getLogger(__name__)
settings = get_settings()

COPERNICUS_CEMS_SOURCE = "copernicus_cems"
_RAPID_MAPPING_FEED = "rapid_mapping"
_RISK_RECOVERY_FEED = "risk_recovery"

_copernicus_cems_circuit_breaker = CircuitBreaker(
    name="copernicus_cems_disaster_context",
    failure_threshold=settings.COPERNICUS_CEMS_CB_FAILURE_THRESHOLD,
    recovery_timeout=settings.COPERNICUS_CEMS_CB_RECOVERY_TIMEOUT,
)


class DisasterProviderError(RuntimeError):
    """Raised when Copernicus CEMS cannot provide disaster context data."""


def get_copernicus_cems_circuit() -> CircuitBreaker:
    return _copernicus_cems_circuit_breaker


def _cems_headers() -> dict[str, str]:
    return {"User-Agent": f"{settings.APP_NAME}/{settings.APP_VERSION} (+Copernicus CEMS backend integration)"}


def _non_empty_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_str(record: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        if key in record:
            text = _non_empty_str(record.get(key))
            if text is not None:
                return text
    return None


def _optional_bool(record: dict[str, Any], *keys: str) -> bool | None:
    for key in keys:
        value = record.get(key)
        if value is None or value == "":
            continue
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"true", "1", "yes"}:
            return True
        if text in {"false", "0", "no"}:
            return False
    return None


def _optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    for value in values:
        if value and value not in deduped:
            deduped.append(value)
    return deduped


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        raise ValueError("CEMS payload was not a JSON object or list")

    if isinstance(payload.get("results"), list):
        return [item for item in payload["results"] if isinstance(item, dict)]
    if isinstance(payload.get("data"), list):
        return [item for item in payload["data"] if isinstance(item, dict)]
    return []


def _geometry_from_wkt(value: Any, *, kind: str | None = None) -> DisasterGeometry | None:
    wkt = _non_empty_str(value)
    if wkt is None:
        return None
    upper = wkt.upper()
    if "(" not in upper or not upper.split("(", 1)[0].strip():
        return None
    return DisasterGeometry(wkt=wkt, kind=kind)


def _country_names(record: dict[str, Any]) -> list[str]:
    values = record.get("countries")
    names: list[str] = []
    if isinstance(values, list):
        for item in values:
            if isinstance(item, dict):
                name = _non_empty_str(item.get("name"))
            else:
                name = _non_empty_str(item)
            if name is not None:
                names.append(name)
    elif isinstance(values, str):
        names.append(values.strip())
    return _dedupe_strings(names)


def _normalise_area_record(record: dict[str, Any]) -> DisasterArea | None:
    name = _optional_str(record, "name", "aoiName")
    geometry = _geometry_from_wkt(record.get("extent"), kind="area_extent")
    area_sq_km = _optional_float(record.get("sqkm"))
    is_real_extent = _optional_bool(record, "isRealExtent")
    if name is None and geometry is None and area_sq_km is None and is_real_extent is None:
        return None
    return DisasterArea(
        name=name,
        geometry=geometry,
        area_sq_km=area_sq_km,
        is_real_extent=is_real_extent,
    )


def _collect_areas(record: dict[str, Any]) -> list[DisasterArea]:
    raw_areas: list[dict[str, Any]] = []
    for key in ("aois", "linkedAois"):
        values = record.get(key)
        if isinstance(values, list):
            raw_areas.extend(item for item in values if isinstance(item, dict))

    products = record.get("products")
    if isinstance(products, list):
        for product in products:
            if not isinstance(product, dict):
                continue
            linked_aois = product.get("linkedAois")
            if isinstance(linked_aois, list):
                raw_areas.extend(item for item in linked_aois if isinstance(item, dict))

    areas: list[DisasterArea] = []
    seen: set[tuple[str | None, str | None]] = set()
    for raw_area in raw_areas:
        area = _normalise_area_record(raw_area)
        if area is None:
            continue
        signature = (area.name, area.geometry.wkt if area.geometry is not None else None)
        if signature in seen:
            continue
        seen.add(signature)
        areas.append(area)
    return areas


def _normalise_links(record: dict[str, Any]) -> DisasterLinks | None:
    links = DisasterLinks(
        report=_optional_str(record, "reportLink"),
        viewer=_optional_str(record, "viewerUrl"),
        story_map=_optional_str(record, "storyMapUrl"),
        dashboard=_optional_str(record, "dashboardUrl"),
        products_download=_optional_str(record, "productsPath", "mapsDownload"),
        geodata_download=_optional_str(record, "geodataDownload"),
        reporting_download=_optional_str(record, "reportingDownload"),
        ancillary_products_download=_optional_str(record, "ancillaryProductsDownload"),
        raster_data_download=_optional_str(record, "rasterDataDownload"),
    )
    if all(
        value is None
        for value in (
            links.report,
            links.viewer,
            links.story_map,
            links.dashboard,
            links.products_download,
            links.geodata_download,
            links.reporting_download,
            links.ancillary_products_download,
            links.raster_data_download,
        )
    ):
        return None
    return links


def _event_type_fields(record: dict[str, Any]) -> tuple[str | None, str | None]:
    category = record.get("category")
    event_type: str | None = None
    if isinstance(category, dict):
        event_type = _non_empty_str(category.get("name")) or _non_empty_str(category.get("slug"))
    else:
        event_type = _non_empty_str(category)

    event_subtype = _optional_str(record, "subCategory", "subcategory")
    if event_subtype is None and isinstance(category, dict):
        slug = _non_empty_str(category.get("slug"))
        if slug is not None and slug != event_type:
            event_subtype = slug
    return event_type, event_subtype


def _normalise_disaster_record(record: dict[str, Any], *, feed: str) -> DisasterContextData | None:
    event_id = _optional_str(record, "code", "activationCode", "event_id")
    if event_id is None:
        logger.warning(
            "Skipping malformed CEMS activation without identifier",
            extra={"feed": feed, "sample": record},
        )
        return None

    event_type, event_subtype = _event_type_fields(record)
    areas = _collect_areas(record)
    area_names = _dedupe_strings([area.name for area in areas if area.name is not None])
    geometry = _geometry_from_wkt(record.get("extent"), kind="event_extent")
    if geometry is None:
        geometry = _geometry_from_wkt(record.get("centroid"), kind="centroid")

    return DisasterContextData(
        event_id=event_id,
        event_type=event_type,
        event_subtype=event_subtype,
        drm_phase=_optional_str(record, "drmPhase", "actDrmPhase"),
        title=_optional_str(record, "name", "title"),
        description=_optional_str(record, "reason", "description"),
        severity_indicator=_optional_str(record, "severity", "severityIndicator"),
        event_time=_optional_str(record, "eventTime"),
        issued_at=_optional_str(record, "activationTime"),
        updated_at=_optional_str(record, "lastUpdate", "last_update"),
        valid_from=_optional_str(record, "validFrom"),
        valid_to=_optional_str(record, "validTo"),
        continent=_optional_str(record, "continent"),
        country_names=_country_names(record),
        area_names=area_names,
        geometry=geometry,
        areas=areas,
        links=_normalise_links(record),
        closed=_optional_bool(record, "closed"),
        source=COPERNICUS_CEMS_SOURCE,
    )


def _event_score(event: DisasterContextData) -> int:
    score = 0
    for value in (
        event.event_type,
        event.event_subtype,
        event.title,
        event.description,
        event.severity_indicator,
        event.event_time,
        event.issued_at,
        event.updated_at,
        event.valid_from,
        event.valid_to,
        event.continent,
    ):
        if value is not None:
            score += 1
    score += len(event.country_names)
    score += len(event.area_names)
    score += len(event.areas)
    if event.geometry is not None:
        score += 2
    if event.links is not None:
        score += 1
    if event.closed is not None:
        score += 1
    return score


def _sort_key(event: DisasterContextData) -> tuple[str, str]:
    return (
        event.updated_at or event.issued_at or event.event_time or "",
        event.event_id,
    )


async def _request_records(
    *,
    url: str,
    params: dict[str, Any],
    feed: str,
) -> list[dict[str, Any]]:
    logger.info("Copernicus CEMS provider request", extra={"feed": feed, "url": url, "params": params})
    async with httpx.AsyncClient(timeout=settings.COPERNICUS_CEMS_TIMEOUT, headers=_cems_headers()) as client:
        response = await client.get(url, params=params)

    response.raise_for_status()
    payload = response.json()
    records = _extract_records(payload)
    logger.info(
        "Copernicus CEMS provider response",
        extra={"feed": feed, "url": url, "status_code": response.status_code, "record_count": len(records)},
    )
    logger.debug(
        "Copernicus CEMS provider response payload",
        extra={"feed": feed, "url": url, "sample_record": records[0] if records else None},
    )
    return records


def _make_retry(*, url: str, params: dict[str, Any], feed: str):
    @retry(
        retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
        stop=stop_after_attempt(settings.COPERNICUS_CEMS_MAX_RETRIES),
        wait=wait_exponential(multiplier=settings.COPERNICUS_CEMS_BACKOFF_FACTOR, min=1, max=30),
        reraise=True,
    )
    async def _inner() -> list[dict[str, Any]]:
        return await _request_records(url=url, params=params, feed=feed)

    return _inner


async def _fetch_feed_records(*, url: str, params: dict[str, Any], feed: str) -> list[dict[str, Any]]:
    return await _make_retry(url=url, params=params, feed=feed)()


async def _download_disaster_contexts(limit: int) -> list[DisasterContextData]:
    params = {"limit": limit}
    rapid_records, risk_recovery_records = await asyncio.gather(
        _fetch_feed_records(
            url=settings.COPERNICUS_CEMS_RAPID_MAPPING_URL,
            params=params,
            feed=_RAPID_MAPPING_FEED,
        ),
        _fetch_feed_records(
            url=settings.COPERNICUS_CEMS_RISK_RECOVERY_URL,
            params=params,
            feed=_RISK_RECOVERY_FEED,
        ),
    )

    events_by_id: dict[str, DisasterContextData] = {}
    for feed, records in (
        (_RAPID_MAPPING_FEED, rapid_records),
        (_RISK_RECOVERY_FEED, risk_recovery_records),
    ):
        normalised_count = 0
        normalised_events: list[DisasterContextData] = []
        for record in records:
            event = _normalise_disaster_record(record, feed=feed)
            if event is None:
                continue
            normalised_count += 1
            normalised_events.append(event)
            existing = events_by_id.get(event.event_id)
            if existing is None or _event_score(event) > _event_score(existing):
                events_by_id[event.event_id] = event
        logger.info(
            "Copernicus CEMS normalized payload",
            extra={
                "feed": feed,
                "record_count": len(records),
                "normalized_count": normalised_count,
                "sample": normalised_events[0].model_dump(mode="json") if normalised_events else None,
            },
        )

    return sorted(events_by_id.values(), key=_sort_key, reverse=True)


async def fetch_disaster_contexts(limit: int | None = None) -> list[DisasterContextData]:
    if not settings.COPERNICUS_CEMS_ENABLED:
        return []

    page_limit = limit or settings.COPERNICUS_CEMS_PAGE_LIMIT
    try:
        return await _copernicus_cems_circuit_breaker.call(_download_disaster_contexts, page_limit)
    except CircuitBreakerError as exc:
        logger.warning("Copernicus CEMS circuit open", extra={"error": str(exc)})
        raise DisasterProviderError("Copernicus CEMS circuit open") from exc
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        logger.error("Copernicus CEMS request failed", extra={"error": str(exc)})
        raise DisasterProviderError("Copernicus CEMS request failed") from exc
    except Exception as exc:  # pragma: no cover - external integration path
        logger.error("Copernicus CEMS normalization failed", extra={"error": str(exc)})
        raise DisasterProviderError("Copernicus CEMS normalization failed") from exc
