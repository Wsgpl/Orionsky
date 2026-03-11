"""Schemas for route-based aviation risk analysis."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.aviation_risk import (
    AviationRiskAirportContext,
    AviationRiskCategory,
    AviationRiskItem,
    AviationRiskLevel,
)
from app.schemas.mission_geometry import (
    MissionGeometry,
    MissionGeometryCoordinate,
    MissionLineStringGeometry,
)
from app.schemas.mission import MissionDefinition, MissionRouteAnalysisModel

RouteRiskCoordinate = MissionGeometryCoordinate


class RouteRiskAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    mission: MissionRouteAnalysisModel | None = None
    geometry: MissionGeometry | None = None
    route: list[RouteRiskCoordinate] | None = Field(default=None, min_length=2)
    route_coordinates: list[RouteRiskCoordinate] | None = Field(default=None, min_length=2)
    sample_spacing_km: float = Field(default=25.0, gt=0, le=500)

    @model_validator(mode="after")
    def _validate_route(self) -> "RouteRiskAnalyzeRequest":
        if len(self.normalized_route) < 2:
            raise ValueError("Route must contain at least two coordinates")
        return self

    @property
    def normalized_mission(self) -> MissionDefinition:
        if self.mission is not None:
            return MissionDefinition.model_validate(self.mission.model_dump(mode="python"))

        if isinstance(self.geometry, MissionLineStringGeometry):
            return MissionDefinition(geometry=self.geometry)

        if self.geometry is not None:
            raise ValueError("Route risk analysis requires LineString geometry")

        coordinates = self.route if self.route is not None else self.route_coordinates or []
        if not coordinates:
            raise ValueError("Provide mission, geometry, route, or route_coordinates with at least two coordinates")
        return MissionDefinition(
            geometry=MissionLineStringGeometry(name=None, coordinates=coordinates),
        )

    @property
    def normalized_geometry(self) -> MissionLineStringGeometry:
        geometry = self.normalized_mission.geometry
        if not isinstance(geometry, MissionLineStringGeometry):
            raise ValueError("Route risk analysis requires LineString geometry")
        return geometry

    @property
    def normalized_route(self) -> list[RouteRiskCoordinate]:
        return self.normalized_geometry.coordinates


class RouteRiskPointAssessment(BaseModel):
    sample_index: int = Field(..., ge=0)
    coordinate: RouteRiskCoordinate
    distance_from_start_km: float = Field(..., ge=0)
    is_route_vertex: bool = False
    nearest_airport: AviationRiskAirportContext | None = None
    overall_level: AviationRiskLevel | None = None
    score: float | None = Field(default=None, ge=1, le=3)
    factor_count: int = Field(default=0, ge=0)
    skipped_categories: list[AviationRiskCategory] = Field(default_factory=list)
    factors: list[AviationRiskItem] = Field(default_factory=list)
    explanation: str = Field(..., min_length=1)


class RouteRiskSegmentAssessment(BaseModel):
    segment_index: int = Field(..., ge=0)
    start_sample_index: int = Field(..., ge=0)
    end_sample_index: int = Field(..., ge=0)
    start: RouteRiskCoordinate
    end: RouteRiskCoordinate
    distance_km: float = Field(..., ge=0)
    overall_level: AviationRiskLevel | None = None
    score: float | None = Field(default=None, ge=1, le=3)
    factor_count: int = Field(default=0, ge=0)
    skipped_categories: list[AviationRiskCategory] = Field(default_factory=list)
    factors: list[AviationRiskItem] = Field(default_factory=list)
    explanation: str = Field(..., min_length=1)


class RouteRiskResponse(BaseModel):
    route_summary: str = Field(..., min_length=1)
    total_distance_km: float = Field(..., ge=0)
    route_point_count: int = Field(..., ge=2)
    requested_sample_spacing_km: float = Field(..., gt=0)
    sample_spacing_km: float = Field(..., gt=0)
    sampling_adjusted: bool = False
    sample_point_count: int = Field(..., ge=2)
    sample_points: list[RouteRiskPointAssessment] = Field(default_factory=list)
    segment_count: int = Field(default=0, ge=0)
    segments: list[RouteRiskSegmentAssessment] = Field(default_factory=list)
    worst_sections: list[RouteRiskSegmentAssessment] = Field(default_factory=list)
    overall_score: float | None = Field(default=None, ge=1, le=3)
    overall_level: AviationRiskLevel | None = None
    factor_count: int = Field(default=0, ge=0)
    factors: list[AviationRiskItem] = Field(default_factory=list)
    skipped_categories: list[AviationRiskCategory] = Field(default_factory=list)
    unavailable_categories: list[AviationRiskCategory] = Field(default_factory=list)
    explanation: str = Field(..., min_length=1)
