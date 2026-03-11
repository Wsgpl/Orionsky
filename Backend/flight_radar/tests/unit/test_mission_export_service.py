"""Unit tests for mission KML and TXT export generation."""
from app.schemas.mission_export import MissionExportKmlRequest, MissionExportTxtRequest
from app.services.mission_export_service import (
    generate_mission_kml_document,
    generate_mission_txt_document,
)


def test_generate_linestring_kml_uses_lon_lat_alt_order():
    document = generate_mission_kml_document(
        MissionExportKmlRequest(
            geometry={
                "type": "LineString",
                "name": "Northern Route",
                "coordinates": [
                    {"lat": 34.0837, "lon": 74.7973, "alt": 5500},
                    {"lat": 33.7782, "lon": 76.5762, "alt": 6100},
                    {"lat": 31.1048, "lon": 77.1734, "alt": 6400},
                ],
            }
        )
    )

    assert document.filename == "Northern-Route.kml"
    assert "<LineString>" in document.content
    assert "<name>Northern Route</name>" in document.content
    assert "74.7973,34.0837,5500" in document.content
    assert "76.5762,33.7782,6100" in document.content
    assert "77.1734,31.1048,6400" in document.content


def test_generate_polygon_kml_uses_closed_linear_ring():
    document = generate_mission_kml_document(
        MissionExportKmlRequest(
            geometry={
                "type": "Polygon",
                "name": "Hold Area",
                "coordinates": [
                    {"lat": 28.0, "lon": 77.0, "alt": 1200},
                    {"lat": 28.5, "lon": 77.5, "alt": 1200},
                    {"lat": 28.1, "lon": 78.0, "alt": 1200},
                ],
            }
        )
    )

    assert document.filename == "Hold-Area.kml"
    assert "<Polygon>" in document.content
    assert "<LinearRing>" in document.content
    assert document.content.count("77,28,1200") == 2
    assert "77.5,28.5,1200" in document.content
    assert "78,28.1,1200" in document.content


def test_generate_linestring_txt_contains_points_and_distance():
    document = generate_mission_txt_document(
        MissionExportTxtRequest(
            geometry={
                "type": "LineString",
                "name": "Northern Corridor Test",
                "coordinates": [
                    {"lat": 34.12345, "lon": 74.12345},
                    {"lat": 33.98321, "lon": 75.00123},
                    {"lat": 32.76444, "lon": 76.33455},
                ],
            }
        )
    )

    assert document.filename == "Northern-Corridor-Test.txt"
    assert "MISSION_NAME: Northern Corridor Test" in document.content
    assert "TYPE: LINESTRING" in document.content
    assert "POINT_1: 34.12345, 74.12345" in document.content
    assert "POINT_2: 33.98321, 75.00123" in document.content
    assert "POINT_3: 32.76444, 76.33455" in document.content
    assert "TOTAL_POINTS: 3" in document.content
    assert "TOTAL_DISTANCE_KM:" in document.content
    assert "AREA_SQ_KM:" not in document.content


def test_generate_polygon_txt_contains_closed_points_and_area():
    document = generate_mission_txt_document(
        MissionExportTxtRequest(
            geometry={
                "type": "Polygon",
                "name": "Valley Survey Zone",
                "coordinates": [
                    {"lat": 34.12345, "lon": 74.12345},
                    {"lat": 34.22345, "lon": 74.32345},
                    {"lat": 34.00345, "lon": 74.52345},
                ],
            }
        )
    )

    assert document.filename == "Valley-Survey-Zone.txt"
    assert "MISSION_NAME: Valley Survey Zone" in document.content
    assert "TYPE: POLYGON" in document.content
    assert "POINT_1: 34.12345, 74.12345" in document.content
    assert "POINT_2: 34.22345, 74.32345" in document.content
    assert "POINT_3: 34.00345, 74.52345" in document.content
    assert "POINT_4: 34.12345, 74.12345" in document.content
    assert "TOTAL_POINTS: 4" in document.content
    assert "AREA_SQ_KM:" in document.content
    assert "TOTAL_DISTANCE_KM:" not in document.content
