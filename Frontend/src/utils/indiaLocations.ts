import { INDIA_CSV_CITY_LOCATIONS } from "./indiaCities";

export type IndiaLocation = {
  id: string;
  name: string;
  kind: "state" | "capital" | "region";
  state?: string;
  latitude: number;
  longitude: number;
  aliases?: string[];
};

export const INDIA_LOCATIONS: IndiaLocation[] = [
  { id: "delhi", name: "Delhi", kind: "capital", state: "National Capital Territory", latitude: 28.6139, longitude: 77.2090, aliases: ["new delhi", "ncr"] },
  { id: "andhra-pradesh", name: "Andhra Pradesh", kind: "state", latitude: 15.9129, longitude: 79.74, aliases: ["ap"] },
  { id: "itanagar", name: "Itanagar", kind: "capital", state: "Arunachal Pradesh", latitude: 27.0844, longitude: 93.6053 },
  { id: "arunachal-pradesh", name: "Arunachal Pradesh", kind: "state", latitude: 28.218, longitude: 94.7278, aliases: ["arunachal"] },
  { id: "assam", name: "Assam", kind: "state", latitude: 26.2006, longitude: 92.9376 },
  { id: "dispur", name: "Dispur", kind: "capital", state: "Assam", latitude: 26.1433, longitude: 91.7898 },
  { id: "bihar", name: "Bihar", kind: "state", latitude: 25.0961, longitude: 85.3131 },
  { id: "patna", name: "Patna", kind: "capital", state: "Bihar", latitude: 25.5941, longitude: 85.1376 },
  { id: "chhattisgarh", name: "Chhattisgarh", kind: "state", latitude: 21.2787, longitude: 81.8661 },
  { id: "raipur", name: "Raipur", kind: "capital", state: "Chhattisgarh", latitude: 21.2514, longitude: 81.6296 },
  { id: "goa", name: "Goa", kind: "state", latitude: 15.2993, longitude: 74.124, aliases: ["state of goa"] },
  { id: "panaji", name: "Panaji", kind: "capital", state: "Goa", latitude: 15.4909, longitude: 73.8278, aliases: ["ponjim"] },
  { id: "gujarat", name: "Gujarat", kind: "state", latitude: 22.2587, longitude: 71.1924 },
  { id: "gandhinagar", name: "Gandhinagar", kind: "capital", state: "Gujarat", latitude: 23.2156, longitude: 72.6369 },
  { id: "haryana", name: "Haryana", kind: "state", latitude: 29.0588, longitude: 76.0856 },
  { id: "chandigarh-haryana", name: "Chandigarh", kind: "capital", state: "Haryana", latitude: 30.7333, longitude: 76.7794 },
  { id: "himachal-pradesh", name: "Himachal Pradesh", kind: "state", latitude: 31.1048, longitude: 77.1734, aliases: ["hp"] },
  { id: "shimla", name: "Shimla", kind: "capital", state: "Himachal Pradesh", latitude: 31.1048, longitude: 77.1734 },
  { id: "jammu-and-kashmir", name: "Jammu and Kashmir", kind: "state", latitude: 33.7782, longitude: 75.5762, aliases: ["jk", "j&k"] },
  { id: "srinagar", name: "Srinagar", kind: "capital", state: "Jammu and Kashmir", latitude: 34.08565, longitude: 74.80555, aliases: ["summer capital"] },
  { id: "ladakh", name: "Ladakh", kind: "state", latitude: 34.2268, longitude: 77.5619, aliases: ["leh-ladakh"] },
  { id: "leh", name: "Leh", kind: "capital", state: "Ladakh", latitude: 34.1526, longitude: 77.5771, aliases: ["leh-ladakh"] },
  { id: "jharkhand", name: "Jharkhand", kind: "state", latitude: 23.61, longitude: 85.2799 },
  { id: "ranchi", name: "Ranchi", kind: "capital", state: "Jharkhand", latitude: 23.3441, longitude: 85.3096 },
  { id: "karnataka", name: "Karnataka", kind: "state", latitude: 15.3173, longitude: 75.7139, aliases: ["ka"] },
  { id: "bengaluru", name: "Bengaluru", kind: "capital", state: "Karnataka", latitude: 12.9716, longitude: 77.5946, aliases: ["bangalore"] },
  { id: "kerala", name: "Kerala", kind: "state", latitude: 10.8505, longitude: 76.2711 },
  { id: "thiruvananthapuram", name: "Thiruvananthapuram", kind: "capital", state: "Kerala", latitude: 8.5241, longitude: 76.9366, aliases: ["trivandrum"] },
  { id: "madhya-pradesh", name: "Madhya Pradesh", kind: "state", latitude: 22.9734, longitude: 78.6569, aliases: ["mp"] },
  { id: "bhopal", name: "Bhopal", kind: "capital", state: "Madhya Pradesh", latitude: 23.2599, longitude: 77.4126 },
  { id: "maharashtra", name: "Maharashtra", kind: "state", latitude: 19.7515, longitude: 75.7139, aliases: ["mh"] },
  { id: "mumbai", name: "Mumbai", kind: "capital", state: "Maharashtra", latitude: 19.076, longitude: 72.8777, aliases: ["bombay"] },
  { id: "manipur", name: "Manipur", kind: "state", latitude: 24.6637, longitude: 93.9063 },
  { id: "imphal", name: "Imphal", kind: "capital", state: "Manipur", latitude: 24.817, longitude: 93.9368 },
  { id: "meghalaya", name: "Meghalaya", kind: "state", latitude: 25.467, longitude: 91.3662 },
  { id: "shillong", name: "Shillong", kind: "capital", state: "Meghalaya", latitude: 25.5788, longitude: 91.8933 },
  { id: "mizoram", name: "Mizoram", kind: "state", latitude: 23.1645, longitude: 92.9376 },
  { id: "aizawl", name: "Aizawl", kind: "capital", state: "Mizoram", latitude: 23.7271, longitude: 92.7176 },
  { id: "nagaland", name: "Nagaland", kind: "state", latitude: 26.1584, longitude: 94.5624 },
  { id: "kohima", name: "Kohima", kind: "capital", state: "Nagaland", latitude: 25.6751, longitude: 94.1086 },
  { id: "odisha", name: "Odisha", kind: "state", latitude: 20.9517, longitude: 85.0985, aliases: ["orissa"] },
  { id: "bhubaneswar", name: "Bhubaneswar", kind: "capital", state: "Odisha", latitude: 20.2961, longitude: 85.8245 },
  { id: "punjab", name: "Punjab", kind: "state", latitude: 31.1471, longitude: 75.3412 },
  { id: "chandigarh-punjab", name: "Chandigarh", kind: "capital", state: "Punjab", latitude: 30.7333, longitude: 76.7794 },
  { id: "rajasthan", name: "Rajasthan", kind: "state", latitude: 27.0238, longitude: 74.2179, aliases: ["rj"] },
  { id: "jaipur", name: "Jaipur", kind: "capital", state: "Rajasthan", latitude: 26.9124, longitude: 75.7873 },
  { id: "sikkim", name: "Sikkim", kind: "state", latitude: 27.533, longitude: 88.5122 },
  { id: "gangtok", name: "Gangtok", kind: "capital", state: "Sikkim", latitude: 27.3389, longitude: 88.6065 },
  { id: "tamil-nadu", name: "Tamil Nadu", kind: "state", latitude: 11.1271, longitude: 78.6569, aliases: ["tn"] },
  { id: "chennai", name: "Chennai", kind: "capital", state: "Tamil Nadu", latitude: 13.0827, longitude: 80.2707, aliases: ["madras"] },
  { id: "telangana", name: "Telangana", kind: "state", latitude: 18.1124, longitude: 79.0193, aliases: ["ts"] },
  { id: "hyderabad", name: "Hyderabad", kind: "capital", state: "Telangana", latitude: 17.385, longitude: 78.4867 },
  { id: "tripura", name: "Tripura", kind: "state", latitude: 23.9408, longitude: 91.9882 },
  { id: "agartala", name: "Agartala", kind: "capital", state: "Tripura", latitude: 23.8315, longitude: 91.2868 },
  { id: "uttar-pradesh", name: "Uttar Pradesh", kind: "state", latitude: 26.8467, longitude: 80.9462, aliases: ["up"] },
  { id: "lucknow", name: "Lucknow", kind: "capital", state: "Uttar Pradesh", latitude: 26.8467, longitude: 80.9462 },
  { id: "uttarakhand", name: "Uttarakhand", kind: "state", latitude: 30.0668, longitude: 79.0193, aliases: ["uk state"] },
  { id: "dehradun", name: "Dehradun", kind: "capital", state: "Uttarakhand", latitude: 30.3165, longitude: 78.0322 },
  { id: "west-bengal", name: "West Bengal", kind: "state", latitude: 22.9868, longitude: 87.855, aliases: ["wb"] },
  { id: "kolkata", name: "Kolkata", kind: "capital", state: "West Bengal", latitude: 22.5726, longitude: 88.3639, aliases: ["calcutta"] },

  ...INDIA_CSV_CITY_LOCATIONS,
];

