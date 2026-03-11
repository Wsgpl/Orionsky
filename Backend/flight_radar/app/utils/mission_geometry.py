"""Geometry utilities for normalized mission shapes."""
from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

from app.schemas.mission_geometry import (
    MissionGeometry,
    MissionGeometryCoordinate,
    MissionLineStringGeometry,
    MissionPolygonGeometry,
)

_EARTH_RADIUS_KM = 6371.0


def haversine_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    lat1_rad = radians(lat1)
    lon1_rad = radians(lon1)
    lat2_rad = radians(lat2)
    lon2_rad = radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * asin(sqrt(a))


def calculate_linestring_distance_km(geometry: MissionLineStringGeometry) -> float:
    if len(geometry.coordinates) < 2:
        return 0.0

    total = 0.0
    for index in range(1, len(geometry.coordinates)):
        previous = geometry.coordinates[index - 1]
        current = geometry.coordinates[index]
        total += haversine_km(previous.lat, previous.lon, current.lat, current.lon)
    return total


def calculate_polygon_area_sq_km(geometry: MissionPolygonGeometry) -> float:
    if len(geometry.coordinates) < 4:
        return 0.0

    open_ring = geometry.coordinates[:-1]
    if len(open_ring) < 3:
        return 0.0

    reference_latitude = radians(
        sum(coordinate.lat for coordinate in open_ring) / len(open_ring)
    )
    projected = [
        (
            _EARTH_RADIUS_KM * radians(coordinate.lon) * cos(reference_latitude),
            _EARTH_RADIUS_KM * radians(coordinate.lat),
        )
        for coordinate in geometry.coordinates
    ]

    area = 0.0
    for index in range(len(projected) - 1):
        current_x, current_y = projected[index]
        next_x, next_y = projected[index + 1]
        area += current_x * next_y - next_x * current_y
    return abs(area) / 2


@dataclass(slots=True, frozen=True)
class MissionGeometryMetrics:
    total_points: int
    total_distance_km: float | None
    area_sq_km: float | None


def build_mission_geometry_metrics(geometry: MissionGeometry) -> MissionGeometryMetrics:
    if isinstance(geometry, MissionLineStringGeometry):
        return MissionGeometryMetrics(
            total_points=len(geometry.coordinates),
            total_distance_km=calculate_linestring_distance_km(geometry),
            area_sq_km=None,
        )
    if isinstance(geometry, MissionPolygonGeometry):
        return MissionGeometryMetrics(
            total_points=len(geometry.coordinates),
            total_distance_km=None,
            area_sq_km=calculate_polygon_area_sq_km(geometry),
        )
    raise ValueError(f"Unsupported mission geometry type: {geometry.type}")


def format_coordinate_pair_text(coordinate: MissionGeometryCoordinate) -> str:
    base = f"{coordinate.lat:.5f}, {coordinate.lon:.5f}"
    if coordinate.alt is None:
        return base
    altitude_text = f"{coordinate.alt:.2f}".rstrip("0").rstrip(".")
    return f"{base}, {altitude_text}"
