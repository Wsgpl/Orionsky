"""
Pure-logic movement and navigation calculations.
No I/O, no side-effects — only maths.
"""
from __future__ import annotations

import math

EARTH_RADIUS_KM: float = 6371.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance in kilometres between two lat/lon points."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def move_aircraft(
    lat: float,
    lon: float,
    heading: float,
    speed_kmh: float,
    time_seconds: float,
) -> tuple[float, float]:
    """
    Project an aircraft position forward along a great-circle arc.
    Returns (new_lat_deg, new_lon_deg).
    """
    distance_km = speed_kmh * (time_seconds / 3600.0)
    d_over_r = distance_km / EARTH_RADIUS_KM

    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    hdg_rad = math.radians(heading)

    new_lat = math.asin(
        math.sin(lat_rad) * math.cos(d_over_r)
        + math.cos(lat_rad) * math.sin(d_over_r) * math.cos(hdg_rad)
    )
    new_lon = lon_rad + math.atan2(
        math.sin(hdg_rad) * math.sin(d_over_r) * math.cos(lat_rad),
        math.cos(d_over_r) - math.sin(lat_rad) * math.sin(new_lat),
    )
    return math.degrees(new_lat), math.degrees(new_lon)


def predict_position(
    latitude: float,
    longitude: float,
    heading: float,
    velocity_kmh: float,
    seconds_ahead: float,
) -> tuple[float, float]:
    """Return predicted (lat, lon) for an aircraft after seconds_ahead."""
    return move_aircraft(latitude, longitude, heading, velocity_kmh, seconds_ahead)
