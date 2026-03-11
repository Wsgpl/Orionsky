import type { Aircraft } from "../types";

function fallbackStatus(aircraft: Aircraft): string {
  if (aircraft.on_ground) {
    return aircraft.velocity >= 20 ? "taxiing" : "ground";
  }

  if (aircraft.altitude < 5000) {
    return "departing";
  }

  return "airborne";
}

export function getFlightStatus(aircraft: Aircraft): string {
  return aircraft.flight_status ?? fallbackStatus(aircraft);
}

export function getFlightStatusLabel(aircraft: Aircraft): string {
  const status = getFlightStatus(aircraft);

  switch (status) {
    case "departing":
      return "DEPARTING";
    case "arriving":
      return "ARRIVING";
    case "taxiing":
      return "TAXIING";
    case "recently_landed":
      return "RECENTLY LANDED";
    case "ground":
      return "ON GROUND";
    default:
      return "AIRBORNE";
  }
}

export function isSurfaceActive(aircraft: Aircraft): boolean {
  const status = getFlightStatus(aircraft);
  return status === "taxiing" || status === "recently_landed";
}