export const INDIA_METRO_LOCATION_IDS = [
  "delhi",
  "mumbai",
  "kolkata",
  "chennai",
  "bengaluru",
  "hyderabad",
  "ahmedabad",
  "pune",
] as const;

function locationSearchText(location: IndiaLocation): string {
  return [
    location.name,
    location.kind,
    location.state ?? "",
    ...(location.aliases ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function normalizeLocationPart(value: string | undefined): string {
  const normalized = (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const aliases: Record<string, string> = {
    nct: "delhi",
    "national-capital-territory": "delhi",
    "national-capital-territory-of-delhi": "delhi",
    "new-delhi": "delhi",
    jk: "jammu-and-kashmir",
    jandk: "jammu-and-kashmir",
  };

  return aliases[normalized] ?? normalized;
}

export function getIndiaLocationIdentityKey(location: Pick<IndiaLocation, "name" | "state">): string {
  return `${normalizeLocationPart(location.name)}:${normalizeLocationPart(location.state ?? location.name)}`;
}

function locationKindPriority(kind: IndiaLocation["kind"]): number {
  if (kind === "state") return 0;
  if (kind === "capital") return 1;
  return 2;
}

export function searchIndiaLocations(query: string, limit = 6): IndiaLocation[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  const dedupedResults: IndiaLocation[] = [];
  const seen = new Set<string>();

  for (const location of INDIA_LOCATIONS
    .filter((candidate) => locationSearchText(candidate).includes(normalized))
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aStarts = aName.startsWith(normalized) ? 0 : 1;
      const bStarts = bName.startsWith(normalized) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.kind !== b.kind) return locationKindPriority(a.kind) - locationKindPriority(b.kind);
      return a.name.localeCompare(b.name);
    })) {
    const identityKey = getIndiaLocationIdentityKey(location);
    if (seen.has(identityKey)) {
      continue;
    }

    seen.add(identityKey);
    dedupedResults.push(location);

    if (dedupedResults.length >= limit) {
      break;
    }
  }

  return dedupedResults;
}
