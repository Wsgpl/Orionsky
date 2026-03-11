import { Aircraft } from "../types";

export type AirlineInfo = {
  code: string;
  airline: string;
  iata?: string;
  military?: boolean;
  color: string;
  accent?: string;
};

const DEFAULT_AIRLINE: AirlineInfo = {
  code: "UNK",
  airline: "Unknown Operator",
  color: "#3d87ff",
  accent: "#dce9ff",
};

const AIRLINE_MAP: Record<string, AirlineInfo> = {
  IGO: { code: "IGO", airline: "IndiGo", iata: "6E", color: "#2962ff", accent: "#dbe8ff" },
  AIC: { code: "AIC", airline: "Air India", iata: "AI", color: "#d32f2f", accent: "#ffd7d7" },
  AXB: { code: "AXB", airline: "Air India Express", iata: "IX", color: "#c62828", accent: "#fff0f0" },
  IAD: { code: "IAD", airline: "Air India", iata: "AI", color: "#d32f2f", accent: "#ffd7d7" },
  VTI: { code: "VTI", airline: "Akasa Air", iata: "QP", color: "#ffca28", accent: "#fff7d0" },
  SEJ: { code: "SEJ", airline: "SpiceJet", iata: "SG", color: "#ef6c00", accent: "#ffe3c6" },
  VTIST: { code: "VTIST", airline: "Vistara", iata: "UK", color: "#6a1b9a", accent: "#eedcff" },
  VTR: { code: "VTR", airline: "Vistara", iata: "UK", color: "#6a1b9a", accent: "#eedcff" },
  UK: { code: "UK", airline: "Vistara", iata: "UK", color: "#6a1b9a", accent: "#eedcff" },
  AIA: { code: "AIA", airline: "Alliance Air", iata: "9I", color: "#58a6ff", accent: "#dff0ff" },
  IAF: { code: "IAF", airline: "Indian Air Force", military: true, color: "#2e7d32", accent: "#dbf3df" },
  NAVY: { code: "NAVY", airline: "Indian Navy", military: true, color: "#2f855a", accent: "#def7e7" },
  QTR: { code: "QTR", airline: "Qatar Airways", iata: "QR", color: "#7b1f47", accent: "#f4dce7" },
  UAE: { code: "UAE", airline: "Emirates", iata: "EK", color: "#c62828", accent: "#ffe1e1" },
  ETD: { code: "ETD", airline: "Etihad Airways", iata: "EY", color: "#8d6e63", accent: "#f1e5df" },
  SIA: { code: "SIA", airline: "Singapore Airlines", iata: "SQ", color: "#f9a825", accent: "#fff1c4" },
  BAW: { code: "BAW", airline: "British Airways", iata: "BA", color: "#0d47a1", accent: "#d9e6ff" },
  DLH: { code: "DLH", airline: "Lufthansa", iata: "LH", color: "#0f2b70", accent: "#dbe3ff" },
  THY: { code: "THY", airline: "Turkish Airlines", iata: "TK", color: "#b71c1c", accent: "#ffdada" },
  KLM: { code: "KLM", airline: "KLM", iata: "KL", color: "#0288d1", accent: "#daf2ff" },
  AFR: { code: "AFR", airline: "Air France", iata: "AF", color: "#283593", accent: "#dfe3ff" },
  JBU: { code: "JBU", airline: "JetBlue", iata: "B6", color: "#1565c0", accent: "#d9eaff" },
  UAL: { code: "UAL", airline: "United Airlines", iata: "UA", color: "#1e4fa1", accent: "#deebff" },
  AAL: { code: "AAL", airline: "American Airlines", iata: "AA", color: "#607d8b", accent: "#e4edf1" },
  DAL: { code: "DAL", airline: "Delta Air Lines", iata: "DL", color: "#c2185b", accent: "#ffdce9" },
  CPA: { code: "CPA", airline: "Cathay Pacific", iata: "CX", color: "#00796b", accent: "#dcf7f1" },
  ANA: { code: "ANA", airline: "All Nippon Airways", iata: "NH", color: "#1565c0", accent: "#dcecff" },
  JAL: { code: "JAL", airline: "Japan Airlines", iata: "JL", color: "#d32f2f", accent: "#ffe0e0" },
};

const PREFIX_ALIASES: Record<string, string> = {
  "6E": "IGO",
  AI: "AIC",
  IX: "AXB",
  SG: "SEJ",
  UK: "UK",
  QP: "VTI",
  "9I": "AIA",
  QR: "QTR",
  EK: "UAE",
  EY: "ETD",
  SQ: "SIA",
  BA: "BAW",
  LH: "DLH",
  TK: "THY",
  KL: "KLM",
  AF: "AFR",
  B6: "JBU",
  UA: "UAL",
  AA: "AAL",
  DL: "DAL",
  CX: "CPA",
  NH: "ANA",
  JL: "JAL",
};

export function normalizeCallsign(callsign: string | null): string {
  return (callsign ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function resolveCode(callsign: string | null): string {
  const normalized = normalizeCallsign(callsign);
  if (!normalized) return DEFAULT_AIRLINE.code;

  const numericPrefix = normalized.slice(0, 2);
  if (PREFIX_ALIASES[numericPrefix]) return PREFIX_ALIASES[numericPrefix];

  const three = normalized.slice(0, 3);
  if (AIRLINE_MAP[three]) return three;

  const two = normalized.slice(0, 2);
  if (PREFIX_ALIASES[two]) return PREFIX_ALIASES[two];

  if (normalized.includes("AIRFORCE") || normalized.includes("MIL") || normalized.includes("NAVY")) {
    return "IAF";
  }

  return DEFAULT_AIRLINE.code;
}

export function getAirlineInfo(callsign: string | null): AirlineInfo {
  const code = resolveCode(callsign);
  return AIRLINE_MAP[code] ?? DEFAULT_AIRLINE;
}

export function getFlightNumber(callsign: string | null): string {
  const normalized = normalizeCallsign(callsign);
  if (!normalized) return "UNKNOWN";
  return normalized;
}

export function aircraftSearchText(ac: Aircraft): string {
  const airline = getAirlineInfo(ac.callsign);
  return [
    ac.icao,
    normalizeCallsign(ac.callsign),
    getFlightNumber(ac.callsign),
    airline.airline,
    airline.code,
    airline.iata ?? "",
  ]
    .join(" ")
    .toLowerCase();
}
