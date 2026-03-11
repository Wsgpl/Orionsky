"""
Pure-logic weather advisory engine.
Evaluates weather conditions for each aircraft position and returns warnings.
"""
from __future__ import annotations

from app.schemas.aircraft import AircraftState
from app.schemas.conflict import WeatherAdvisory
from app.schemas.weather import WeatherData


def _evaluate_severity(warnings: list[str]) -> str:
    high_triggers = {"Severe wind", "Very low visibility"}
    medium_triggers = {"Heavy precipitation", "Dense cloud cover"}
    for w in warnings:
        if w in high_triggers:
            return "HIGH"
    for w in warnings:
        if w in medium_triggers:
            return "MEDIUM"
    return "LOW"


def build_advisory(
    aircraft: AircraftState,
    weather: WeatherData,
) -> WeatherAdvisory | None:
    """
    Compare aircraft position weather data against safety thresholds.
    Returns None if no warnings apply.
    """
    warnings: list[str] = []

    if weather.wind_speed > 20:
        warnings.append("Severe wind")
    elif weather.wind_speed > 12:
        warnings.append("Moderate wind")

    if weather.visibility < 2000:
        warnings.append("Very low visibility")
    elif weather.visibility < 5000:
        warnings.append("Reduced visibility")

    if weather.cloud_cover > 90:
        warnings.append("Dense cloud cover")

    condition = weather.condition.lower()
    if "rain" in condition or "storm" in condition or "thunder" in condition:
        warnings.append("Heavy precipitation")

    if not warnings:
        return None

    return WeatherAdvisory(
        aircraft=aircraft.icao,
        severity=_evaluate_severity(warnings),
        warnings=warnings,
    )
