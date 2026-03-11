"""Normalized mission geometry schemas shared across planning, analysis, and export."""
from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


def _coordinates_equal(a: "MissionGeometryCoordinate", b: "MissionGeometryCoordinate") -> bool:
    return abs(a.lat - b.lat) < 1e-6 and abs(a.lon - b.lon) < 1e-6


def _dedupe_consecutive_coordinates(
    coordinates: list["MissionGeometryCoordinate"],
) -> list["MissionGeometryCoordinate"]:
    deduped: list[MissionGeometryCoordinate] = []
    for coordinate in coordinates:
        if not deduped or not _coordinates_equal(deduped[-1], coordinate):
            deduped.append(coordinate)
    return deduped


class MissionGeometryCoordinate(BaseModel):
    lat: float = Field(
        ...,
        ge=-90,
        le=90,
        validation_alias=AliasChoices("lat", "latitude"),
        serialization_alias="lat",
    )
    lon: float = Field(
        ...,
        ge=-180,
        le=180,
        validation_alias=AliasChoices("lon", "longitude"),
        serialization_alias="lon",
    )
    alt: float | None = Field(default=None)


class MissionGeometryBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    metadata: dict[str, Any] | None = None


class MissionLineStringGeometry(MissionGeometryBase):
    type: Literal["LineString"] = "LineString"
    coordinates: list[MissionGeometryCoordinate] = Field(..., min_length=2)

    @model_validator(mode="after")
    def _normalize_coordinates(self) -> "MissionLineStringGeometry":
        self.coordinates = _dedupe_consecutive_coordinates(self.coordinates)
        if len(self.coordinates) < 2:
            raise ValueError("LineString geometry must contain at least two distinct coordinates")
        return self


class MissionPolygonGeometry(MissionGeometryBase):
    type: Literal["Polygon"] = "Polygon"
    coordinates: list[MissionGeometryCoordinate] = Field(..., min_length=3)

    @model_validator(mode="after")
    def _normalize_coordinates(self) -> "MissionPolygonGeometry":
        normalized = _dedupe_consecutive_coordinates(self.coordinates)
        if len(normalized) < 3:
            raise ValueError("Polygon geometry must contain at least three distinct coordinates")
        if not _coordinates_equal(normalized[0], normalized[-1]):
            first = normalized[0]
            normalized.append(
                MissionGeometryCoordinate(lat=first.lat, lon=first.lon, alt=first.alt)
            )
        self.coordinates = normalized
        if len(self.coordinates) < 4:
            raise ValueError("Polygon geometry must contain a closed coordinate ring")
        return self


MissionGeometry = Annotated[
    MissionLineStringGeometry | MissionPolygonGeometry,
    Field(discriminator="type"),
]
