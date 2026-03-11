import type { Aircraft, AircraftFilters } from "../types";
import { getTargetKind } from "./aircraftClassification";

export const DEFAULT_AIRCRAFT_FILTERS: AircraftFilters = {
  altitudeMin: null,
  altitudeMax: null,
  speedMin: null,
  aircraftType: "all",
};

const AIRCRAFT_TYPE_ORDER = [
  "Plane",
  "Cargo Plane",
  "Business Jet",
  "Helicopter",
  "Military",
  "Glider",
  "Seaplane",
  "Balloon",
] as const;

export function getAircraftFilterType(aircraft: Aircraft): string {
  return getTargetKind(aircraft);
}

export function getAircraftTypeOptions(aircraft: Aircraft[]): string[] {
  return Array.from(new Set(aircraft.map((item) => getAircraftFilterType(item))))
    .sort((a, b) => {
      const aIndex = AIRCRAFT_TYPE_ORDER.indexOf(a as (typeof AIRCRAFT_TYPE_ORDER)[number]);
      const bIndex = AIRCRAFT_TYPE_ORDER.indexOf(b as (typeof AIRCRAFT_TYPE_ORDER)[number]);

      if (aIndex === -1 && bIndex === -1) {
        return a.localeCompare(b);
      }
      if (aIndex === -1) {
        return 1;
      }
      if (bIndex === -1) {
        return -1;
      }

      return aIndex - bIndex;
    });
}

export function applyAircraftFilters(
  aircraft: Aircraft[],
  filters: AircraftFilters,
): Aircraft[] {
  return aircraft.filter((item) => {
    if (filters.altitudeMin !== null && item.altitude < filters.altitudeMin) {
      return false;
    }

    if (filters.altitudeMax !== null && item.altitude > filters.altitudeMax) {
      return false;
    }

    if (filters.speedMin !== null && item.velocity < filters.speedMin) {
      return false;
    }

    if (filters.aircraftType !== "all" && getAircraftFilterType(item) !== filters.aircraftType) {
      return false;
    }

    return true;
  });
}
