import type { Aircraft } from "../types";
import { normalizeCallsign } from "./airline";

export type AircraftOperationalClassification = "Helicopter" | "Commercial" | "Private";

type ClassificationIdentity = Pick<
  Aircraft,
  "category" | "aircraft_type" | "callsign" | "velocity" | "altitude"
>;

const HELICOPTER_ALTITUDE_MAX_FT = 8000;
const HELICOPTER_SPEED_MAX_KMH = 200;
const COMMERCIAL_ALTITUDE_MIN_FT = 18000;
const COMMERCIAL_SPEED_MIN_KMH = 350;
const COMMERCIAL_CALLSIGN_PATTERN = /^(?:[A-Z]{3}\d{2,4}|[A-Z]{2}\d{2,4})$/;
const COMMERCIAL_KEYWORDS = [
  "airbus",
  "airliner",
  "airline",
  "boeing",
  "commercial",
  "passenger",
  "turbofan",
];
const HELICOPTER_KEYWORDS = [
  "heli",
  "helicopter",
  "rotor",
  "rotorcraft",
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function joinedTypeText(aircraft: ClassificationIdentity): string {
  return [aircraft.aircraft_type, aircraft.category]
    .map((value) => normalize(value))
    .filter(Boolean)
    .join(" ");
}

function looksLikeCommercialCallsign(callsign: string | null): boolean {
  const normalized = normalizeCallsign(callsign);
  return COMMERCIAL_CALLSIGN_PATTERN.test(normalized);
}

export function getAircraftClassification(
  aircraft: ClassificationIdentity,
): AircraftOperationalClassification {
  const typeText = joinedTypeText(aircraft);

  // Guard against null/undefined values from the backend before numeric comparison.
  const alt = aircraft.altitude ?? 0;
  const spd = aircraft.velocity ?? 0;

  // Profile heuristic only fires when both altitude and speed are non-zero so
  // parked targets, NaN values, and commercial jets on short final (high alt, low spd)
  // or just after takeoff (low alt, accelerating) are not misclassified as Helicopter.
  const helicopterByProfile =
    alt > 0 &&
    spd > 0 &&
    alt <= HELICOPTER_ALTITUDE_MAX_FT &&
    spd <= HELICOPTER_SPEED_MAX_KMH;

  if (hasAnyKeyword(typeText, HELICOPTER_KEYWORDS) || helicopterByProfile) {
    return "Helicopter";
  }

  const commercialByProfile =
    alt >= COMMERCIAL_ALTITUDE_MIN_FT &&
    spd >= COMMERCIAL_SPEED_MIN_KMH &&
    looksLikeCommercialCallsign(aircraft.callsign);

  if (hasAnyKeyword(typeText, COMMERCIAL_KEYWORDS) || commercialByProfile) {
    return "Commercial";
  }

  return "Private";
}

export function enrichAircraftWithClassification(aircraft: Aircraft): Aircraft {
  return {
    ...aircraft,
    classification: getAircraftClassification(aircraft),
  };
}

export function enrichAircraftListWithClassification(aircraft: Aircraft[]): Aircraft[] {
  if (aircraft.length === 0) {
    return aircraft;
  }

  return aircraft.map((item) => enrichAircraftWithClassification(item));
}
