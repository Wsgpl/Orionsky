"""Unit tests for normalized mission geometry schemas."""
from pydantic import ValidationError

from app.schemas.mission import MissionDefinition
from app.schemas.mission_export import MissionExportKmlRequest
from app.schemas.mission_geometry import MissionLineStringGeometry, MissionPolygonGeometry
from app.schemas.route_risk import RouteRiskAnalyzeRequest


def test_linestring_geometry_dedupes_consecutive_duplicate_coordinates():
    geometry = MissionLineStringGeometry(
        name="Test route",
        coordinates=[
            {"lat": 28.0, "lon": 77.0},
            {"lat": 28.0, "lon": 77.0},
            {"lat": 29.0, "lon": 78.0},
        ],
    )

    assert geometry.type == "LineString"
    assert len(geometry.coordinates) == 2


def test_polygon_geometry_is_closed_when_last_coordinate_is_missing():
    geometry = MissionPolygonGeometry(
        name="Footprint",
        coordinates=[
            {"lat": 28.0, "lon": 77.0},
            {"lat": 28.5, "lon": 77.5},
            {"lat": 28.0, "lon": 78.0},
        ],
    )

    assert geometry.type == "Polygon"
    assert len(geometry.coordinates) == 4
    assert geometry.coordinates[0].lat == geometry.coordinates[-1].lat
    assert geometry.coordinates[0].lon == geometry.coordinates[-1].lon


def test_route_risk_request_accepts_normalized_linestring_geometry():
    request = RouteRiskAnalyzeRequest(
        geometry={
            "name": "Northern sector route",
            "type": "LineString",
            "coordinates": [
                {"lat": 34.0837, "lon": 74.7973},
                {"lat": 33.7782, "lon": 76.5762},
                {"lat": 31.1048, "lon": 77.1734},
            ],
        },
        sample_spacing_km=25,
    )

    assert request.normalized_geometry.type == "LineString"
    assert len(request.normalized_route) == 3


def test_mission_definition_syncs_metadata_name_into_geometry():
    mission = MissionDefinition(
        metadata={
            "name": "Northern corridor",
            "tags": ["dispatch", "dispatch", "  weather  "],
        },
        geometry={
            "type": "LineString",
            "coordinates": [
                {"lat": 34.0837, "lon": 74.7973},
                {"lat": 33.7782, "lon": 76.5762},
            ],
        },
    )

    assert mission.metadata.name == "Northern corridor"
    assert mission.geometry.name == "Northern corridor"
    assert mission.metadata.tags == ["dispatch", "weather"]


def test_mission_export_request_accepts_mission_wrapper():
    request = MissionExportKmlRequest(
        mission={
            "metadata": {
                "name": "Export ready route",
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    {"lat": 34.0837, "lon": 74.7973},
                    {"lat": 33.7782, "lon": 76.5762},
                ],
            },
        }
    )

    assert request.normalized_mission.metadata.name == "Export ready route"
    assert request.normalized_geometry.name == "Export ready route"


def test_route_risk_request_accepts_mission_wrapper():
    request = RouteRiskAnalyzeRequest(
        mission={
            "metadata": {
                "name": "Northern sector route",
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    {"lat": 34.0837, "lon": 74.7973},
                    {"lat": 33.7782, "lon": 76.5762},
                    {"lat": 31.1048, "lon": 77.1734},
                ],
            },
        },
        sample_spacing_km=25,
    )

    assert request.normalized_mission.metadata.name == "Northern sector route"
    assert request.normalized_geometry.name == "Northern sector route"
    assert len(request.normalized_route) == 3


def test_route_risk_request_rejects_polygon_geometry():
    try:
        RouteRiskAnalyzeRequest(
            geometry={
                "name": "Restricted area",
                "type": "Polygon",
                "coordinates": [
                    {"lat": 28.0, "lon": 77.0},
                    {"lat": 28.5, "lon": 77.5},
                    {"lat": 28.0, "lon": 78.0},
                ],
            },
            sample_spacing_km=25,
        )
    except ValidationError as exc:
        assert "LineString" in str(exc)
    else:
        raise AssertionError("Polygon geometry should not validate for route-risk analysis")
