"""Schemas for mission export endpoints."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, model_validator

from app.schemas.mission_geometry import MissionGeometry
from app.schemas.mission import MissionDefinition, MissionExportModel


class MissionExportRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mission: MissionExportModel | None = None
    geometry: MissionGeometry | None = None

    @model_validator(mode="after")
    def _validate_mission_or_geometry(self) -> "MissionExportRequest":
        _ = self.normalized_geometry
        return self

    @property
    def normalized_mission(self) -> MissionDefinition:
        if self.mission is not None:
            return MissionDefinition.model_validate(self.mission.model_dump(mode="python"))

        if self.geometry is None:
            raise ValueError("Provide mission or geometry for export")

        return MissionDefinition(geometry=self.geometry)

    @property
    def normalized_geometry(self) -> MissionGeometry:
        return self.normalized_mission.geometry


class MissionExportKmlRequest(MissionExportRequest):
    pass


class MissionExportTxtRequest(MissionExportRequest):
    pass
