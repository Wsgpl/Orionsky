"""Aggregation engine for route-based aviation risk analysis."""
from __future__ import annotations

from dataclasses import dataclass

from app.engines.aviation_risk_engine import classify_risk_level, risk_level_score
from app.schemas.aviation_risk import AviationRiskCategory, AviationRiskItem, AviationRiskResponse
from app.schemas.route_risk import (
    RouteRiskCoordinate,
    RouteRiskPointAssessment,
    RouteRiskResponse,
    RouteRiskSegmentAssessment,
)

_CATEGORY_ORDER: tuple[AviationRiskCategory, ...] = (
    "wind",
    "visibility",
    "precipitation",
    "storm",
    "ceiling",
    "disaster",
    "air_quality",
)


@dataclass(slots=True)
class RouteRiskEngineSample:
    sample_index: int
    coordinate: RouteRiskCoordinate
    distance_from_start_km: float
    is_route_vertex: bool
    point_risk: AviationRiskResponse


def _level_value(item: AviationRiskItem | None) -> float:
    if item is None:
        return 0.0
    return risk_level_score(item.level) or 0.0


def _factor_map(response: AviationRiskResponse) -> dict[AviationRiskCategory, AviationRiskItem]:
    return {factor.category: factor for factor in response.factors}


def _skipped_categories(factors: list[AviationRiskItem]) -> list[AviationRiskCategory]:
    return [factor.category for factor in factors if factor.level is None]


def _aggregate_segment_factor(
    category: AviationRiskCategory,
    start_item: AviationRiskItem | None,
    end_item: AviationRiskItem | None,
) -> AviationRiskItem:
    start_level = risk_level_score(start_item.level) if start_item is not None else None
    end_level = risk_level_score(end_item.level) if end_item is not None else None

    if start_level is None and end_level is None:
        return AviationRiskItem(
            category=category,
            explanation=f"{category.replace('_', ' ').title()} data is unavailable across both segment endpoints.",
        )

    chosen = start_item
    chosen_label = "start"
    other_item = end_item
    other_label = "end"
    if (end_level or 0) > (start_level or 0):
        chosen = end_item
        chosen_label = "end"
        other_item = start_item
        other_label = "start"
    elif (end_level or 0) == (start_level or 0) and end_item is not None and chosen is None:
        chosen = end_item
        chosen_label = "end"
        other_item = start_item
        other_label = "start"

    if chosen is None:
        return AviationRiskItem(
            category=category,
            explanation=f"{category.replace('_', ' ').title()} data is unavailable for this segment.",
        )

    if other_item is None or other_item.level is None:
        explanation = (
            f"Segment {category.replace('_', ' ')} risk uses the {chosen_label} sample because the "
            f"{other_label} sample is unavailable. {chosen.explanation}"
        )
    elif chosen.level != other_item.level:
        explanation = (
            f"Segment {category.replace('_', ' ')} risk uses the higher severity between adjacent samples "
            f"(start={start_item.level}, end={end_item.level}). {chosen.explanation}"
        )
    else:
        explanation = (
            f"Segment {category.replace('_', ' ')} risk is consistent across adjacent samples "
            f"(start={start_item.level}, end={end_item.level}). {chosen.explanation}"
        )

    return chosen.model_copy(update={"explanation": explanation})


def _aggregate_route_factor(
    category: AviationRiskCategory,
    segments: list[RouteRiskSegmentAssessment],
) -> AviationRiskItem:
    best_factor: AviationRiskItem | None = None
    best_segment_index: int | None = None

    for segment in segments:
        for factor in segment.factors:
            if factor.category != category or factor.level is None:
                continue
            if best_factor is None or _level_value(factor) > _level_value(best_factor):
                best_factor = factor
                best_segment_index = segment.segment_index

    if best_factor is None:
        return AviationRiskItem(
            category=category,
            explanation=f"{category.replace('_', ' ').title()} is unavailable across the analyzed route.",
        )

    return best_factor.model_copy(
        update={
            "explanation": (
                f"Route {category.replace('_', ' ')} risk reflects the worst evaluated segment "
                f"(segment {best_segment_index}). {best_factor.explanation}"
            )
        }
    )


