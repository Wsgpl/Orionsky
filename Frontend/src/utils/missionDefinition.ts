import type {
  MissionDefinition,
  MissionExportModel,
  MissionGeometry,
  MissionMetadata,
  MissionPlannerGeometryMode,
  MissionRouteAnalysisModel,
} from "../types";

function normalizeMissionText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text.length > 0 ? text : null;
}

function normalizeMissionTags(tags: string[] | null | undefined): string[] {
  if (!tags || tags.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  tags.forEach((tag) => {
    const cleaned = normalizeMissionText(tag);
    if (!cleaned) {
      return;
    }

    const lowered = cleaned.toLowerCase();
    if (seen.has(lowered)) {
      return;
    }

    seen.add(lowered);
    normalized.push(cleaned);
  });

  return normalized;
}

export function buildMissionMetadata(options: {
  missionName?: string | null;
  description?: string | null;
  tags?: string[] | null;
  geometryMode?: MissionPlannerGeometryMode;
  attributes?: Record<string, unknown> | null;
} = {}): MissionMetadata {
  const attributes: Record<string, unknown> = {
    ...(options.attributes ?? {}),
  };

  if (options.geometryMode) {
    attributes.geometry_mode = options.geometryMode;
  }

  return {
    name: normalizeMissionText(options.missionName),
    description: normalizeMissionText(options.description),
    tags: normalizeMissionTags(options.tags),
    attributes: Object.keys(attributes).length > 0 ? attributes : null,
  };
}

export function buildMissionDefinition(
  metadata: MissionMetadata,
  geometry: MissionGeometry,
): MissionDefinition {
  const normalizedName = normalizeMissionText(metadata.name) ?? geometry.name ?? null;

  return {
    metadata: {
      ...metadata,
      name: normalizedName,
    },
    geometry: {
      ...geometry,
      name: normalizedName,
    },
  };
}

export function buildMissionExportModel(
  metadata: MissionMetadata,
  geometry: MissionGeometry,
): MissionExportModel {
  return buildMissionDefinition(metadata, geometry);
}

export function buildMissionRouteAnalysisModel(
  metadata: MissionMetadata,
  geometry: MissionRouteAnalysisModel["geometry"],
): MissionRouteAnalysisModel {
  return buildMissionDefinition(metadata, geometry) as MissionRouteAnalysisModel;
}
