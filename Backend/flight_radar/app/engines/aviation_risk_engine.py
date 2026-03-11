"""Derived aviation risk engine built on top of normalized provider domains."""
from __future__ import annotations

from dataclasses import dataclass, field
import re

from app.schemas.air_quality import AirQualityData
from app.schemas.aviation import (
    AviationAlertData,
    AviationAirportWeatherData,
    AviationForecastData,
    AviationForecastPeriod,
)
from app.schemas.aviation_risk import (
    AviationRiskAirportContext,
    AviationRiskItem,
    AviationRiskLevel,
    AviationRiskResponse,
)
from app.schemas.disaster import DisasterContextData
from app.schemas.forecast import ForecastCurrent
from app.schemas.weather import GeneralWeatherData

_LEVEL_SCORES: dict[AviationRiskLevel, float] = {
    "low": 1.0,
    "medium": 2.0,
    "high": 3.0,
}

_STORM_REGEXES = (
    re.compile(r"\bTS\b"),
    re.compile(r"TSRA"),
    re.compile(r"VCTS"),
    re.compile(r"TSTM"),
    re.compile(r"THUNDER"),
    re.compile(r"\bCB\b"),
)
_HEAVY_PRECIP_REGEXES = (
    re.compile(r"\+RA"),
    re.compile(r"\+SHRA"),
    re.compile(r"HEAVY RAIN"),
    re.compile(r"THUNDER"),
    re.compile(r"TSRA"),
)
_LIGHT_PRECIP_REGEXES = (
    re.compile(r"\bRA\b"),
    re.compile(r"\bDZ\b"),
    re.compile(r"DRIZZLE"),
    re.compile(r"RAIN"),
    re.compile(r"SHOWER"),
    re.compile(r"SHRA"),
)
_SEVERE_DISASTER_KEYWORDS = (
    "flood",
    "wildfire",
    "fire",
    "drought",
)
_AIRPORT_OBSERVATION_PREFERENCE_RADIUS_KM = 40.0


@dataclass(slots=True)
class AviationRiskEngineInput:
    latitude: float
    longitude: float
    evaluated_at: str
    nearest_airport: AviationRiskAirportContext | None = None
    weather: GeneralWeatherData | None = None
    forecast_current: ForecastCurrent | None = None
    metar: AviationAirportWeatherData | None = None
    taf: AviationForecastData | None = None
    taf_current_period: AviationForecastPeriod | None = None
    location_sigmets: list[AviationAlertData] = field(default_factory=list)
    location_disasters: list[DisasterContextData] = field(default_factory=list)
    air_quality: AirQualityData | None = None
    sigmet_data_available: bool = False
    sigmet_count: int = 0
    disaster_data_available: bool = False
    disaster_event_count: int = 0
    disaster_evaluable_count: int = 0


def _knots_from_ms(value: float) -> float:
    return value * 1.9438444924406


def _miles_from_meters(value: float) -> float:
    return value / 1609.344


def _contains_any_pattern(text: str | None, patterns: tuple[re.Pattern[str], ...]) -> bool:
    if not text:
        return False
    upper = text.upper()
    return any(pattern.search(upper) for pattern in patterns)


def _disaster_keyword_text(event: DisasterContextData) -> str:
    return " ".join(
        value
        for value in (
            event.event_type,
            event.event_subtype,
            event.title,
            event.description,
            event.severity_indicator,
        )
        if value
    ).lower()


def _classify_overall_level(score: float | None) -> AviationRiskLevel | None:
    if score is None:
        return None
    if score < 1.5:
        return "low"
    if score < 2.5:
        return "medium"
    return "high"


def risk_level_score(level: AviationRiskLevel | None) -> float | None:
    if level is None:
        return None
    return _LEVEL_SCORES[level]


def classify_risk_level(score: float | None) -> AviationRiskLevel | None:
    return _classify_overall_level(score)


def _should_prefer_airport_observation(inputs: AviationRiskEngineInput) -> bool:
    return bool(
        inputs.metar is not None
        and (
            inputs.nearest_airport is None
            or inputs.nearest_airport.distance_km <= _AIRPORT_OBSERVATION_PREFERENCE_RADIUS_KM
        )
    )


