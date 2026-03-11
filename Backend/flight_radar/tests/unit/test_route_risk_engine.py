"""Unit tests for route-risk sampling and aggregation."""
from app.engines.route_risk_engine import RouteRiskEngineSample, build_route_risk_assessment
from app.schemas.aviation_risk import AviationRiskItem, AviationRiskResponse
from app.schemas.route_risk import RouteRiskCoordinate
from app.utils.route_sampling import RouteVertex, build_route_sampling_plan

_CATEGORIES = (
    "wind",
    "visibility",
    "precipitation",
    "storm",
    "ceiling",
    "disaster",
    "air_quality",
)


def _make_factor(category: str, level: str | None) -> AviationRiskItem:
    if level is None:
        return AviationRiskItem(
            category=category,
            explanation=f"{category} unavailable",
        )
    return AviationRiskItem(
        category=category,
        level=level,
        value=level,
        threshold_used=level,
        source="awc" if category in {"storm", "ceiling"} else "openmeteo",
        explanation=f"{category} {level}",
    )


def _make_point_response(lat: float, lon: float, level: str, disaster_level: str | None = None) -> AviationRiskResponse:
    factors = [
        _make_factor(category, disaster_level if category == "disaster" else level)
        for category in _CATEGORIES
    ]
    score = 3.0 if level == "high" else 2.0 if level == "medium" else 1.0
    return AviationRiskResponse(
        latitude=lat,
        longitude=lon,
        evaluated_at="2026-04-04T10:00:00+00:00",
        overall_level=level,
        score=score,
        factor_count=sum(1 for factor in factors if factor.level is not None),
        factors=factors,
    )


def test_route_sampling_preserves_vertices_and_regular_intervals():
    plan = build_route_sampling_plan(
        [RouteVertex(lat=0.0, lon=0.0), RouteVertex(lat=0.0, lon=1.0)],
        sample_spacing_km=50.0,
    )

    assert 110.0 <= plan.total_distance_km <= 112.5
    assert plan.samples[0].is_route_vertex is True
    assert plan.samples[0].distance_from_start_km == 0.0
    assert plan.samples[-1].is_route_vertex is True
    assert plan.samples[-1].distance_from_start_km == plan.total_distance_km
    assert any(sample.is_route_vertex is False for sample in plan.samples[1:-1])


def test_route_risk_uses_worst_segment_and_keeps_missing_categories_unavailable():
    samples = [
        RouteRiskEngineSample(
            sample_index=0,
            coordinate=RouteRiskCoordinate(lat=28.0, lon=77.0),
            distance_from_start_km=0.0,
            is_route_vertex=True,
            point_risk=_make_point_response(28.0, 77.0, "high", disaster_level=None),
        ),
        RouteRiskEngineSample(
            sample_index=1,
            coordinate=RouteRiskCoordinate(lat=28.5, lon=77.5),
            distance_from_start_km=60.0,
            is_route_vertex=False,
            point_risk=_make_point_response(28.5, 77.5, "low", disaster_level=None),
        ),
        RouteRiskEngineSample(
            sample_index=2,
            coordinate=RouteRiskCoordinate(lat=29.0, lon=78.0),
            distance_from_start_km=120.0,
            is_route_vertex=False,
            point_risk=_make_point_response(29.0, 78.0, "low", disaster_level=None),
        ),
        RouteRiskEngineSample(
            sample_index=3,
            coordinate=RouteRiskCoordinate(lat=29.5, lon=78.5),
            distance_from_start_km=180.0,
            is_route_vertex=True,
            point_risk=_make_point_response(29.5, 78.5, "low", disaster_level=None),
        ),
    ]

    response = build_route_risk_assessment(
        route_point_count=2,
        total_distance_km=180.0,
        requested_sample_spacing_km=60.0,
        sample_spacing_km=60.0,
        sampling_adjusted=False,
        samples=samples,
    )

    factor_map = {factor.category: factor for factor in response.factors}

    assert response.segment_count == 3
    assert response.requested_sample_spacing_km == 60.0
    assert response.sampling_adjusted is False
    assert response.overall_score == 3.0
    assert response.overall_level == "high"
    assert response.worst_sections[0].segment_index == 0
    assert factor_map["wind"].level == "high"
    assert factor_map["disaster"].level is None
    assert "disaster" in response.unavailable_categories
    assert "disaster" in response.skipped_categories
