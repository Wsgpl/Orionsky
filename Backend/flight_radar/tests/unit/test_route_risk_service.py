"""Unit tests for route-risk service helpers."""
from __future__ import annotations

from app.services.route_risk_service import _build_effective_sampling_plan
from app.utils.route_sampling import RouteVertex


def test_effective_sampling_plan_widens_spacing_for_dense_routes():
    route = [
        RouteVertex(lat=28.0, lon=77.0),
        RouteVertex(lat=28.0, lon=80.0),
    ]

    plan, sampling_adjusted = _build_effective_sampling_plan(route, requested_sample_spacing_km=10.0)

    assert sampling_adjusted is True
    assert len(plan.samples) <= 30
    assert plan.sample_spacing_km > 10.0