def _build_wind_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    candidates: list[tuple[float, str, str]] = []
    if inputs.forecast_current is not None:
        candidates.append(
            (
                _knots_from_ms(inputs.forecast_current.wind_speed),
                "forecast wind speed",
                inputs.forecast_current.source,
            )
        )
    if inputs.weather is not None:
        candidates.append(
            (
                _knots_from_ms(inputs.weather.wind_speed),
                "weather-grid wind speed",
                inputs.weather.source,
            )
        )
    if inputs.metar is not None and (
        inputs.metar.wind_speed_kt is not None or inputs.metar.wind_gust_kt is not None
    ):
        steady = inputs.metar.wind_speed_kt
        gust = inputs.metar.wind_gust_kt
        metar_value = max(number for number in (steady, gust) if number is not None)
        detail = "airport gust" if gust is not None and gust >= (steady or gust) else "airport wind speed"
        if _should_prefer_airport_observation(inputs) or not candidates:
            candidates.append((metar_value, detail, inputs.metar.source))

    if not candidates:
        return AviationRiskItem(
            category="wind",
            explanation="Data unavailable for wind risk.",
        )

    value, detail, source = max(candidates, key=lambda item: item[0])

    if value < 10:
        level: AviationRiskLevel = "low"
        threshold = "<10 kt"
    elif value <= 20:
        level = "medium"
        threshold = "10-20 kt"
    else:
        level = "high"
        threshold = ">20 kt"

    return AviationRiskItem(
        category="wind",
        level=level,
        value=round(value, 1),
        threshold_used=threshold,
        source=source,
        explanation=f"{level.title()} wind risk: {detail} {value:.1f} kt evaluated against {threshold}.",
    )


def _build_visibility_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    candidates: list[tuple[float, str]] = []
    if inputs.forecast_current is not None:
        candidates.append(
            (
                _miles_from_meters(inputs.forecast_current.visibility),
                inputs.forecast_current.source,
            )
        )
    if inputs.weather is not None:
        candidates.append(
            (
                _miles_from_meters(inputs.weather.visibility),
                inputs.weather.source,
            )
        )
    if inputs.metar is not None and inputs.metar.visibility_sm is not None:
        if _should_prefer_airport_observation(inputs) or not candidates:
            candidates.append((inputs.metar.visibility_sm, inputs.metar.source))

    if not candidates:
        return AviationRiskItem(
            category="visibility",
            explanation="Data unavailable for visibility risk.",
        )

    value, source = min(candidates, key=lambda item: item[0])

    if value < 2:
        level: AviationRiskLevel = "high"
        threshold = "<2 mi"
    elif value <= 5:
        level = "medium"
        threshold = "2-5 mi"
    else:
        level = "low"
        threshold = ">5 mi"

    return AviationRiskItem(
        category="visibility",
        level=level,
        value=round(value, 2),
        threshold_used=threshold,
        source=source,
        explanation=f"{level.title()} visibility risk: visibility {value:.2f} mi evaluated against {threshold}.",
    )


def _build_precipitation_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    prefer_airport_observation = _should_prefer_airport_observation(inputs)
    metar_raw = (
        inputs.metar.raw_text
        if inputs.metar is not None and (prefer_airport_observation or inputs.forecast_current is None and inputs.weather is None)
        else None
    )
    condition_text = (
        inputs.forecast_current.condition
        if inputs.forecast_current is not None
        else inputs.weather.condition if inputs.weather is not None else None
    )
    precipitation_amount = (
        inputs.forecast_current.precipitation_amount
        if inputs.forecast_current is not None
        else inputs.weather.precip_mm if inputs.weather is not None else None
    )

    if _contains_any_pattern(metar_raw, _HEAVY_PRECIP_REGEXES) or _contains_any_pattern(condition_text, _HEAVY_PRECIP_REGEXES):
        return AviationRiskItem(
            category="precipitation",
            level="high",
            value=precipitation_amount,
            threshold_used=">=2.5 mm or thunderstorm/heavy rain indicator",
            source=inputs.metar.source if inputs.metar is not None and _contains_any_pattern(metar_raw, _HEAVY_PRECIP_REGEXES) else (
                inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None
            ),
            explanation="High precipitation risk: heavy rain or thunderstorm indicator is present in current weather text.",
        )

    if precipitation_amount is not None:
        if precipitation_amount <= 0:
            return AviationRiskItem(
                category="precipitation",
                level="low",
                value=round(precipitation_amount, 2),
                threshold_used="0 mm",
                source=inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None,
                explanation="Low precipitation risk: no measurable precipitation is reported.",
            )
        if precipitation_amount < 2.5:
            return AviationRiskItem(
                category="precipitation",
                level="medium",
                value=round(precipitation_amount, 2),
                threshold_used="0-2.5 mm",
                source=inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None,
                explanation=f"Medium precipitation risk: precipitation amount {precipitation_amount:.2f} mm indicates light rain.",
            )
        return AviationRiskItem(
            category="precipitation",
            level="high",
            value=round(precipitation_amount, 2),
            threshold_used=">=2.5 mm",
            source=inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None,
            explanation=f"High precipitation risk: precipitation amount {precipitation_amount:.2f} mm exceeds the heavy-rain threshold.",
        )

    if _contains_any_pattern(metar_raw, _LIGHT_PRECIP_REGEXES) or _contains_any_pattern(condition_text, _LIGHT_PRECIP_REGEXES):
        return AviationRiskItem(
            category="precipitation",
            level="medium",
            value="light rain indicator",
            threshold_used="light rain indicator",
            source=inputs.metar.source if inputs.metar is not None and _contains_any_pattern(metar_raw, _LIGHT_PRECIP_REGEXES) else (
                inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None
            ),
            explanation="Medium precipitation risk: light precipitation indicator is present but no numeric amount is available.",
        )

    if condition_text is not None:
        return AviationRiskItem(
            category="precipitation",
            level="low",
            value="no precipitation indicator",
            threshold_used="no rain indicator",
            source=inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None,
            explanation="Low precipitation risk: current weather text shows no rain or thunderstorm indicator.",
        )

    return AviationRiskItem(
        category="precipitation",
        explanation="Data unavailable for precipitation risk.",
    )


