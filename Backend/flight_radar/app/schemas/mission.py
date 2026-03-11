"""Mission metadata and wrapper schemas shared across planning, analysis, and export."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.mission_geometry import MissionGeometry, MissionLineStringGeometry


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


class MissionMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mission_id: str | None = None
    name: str | None = None
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    attributes: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _normalize_metadata(self) -> "MissionMetadata":
        self.name = _normalize_text(self.name)
        self.description = _normalize_text(self.description)

        normalized_tags: list[str] = []
        seen: set[str] = set()
        for tag in self.tags:
            cleaned = _normalize_text(tag)
            if cleaned is None:
                continue
            lowered = cleaned.lower()
            if lowered in seen:
                continue
            seen.add(lowered)
            normalized_tags.append(cleaned)
        self.tags = normalized_tags
        return self


class MissionGeometryWrapper(BaseModel):
    model_config = ConfigDict(extra="ignore")

    metadata: MissionMetadata = Field(default_factory=MissionMetadata)
    geometry: MissionGeometry

    @model_validator(mode="after")
    def _synchronize_metadata_and_geometry(self) -> "MissionGeometryWrapper":
        metadata_name = _normalize_text(self.metadata.name)
        geometry_name = _normalize_text(self.geometry.name)

        if metadata_name is None and geometry_name is not None:
            self.metadata.name = geometry_name
        elif metadata_name is not None and geometry_name is None:
            self.geometry = self.geometry.model_copy(update={"name": metadata_name})
        elif metadata_name is not None and geometry_name is not None and metadata_name != geometry_name:
            self.geometry = self.geometry.model_copy(update={"name": metadata_name})

        return self


class MissionDefinition(MissionGeometryWrapper):
    """Normalized mission payload ready for future save/load workflows."""


class MissionExportModel(MissionGeometryWrapper):
    """Mission wrapper consumed by export endpoints."""


class MissionRouteAnalysisModel(MissionGeometryWrapper):
    """Mission wrapper consumed by route-analysis endpoints."""

    geometry: MissionLineStringGeometry
