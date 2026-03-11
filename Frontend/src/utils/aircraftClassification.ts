import type { Aircraft } from "../types";

type TargetIdentity = Pick<Aircraft, "aircraft_type" | "category" | "callsign">;

const HELICOPTER_KEYWORDS = ["helicopter", "heli", "rotorcraft", "rotary"];
const GLIDER_KEYWORDS = ["glider", "sailplane"];
const SEAPLANE_KEYWORDS = ["seaplane", "floatplane", "amphib"];
const BALLOON_KEYWORDS = ["balloon", "airship", "blimp"];
const MILITARY_KEYWORDS = ["fighter", "military", "air force", "navy", "army", "surveillance", "recon"];
const CARGO_KEYWORDS = ["cargo", "freighter", "freight"];
const BUSINESS_KEYWORDS = ["business", "bizjet", "corporate", "executive"];
const PLANE_KEYWORDS = [
  "plane",
  "aircraft",
  "airliner",
  "passenger",
  "jet",
  "turboprop",
  "boeing",
  "airbus",
  "embraer",
  "cessna",
  "beech",
  "bombardier",
  "atr",
  "dash",
  "twin otter",
];
const MODEL_CODE_PATTERN = /\b(a\d{3}|a20n|a21n|a359|a388|b\d{3,4}|b38m|b39m|b78x|e\d{3}|crj\d+|dhc[- ]?\d+|atr[- ]?\d+|c\d{3}|pc[- ]?\d+)\b/i;

function normalize(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function joinedText(identity: TargetIdentity): string {
  return [identity.aircraft_type, identity.category, identity.callsign]
    .map((value) => normalize(value)?.toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getTargetKind(identity: TargetIdentity): string {
  const text = joinedText(identity);

  if (hasKeyword(text, HELICOPTER_KEYWORDS)) {
    return "Helicopter";
  }
  if (hasKeyword(text, GLIDER_KEYWORDS)) {
    return "Glider";
  }
  if (hasKeyword(text, SEAPLANE_KEYWORDS)) {
    return "Seaplane";
  }
  if (hasKeyword(text, BALLOON_KEYWORDS)) {
    return "Balloon";
  }
  if (hasKeyword(text, MILITARY_KEYWORDS)) {
    return "Military";
  }
  if (hasKeyword(text, CARGO_KEYWORDS)) {
    return "Cargo Plane";
  }
  if (hasKeyword(text, BUSINESS_KEYWORDS)) {
    return "Business Jet";
  }
  if (hasKeyword(text, PLANE_KEYWORDS) || MODEL_CODE_PATTERN.test(text)) {
    return "Plane";
  }

  return "Plane";
}

export function getTargetDetail(identity: TargetIdentity): string | null {
  return normalize(identity.aircraft_type) ?? normalize(identity.category);
}

export function getTargetSummary(identity: TargetIdentity): string {
  const kind = getTargetKind(identity);
  const detail = getTargetDetail(identity);

  if (!detail) {
    return kind;
  }

  return detail.toLowerCase() === kind.toLowerCase() ? kind : `${kind} | ${detail}`;
}