def _build_storm_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    if inputs.location_sigmets:
        matched = inputs.location_sigmets[0]
        return AviationRiskItem(
            category="storm",
            level="high",
            value=matched.hazard_type or matched.alert_id or "SIGMET present",
            threshold_used="SIGMET present",
            source=matched.source,
            explanation="High storm risk: a location-matched SIGMET is active for the requested area.",
        )

    prefer_airport_observation = _should_prefer_airport_observation(inputs)
    metar_raw = inputs.metar.raw_text if inputs.metar is not None and prefer_airport_observation else None
    taf_weather = inputs.taf_current_period.weather if inputs.taf_current_period is not None else None
    taf_raw = inputs.taf_current_period.raw_text if inputs.taf_current_period is not None else (
        inputs.taf.raw_text if inputs.taf is not None and not inputs.taf.forecast_periods else None
    )
    exact_condition = (
        inputs.forecast_current.condition
        if inputs.forecast_current is not None
        else inputs.weather.condition if inputs.weather is not None else None
    )

    if _contains_any_pattern(metar_raw, _STORM_REGEXES):
        return AviationRiskItem(
            category="storm",
            level="high",
            value="thunderstorm indicator",
            threshold_used="current METAR thunderstorm indicator",
            source=inputs.metar.source if inputs.metar is not None else None,
            explanation="High storm risk: the current METAR contains a thunderstorm or convective-weather indicator.",
        )

    if _contains_any_pattern(exact_condition, _STORM_REGEXES):
        return AviationRiskItem(
            category="storm",
            level="high",
            value="local thunderstorm indicator",
            threshold_used="current route-point thunderstorm indicator",
            source=inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else None,
            explanation="High storm risk: the route-point weather condition indicates thunderstorm or convective activity.",
        )

    if _contains_any_pattern(taf_weather, _STORM_REGEXES) or _contains_any_pattern(taf_raw, _STORM_REGEXES):
        return AviationRiskItem(
            category="storm",
            level="medium",
            value="convective forecast indicator",
            threshold_used="current TAF thunderstorm indicator",
            source=inputs.taf.source if inputs.taf is not None else None,
            explanation="Medium storm risk: the current TAF period indicates thunderstorm or convective activity.",
        )

    if (
        inputs.metar is not None
        or inputs.taf_current_period is not None
        or inputs.taf is not None
        or inputs.forecast_current is not None
        or inputs.weather is not None
    ):
        explanation = "Low storm risk: no thunderstorm indicator was found in available aviation weather products."
        threshold = "no current thunderstorm indicator"
        if inputs.sigmet_data_available:
            explanation = "Low storm risk: no location-matched SIGMET and no thunderstorm indicator were found in available route-point weather products."
            threshold = "no SIGMET and no current thunderstorm indicator"
        return AviationRiskItem(
            category="storm",
            level="low",
            value="no thunderstorm indicator",
            threshold_used=threshold,
            source=inputs.forecast_current.source if inputs.forecast_current is not None else inputs.weather.source if inputs.weather is not None else "awc",
            explanation=explanation,
        )

    return AviationRiskItem(
        category="storm",
        explanation="Data unavailable for storm risk.",
    )


def _derive_taf_ceiling_ft(period: AviationForecastPeriod | None) -> int | None:
    if period is None or not period.cloud_layers:
        return None
    candidate_bases = [
        layer.base_ft_agl
        for layer in period.cloud_layers
        if layer.base_ft_agl is not None and (layer.coverage or "").upper() in {"BKN", "OVC", "VV", "OVX"}
    ]
    return min(candidate_bases) if candidate_bases else None


