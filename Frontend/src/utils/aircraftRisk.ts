import type { Aircraft, WeatherCell } from "../types";
import { getNearestWeatherCell, getWeatherAlertLevel } from "./weatherMap";

export function getAircraftRiskFlag(
  aircraft: Aircraft,
  weatherCells: WeatherCell[],
): Aircraft["risk_flag"] {
  const nearestWeather = getNearestWeatherCell(
    weatherCells,
    aircraft.latitude,
    aircraft.longitude,
  );

  if (!nearestWeather) {
    return null;
  }

  return getWeatherAlertLevel(nearestWeather) === "red" ? "HIGH RISK" : null;
}

export function enrichAircraftWithRisk(
  aircraft: Aircraft,
  weatherCells: WeatherCell[],
): Aircraft {
  const nearestWeather = getNearestWeatherCell(
    weatherCells,
    aircraft.latitude,
    aircraft.longitude,
  );
  const weatherAlertLevel = nearestWeather
    ? getWeatherAlertLevel(nearestWeather)
    : null;

  return {
    ...aircraft,
    nearest_weather_cell_key: nearestWeather?.cell_key ?? null,
    weather_alert_level: weatherAlertLevel,
    risk_flag: weatherAlertLevel === "red" ? "HIGH RISK" : null,
  };
}

export function enrichAircraftListWithRisk(
  aircraft: Aircraft[],
  weatherCells: WeatherCell[],
): Aircraft[] {
  if (aircraft.length === 0) {
    return aircraft;
  }

  return aircraft.map((item) => enrichAircraftWithRisk(item, weatherCells));
}
