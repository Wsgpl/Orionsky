"""Route geometry helpers for sampling polyline risk inputs."""
from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt


@dataclass(slots=True, frozen=True)
class RouteVertex:
    lat: float
    lon: float


@dataclass(slots=True, frozen=True)
class RouteSamplePoint:
    lat: float
    lon: float
    distance_from_start_km: float
    is_route_vertex: bool


@dataclass(slots=True, frozen=True)
class RouteSamplingPlan:
    route: list[RouteVertex]
    sample_spacing_km: float
    total_distance_km: float
    samples: list[RouteSamplePoint]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1_rad = radians(lat1)
    lon1_rad = radians(lon1)
    lat2_rad = radians(lat2)
    lon2_rad = radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))


def _interpolate(start: RouteVertex, end: RouteVertex, progress: float) -> RouteVertex:
    return RouteVertex(
        lat=start.lat + (end.lat - start.lat) * progress,
        lon=start.lon + (end.lon - start.lon) * progress,
    )


def _dedupe_consecutive_vertices(route: list[RouteVertex]) -> list[RouteVertex]:
    deduped: list[RouteVertex] = []
    for vertex in route:
        if not deduped or deduped[-1] != vertex:
            deduped.append(vertex)
    return deduped


def calculate_route_distance_km(route: list[RouteVertex]) -> float:
    normalised_route = _dedupe_consecutive_vertices(route)
    if len(normalised_route) < 2:
        return 0.0

    total = 0.0
    for index in range(1, len(normalised_route)):
        total += haversine_km(
            normalised_route[index - 1].lat,
            normalised_route[index - 1].lon,
            normalised_route[index].lat,
            normalised_route[index].lon,
        )
    return total


def build_route_sampling_plan(route: list[RouteVertex], sample_spacing_km: float) -> RouteSamplingPlan:
    normalised_route = _dedupe_consecutive_vertices(route)
    if len(normalised_route) < 2:
        raise ValueError("Route must contain at least two distinct coordinates")
    if sample_spacing_km <= 0:
        raise ValueError("sample_spacing_km must be greater than zero")

    segment_lengths: list[float] = []
    cumulative_distances = [0.0]
    for index in range(1, len(normalised_route)):
        segment_length = haversine_km(
            normalised_route[index - 1].lat,
            normalised_route[index - 1].lon,
            normalised_route[index].lat,
            normalised_route[index].lon,
        )
        segment_lengths.append(segment_length)
        cumulative_distances.append(cumulative_distances[-1] + segment_length)

    total_distance_km = cumulative_distances[-1]
    if total_distance_km <= 0:
        raise ValueError("Route distance must be greater than zero")

    requested_distances = list(cumulative_distances)
    next_distance = sample_spacing_km
    while next_distance < total_distance_km:
        requested_distances.append(next_distance)
        next_distance += sample_spacing_km
    requested_distances.append(total_distance_km)

    requested_distances.sort()
    sample_distances: list[float] = []
    for distance in requested_distances:
        if not sample_distances or abs(distance - sample_distances[-1]) > 1e-6:
            sample_distances.append(distance)

    samples: list[RouteSamplePoint] = []
    for target_distance in sample_distances:
        if target_distance <= 0:
            vertex = normalised_route[0]
            samples.append(
                RouteSamplePoint(
                    lat=vertex.lat,
                    lon=vertex.lon,
                    distance_from_start_km=0.0,
                    is_route_vertex=True,
                )
            )
            continue

        if abs(target_distance - total_distance_km) <= 1e-6:
            vertex = normalised_route[-1]
            samples.append(
                RouteSamplePoint(
                    lat=vertex.lat,
                    lon=vertex.lon,
                    distance_from_start_km=round(total_distance_km, 3),
                    is_route_vertex=True,
                )
            )
            continue

        for index, segment_length in enumerate(segment_lengths):
            start_distance = cumulative_distances[index]
            end_distance = cumulative_distances[index + 1]
            if target_distance > end_distance + 1e-6:
                continue

            is_vertex = abs(target_distance - start_distance) <= 1e-6 or abs(target_distance - end_distance) <= 1e-6
            if abs(target_distance - start_distance) <= 1e-6:
                vertex = normalised_route[index]
            elif abs(target_distance - end_distance) <= 1e-6:
                vertex = normalised_route[index + 1]
            else:
                progress = 0.0 if segment_length <= 0 else (target_distance - start_distance) / segment_length
                vertex = _interpolate(normalised_route[index], normalised_route[index + 1], progress)

            samples.append(
                RouteSamplePoint(
                    lat=vertex.lat,
                    lon=vertex.lon,
                    distance_from_start_km=round(target_distance, 3),
                    is_route_vertex=is_vertex,
                )
            )
            break

    return RouteSamplingPlan(
        route=normalised_route,
        sample_spacing_km=sample_spacing_km,
        total_distance_km=round(total_distance_km, 3),
        samples=samples,
    )
