"""Disaster context schemas owned by the Copernicus CEMS provider domain."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DisasterGeometry(BaseModel):
    encoding: Literal["wkt"] = "wkt"
    wkt: str = Field(..., min_length=1)
    kind: str | None = None


class DisasterArea(BaseModel):
    name: str | None = None
    geometry: DisasterGeometry | None = None
    is_real_extent: bool | None = None
    area_sq_km: float | None = Field(default=None, ge=0)


class DisasterLinks(BaseModel):
    report: str | None = None
    viewer: str | None = None
    story_map: str | None = None
    dashboard: str | None = None
    products_download: str | None = None
    geodata_download: str | None = None
    reporting_download: str | None = None
    ancillary_products_download: str | None = None
    raster_data_download: str | None = None


class DisasterContextData(BaseModel):
    event_id: str = Field(..., min_length=1)
    event_type: str | None = None
    event_subtype: str | None = None
    drm_phase: str | None = None
    title: str | None = None
    description: str | None = None
    severity_indicator: str | None = None
    event_time: str | None = None
    issued_at: str | None = None
    updated_at: str | None = None
    valid_from: str | None = None
    valid_to: str | None = None
    continent: str | None = None
    country_names: list[str] = Field(default_factory=list)
    area_names: list[str] = Field(default_factory=list)
    geometry: DisasterGeometry | None = None
    areas: list[DisasterArea] = Field(default_factory=list)
    links: DisasterLinks | None = None
    closed: bool | None = None
    source: str = Field(..., min_length=1)


class DisasterContextResponse(BaseModel):
    source: str = Field(..., min_length=1)
    count: int
    events: list[DisasterContextData]
