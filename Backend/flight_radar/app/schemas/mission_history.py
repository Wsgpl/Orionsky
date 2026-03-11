"""Schemas for per-user saved mission history."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.mission import MissionDefinition


class MissionHistorySaveRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mission: MissionDefinition
    sample_spacing_km: float | None = Field(default=None, gt=0, le=500)

    @model_validator(mode="after")
    def _validate_mission_name(self) -> "MissionHistorySaveRequest":
        mission_name = (self.mission.metadata.name or self.mission.geometry.name or "").strip()
        if not mission_name:
            raise ValueError("Mission name is required to save history")
        return self


class MissionHistoryItem(BaseModel):
    mission_id: str = Field(..., min_length=1)
    mission_name: str = Field(..., min_length=1)
    geometry_type: Literal["LineString", "Polygon"]
    coordinate_count: int = Field(..., ge=2)
    sample_spacing_km: float | None = Field(default=None, gt=0, le=500)
    saved_at: datetime
    updated_at: datetime
    mission: MissionDefinition


class MissionHistoryListResponse(BaseModel):
    count: int = Field(..., ge=0)
    missions: list[MissionHistoryItem] = Field(default_factory=list)