def _build_ceiling_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    if inputs.metar is not None and inputs.metar.ceiling_ft_agl is not None:
        value = float(inputs.metar.ceiling_ft_agl)
        source = inputs.metar.source
    else:
        taf_ceiling = _derive_taf_ceiling_ft(inputs.taf_current_period)
        if taf_ceiling is None:
            return AviationRiskItem(
                category="ceiling",
                explanation="Data unavailable for ceiling risk.",
            )
        value = float(taf_ceiling)
        source = inputs.taf.source if inputs.taf is not None else None

    if value < 1000:
        level: AviationRiskLevel = "high"
        threshold = "<1000 ft"
    elif value <= 3000:
        level = "medium"
        threshold = "1000-3000 ft"
    else:
        level = "low"
        threshold = ">3000 ft"

    return AviationRiskItem(
        category="ceiling",
        level=level,
        value=round(value),
        threshold_used=threshold,
        source=source,
        explanation=f"{level.title()} ceiling risk: ceiling {value:.0f} ft AGL evaluated against {threshold}.",
    )


def _build_disaster_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    if not inputs.disaster_data_available:
        return AviationRiskItem(
            category="disaster",
            explanation="Data unavailable for disaster risk at this location.",
        )

    active_events = [event for event in inputs.location_disasters if event.closed is not True]
    severe_active = [
        event
        for event in active_events
        if any(keyword in _disaster_keyword_text(event) for keyword in _SEVERE_DISASTER_KEYWORDS)
    ]

    if severe_active:
        event = severe_active[0]
        return AviationRiskItem(
            category="disaster",
            level="high",
            value=event.event_type or event.title or event.event_id,
            threshold_used="active nearby flood/fire/drought event",
            source=event.source,
            explanation="High disaster risk: an active Copernicus CEMS disaster event is matched to the requested location.",
        )

    if active_events:
        event = active_events[0]
        return AviationRiskItem(
            category="disaster",
            level="medium",
            value=event.event_type or event.title or event.event_id,
            threshold_used="active nearby disaster event",
            source=event.source,
            explanation="Medium disaster risk: an active Copernicus CEMS event is matched to the requested location.",
        )

    if inputs.disaster_event_count == 0:
        return AviationRiskItem(
            category="disaster",
            level="low",
            value="no active events",
            threshold_used="no CEMS events returned",
            source="copernicus_cems",
            explanation="Low disaster risk: no Copernicus CEMS events are currently available for the evaluated region.",
        )

    if inputs.disaster_evaluable_count > 0:
        return AviationRiskItem(
            category="disaster",
            level="low",
            value="no nearby active events",
            threshold_used="no active matched CEMS event",
            source="copernicus_cems",
            explanation="Low disaster risk: disaster context is available and no active event geometry covers the requested location.",
        )

    return AviationRiskItem(
        category="disaster",
        explanation="Data unavailable for precise disaster-location matching.",
    )


def _build_air_quality_risk(inputs: AviationRiskEngineInput) -> AviationRiskItem:
    if inputs.air_quality is None or inputs.air_quality.pm25 is None:
        return AviationRiskItem(
            category="air_quality",
            explanation="Data unavailable for air-quality risk.",
        )

    value = inputs.air_quality.pm25
    if value < 12:
        level: AviationRiskLevel = "low"
        threshold = "<12 ug/m3"
    elif value <= 35:
        level = "medium"
        threshold = "12-35 ug/m3"
    else:
        level = "high"
        threshold = ">35 ug/m3"

    return AviationRiskItem(
        category="air_quality",
        level=level,
        value=round(value, 1),
        threshold_used=threshold,
        source=inputs.air_quality.source,
        explanation=f"{level.title()} air-quality risk: PM2.5 {value:.1f} ug/m3 evaluated against {threshold}.",
    )


def build_aviation_risk_assessment(inputs: AviationRiskEngineInput) -> AviationRiskResponse:
    factors = [
        _build_wind_risk(inputs),
        _build_visibility_risk(inputs),
        _build_precipitation_risk(inputs),
        _build_storm_risk(inputs),
        _build_ceiling_risk(inputs),
        _build_disaster_risk(inputs),
        _build_air_quality_risk(inputs),
    ]

    scored_levels = [_LEVEL_SCORES[item.level] for item in factors if item.level is not None]
    score = round(sum(scored_levels) / len(scored_levels), 2) if scored_levels else None
    overall_level = _classify_overall_level(score)

    return AviationRiskResponse(
        latitude=inputs.latitude,
        longitude=inputs.longitude,
        evaluated_at=inputs.evaluated_at,
        nearest_airport=inputs.nearest_airport,
        overall_level=overall_level,
        score=score,
        factor_count=len(scored_levels),
        factors=factors,
    )