def build_route_risk_assessment(
    route_point_count: int,
    total_distance_km: float,
    requested_sample_spacing_km: float,
    sample_spacing_km: float,
    sampling_adjusted: bool,
    samples: list[RouteRiskEngineSample],
) -> RouteRiskResponse:
    point_assessments = [
        RouteRiskPointAssessment(
            sample_index=sample.sample_index,
            coordinate=sample.coordinate,
            distance_from_start_km=round(sample.distance_from_start_km, 3),
            is_route_vertex=sample.is_route_vertex,
            nearest_airport=sample.point_risk.nearest_airport,
            overall_level=sample.point_risk.overall_level,
            score=sample.point_risk.score,
            factor_count=sample.point_risk.factor_count,
            skipped_categories=_skipped_categories(sample.point_risk.factors),
            factors=sample.point_risk.factors,
            explanation=(
                f"Sample point {sample.sample_index + 1} at {sample.distance_from_start_km:.1f} km is "
                f"{(sample.point_risk.overall_level or 'unscored').upper()} risk across "
                f"{sample.point_risk.factor_count} evaluated categories."
            ),
        )
        for sample in samples
    ]

    segments: list[RouteRiskSegmentAssessment] = []
    for index in range(1, len(samples)):
        start_sample = samples[index - 1]
        end_sample = samples[index]
        start_factor_map = _factor_map(start_sample.point_risk)
        end_factor_map = _factor_map(end_sample.point_risk)
        factors = [
            _aggregate_segment_factor(category, start_factor_map.get(category), end_factor_map.get(category))
            for category in _CATEGORY_ORDER
        ]
        scored_levels = [risk_level_score(factor.level) for factor in factors if factor.level is not None]
        score = round(sum(scored_levels) / len(scored_levels), 2) if scored_levels else None
        segments.append(
            RouteRiskSegmentAssessment(
                segment_index=index - 1,
                start_sample_index=start_sample.sample_index,
                end_sample_index=end_sample.sample_index,
                start=start_sample.coordinate,
                end=end_sample.coordinate,
                distance_km=round(end_sample.distance_from_start_km - start_sample.distance_from_start_km, 3),
                overall_level=classify_risk_level(score),
                score=score,
                factor_count=len(scored_levels),
                skipped_categories=_skipped_categories(factors),
                factors=factors,
                explanation=(
                    "Segment risk uses the worst evaluated factor from the two adjacent sample points for each "
                    "category. Skipped categories are excluded from the segment score."
                ),
            )
        )

    route_factors = [_aggregate_route_factor(category, segments) for category in _CATEGORY_ORDER]
    evaluated_segment_scores = [segment.score for segment in segments if segment.score is not None]
    overall_score = round(max(evaluated_segment_scores), 2) if evaluated_segment_scores else None
    overall_level = classify_risk_level(overall_score)
    factor_count = sum(1 for factor in route_factors if factor.level is not None)

    skipped_categories = sorted(
        {
            category
            for segment in segments
            for category in segment.skipped_categories
        }
    )
    unavailable_categories = [factor.category for factor in route_factors if factor.level is None]

    worst_sections = sorted(
        [segment for segment in segments if segment.score is not None],
        key=lambda segment: (segment.score or 0.0, segment.distance_km),
        reverse=True,
    )[:3]

    if overall_level is None:
        route_summary = (
            f"Route analyzed across {total_distance_km:.1f} km using {len(samples)} sampled points, "
            "but no route-wide score could be derived because every category was skipped."
        )
    else:
        top_categories = [factor.category.replace("_", " ") for factor in route_factors if factor.level == overall_level][:2]
        category_suffix = f" Highest concern: {', '.join(top_categories)}." if top_categories else ""
        route_summary = (
            f"{overall_level.title()} route risk across {total_distance_km:.1f} km using {len(samples)} "
            f"sampled points at {sample_spacing_km:.1f} km spacing.{category_suffix}"
        )
        if sampling_adjusted:
            route_summary += (
                f" Sampling was automatically widened from {requested_sample_spacing_km:.1f} km "
                f"to {sample_spacing_km:.1f} km to keep analysis responsive."
            )

    return RouteRiskResponse(
        route_summary=route_summary,
        total_distance_km=round(total_distance_km, 3),
        route_point_count=route_point_count,
        requested_sample_spacing_km=requested_sample_spacing_km,
        sample_spacing_km=sample_spacing_km,
        sampling_adjusted=sampling_adjusted,
        sample_point_count=len(point_assessments),
        sample_points=point_assessments,
        segment_count=len(segments),
        segments=segments,
        worst_sections=worst_sections,
        overall_score=overall_score,
        overall_level=overall_level,
        factor_count=factor_count,
        factors=route_factors,
        skipped_categories=skipped_categories,
        unavailable_categories=unavailable_categories,
        explanation=(
            "Route risk reuses the point aviation-risk engine at sampled locations. Segment scores aggregate "
            "adjacent points by taking the higher severity per category, and the overall route score reflects "
            "the highest evaluated segment score. Missing source data stays unavailable and is skipped rather "
            "than treated as low risk."
        ),
    )
