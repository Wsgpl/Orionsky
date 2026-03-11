import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useStore } from "../store";
import type {
  ActiveMissionState,
  MissionCoordinate,
  MissionDefinition,
  MissionHistoryItem,
  MissionExportKmlRequest,
  MissionExportModel,
  MissionExportTxtRequest,
  MissionMetadata,
  MissionPlannerGeometryMode,
  MissionPlannerPoint,
  MissionPlannerPointKind,
  PolygonPlannerPoint,
  RoutePlannerPoint,
  RoutePlannerPointKind,
  MissionRouteAnalysisModel,
  RouteRiskAnalyzeRequest,
  RouteRiskAnalyzeResponse,
} from "../types";
import { downloadFileBlob } from "../utils/fileDownload";
import {
  buildMissionDefinition,
  buildMissionExportModel,
  buildMissionMetadata,
  buildMissionRouteAnalysisModel,
} from "../utils/missionDefinition";
import {
  buildLineStringGeometry,
  buildMissionGeometrySummary,
  buildPolygonGeometry,
  isValidMissionCoordinate,
  normalizeMissionCoordinates,
  sampleLineStringGeometry,
} from "../utils/missionGeometry";

export type RouteAnalysisStatus = "idle" | "loading" | "success" | "unavailable" | "error";
export type RoutePlacementMode = RoutePlannerPointKind | "route_draw" | "polygon_draw" | null;
export type MissionExportFormat = "kml" | "txt";

export const ROUTE_SAMPLE_SPACING_OPTIONS_KM = [25, 50, 100, 150, 200] as const;

function createPlannerPointId(kind: MissionPlannerPointKind): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${kind}-${crypto.randomUUID()}`;
  }

  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPlannerPoint(
  kind: MissionPlannerPointKind,
  coordinate: MissionCoordinate,
  label: string,
): MissionPlannerPoint {
  return {
    id: createPlannerPointId(kind),
    kind,
    label,
    lat: coordinate.lat,
    lon: coordinate.lon,
    alt: coordinate.alt,
  };
}

function relabelWaypoints(waypoints: RoutePlannerPoint[]): RoutePlannerPoint[] {
  return waypoints.map((waypoint, index) => ({
    ...waypoint,
    label: `Waypoint ${index + 1}`,
  }));
}

function relabelPolygonVertices(vertices: PolygonPlannerPoint[]): PolygonPlannerPoint[] {
  return vertices.map((vertex, index) => ({
    ...vertex,
    label: `Vertex ${index + 1}`,
  }));
}

function missionCoordinateFromPoint(point: MissionPlannerPoint): MissionCoordinate {
  return {
    lat: point.lat,
    lon: point.lon,
    alt: point.alt,
  };
}

function buildRoutePlannerStateFromCoordinates(coordinates: MissionCoordinate[]): {
  origin: RoutePlannerPoint | null;
  destination: RoutePlannerPoint | null;
  waypoints: RoutePlannerPoint[];
} {
  const normalized = normalizeMissionCoordinates(coordinates);
  if (normalized.length === 0) {
    return {
      origin: null,
      destination: null,
      waypoints: [],
    };
  }

  const origin = createPlannerPoint("origin", normalized[0], "Origin") as RoutePlannerPoint;
  if (normalized.length === 1) {
    return {
      origin,
      destination: null,
      waypoints: [],
    };
  }

  const destination = createPlannerPoint(
    "destination",
    normalized[normalized.length - 1],
    "Destination",
  ) as RoutePlannerPoint;
  const waypoints = relabelWaypoints(
    normalized.slice(1, -1).map((coordinate, index) => (
      createPlannerPoint("waypoint", coordinate, `Waypoint ${index + 1}`) as RoutePlannerPoint
    )),
  );

  return {
    origin,
    destination,
    waypoints,
  };
}

function buildPolygonPlannerStateFromCoordinates(coordinates: MissionCoordinate[]): PolygonPlannerPoint[] {
  const normalized = normalizeMissionCoordinates(coordinates);
  const openRing =
    normalized.length >= 2 &&
    normalized[0].lat === normalized[normalized.length - 1].lat &&
    normalized[0].lon === normalized[normalized.length - 1].lon
      ? normalized.slice(0, -1)
      : normalized;

  return relabelPolygonVertices(
    openRing.map((coordinate, index) => (
      createPlannerPoint("polygon_vertex", coordinate, `Vertex ${index + 1}`) as PolygonPlannerPoint
    )),
  );
}

function buildRouteGeometryMetadata(
  origin: RoutePlannerPoint | null,
  destination: RoutePlannerPoint | null,
  waypoints: RoutePlannerPoint[],
) {
  return {
    source: "route_planner",
    planner_mode: "route",
    origin_label: origin?.label ?? null,
    destination_label: destination?.label ?? null,
    waypoint_count: waypoints.length,
  };
}

function buildPolygonGeometryMetadata(vertices: PolygonPlannerPoint[]) {
  return {
    source: "route_planner",
    planner_mode: "polygon",
    vertex_count: vertices.length,
  };
}

function missionNameFromDefinition(mission: MissionDefinition): string {
  return (mission.metadata.name ?? mission.geometry.name ?? "").trim();
}

function missionSupportsRouteAnalysis(mission: MissionDefinition): mission is MissionRouteAnalysisModel {
  return mission.geometry.type === "LineString" && mission.geometry.coordinates.length >= 2;
}

async function getErrorMessage(error: unknown): Promise<string> {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      response?: {
        status?: number;
        data?: Blob | {
          detail?: string;
        };
      };
      message?: string;
    };

    if (
      candidate.response?.data &&
      typeof Blob !== "undefined" &&
      candidate.response.data instanceof Blob
    ) {
      try {
        const text = await candidate.response.data.text();
        const parsed = JSON.parse(text) as { detail?: string };
        if (parsed.detail) {
          return parsed.detail;
        }
      } catch {
        // Ignore blob parsing failures and fall back to generic handling.
      }
    }

    if (
      candidate.response?.data &&
      typeof candidate.response.data === "object" &&
      "detail" in candidate.response.data &&
      typeof candidate.response.data.detail === "string"
    ) {
      return candidate.response.data.detail;
    }

    if (candidate.message) {
      return candidate.message;
    }
  }

  return "Request failed.";
}

function isUnavailableError(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      response?: {
        status?: number;
      };
      message?: string;
    };

    if (candidate.response?.status === 404 || candidate.response?.status === 405 || candidate.response?.status === 501) {
      return true;
    }

    return (candidate.message ?? "").toLowerCase().includes("404");
  }

  return false;
}

export function useRoutePlanner() {
  const authSession = useStore((state) => state.authSession);
  const [missionName, setMissionName] = useState("");
  const [geometryMode, setGeometryMode] = useState<MissionPlannerGeometryMode>("route");
  const [origin, setOrigin] = useState<RoutePlannerPoint | null>(null);
  const [destination, setDestination] = useState<RoutePlannerPoint | null>(null);
  const [waypoints, setWaypoints] = useState<RoutePlannerPoint[]>([]);
  const [polygonVertices, setPolygonVertices] = useState<PolygonPlannerPoint[]>([]);
  const [placementMode, setPlacementMode] = useState<RoutePlacementMode>(null);
  const [sampleSpacingKm, setSampleSpacingKm] = useState<number>(100);
  const [analysisStatus, setAnalysisStatus] = useState<RouteAnalysisStatus>("idle");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysis, setAnalysis] = useState<RouteRiskAnalyzeResponse | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<MissionExportFormat | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [missionHistory, setMissionHistory] = useState<MissionHistoryItem[]>([]);
  const [missionHistoryLoading, setMissionHistoryLoading] = useState(false);
  const [missionHistoryError, setMissionHistoryError] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [historySaveLoading, setHistorySaveLoading] = useState(false);
  const exportLoading = exportingFormat !== null;

  const orderedRoutePoints = useMemo(() => {
    return [origin, ...waypoints, destination].filter(Boolean) as RoutePlannerPoint[];
  }, [destination, origin, waypoints]);

  const lineGeometry = useMemo(
    () =>
      buildLineStringGeometry(orderedRoutePoints, {
        name: missionName.trim() || null,
        metadata: buildRouteGeometryMetadata(origin, destination, waypoints),
      }),
    [destination, missionName, orderedRoutePoints, origin, waypoints],
  );

  const polygonGeometry = useMemo(
    () =>
      buildPolygonGeometry(polygonVertices, {
        name: missionName.trim() || null,
        metadata: buildPolygonGeometryMetadata(polygonVertices),
      }),
    [missionName, polygonVertices],
  );

  const missionGeometry = geometryMode === "polygon" ? polygonGeometry : lineGeometry;
  const missionMetadata = useMemo<MissionMetadata>(
    () =>
      buildMissionMetadata({
        missionName,
        geometryMode,
        attributes: {
          source: "route_planner",
        },
      }),
    [geometryMode, missionName],
  );
  const activeMission = useMemo<MissionDefinition | null>(
    () => (missionGeometry ? buildMissionDefinition(missionMetadata, missionGeometry) : null),
    [missionGeometry, missionMetadata],
  );
  const activeExportMission = useMemo<MissionExportModel | null>(
    () => (missionGeometry ? buildMissionExportModel(missionMetadata, missionGeometry) : null),
    [missionGeometry, missionMetadata],
  );
  const activeRouteAnalysisMission = useMemo<MissionRouteAnalysisModel | null>(
    () => (lineGeometry ? buildMissionRouteAnalysisModel(missionMetadata, lineGeometry) : null),
    [lineGeometry, missionMetadata],
  );
  const activeMissionState = useMemo<ActiveMissionState>(
    () => ({
      mission: activeMission,
      geometryMode,
      sampleSpacingKm,
    }),
    [activeMission, geometryMode, sampleSpacingKm],
  );

  const geometrySummary = useMemo(
    () => buildMissionGeometrySummary(missionGeometry),
    [missionGeometry],
  );

  const sampledCoordinates = useMemo(
    () =>
      geometryMode === "route"
        ? sampleLineStringGeometry(lineGeometry, sampleSpacingKm)
        : [],
    [geometryMode, lineGeometry, sampleSpacingKm],
  );

  const canAnalyze = Boolean(
    geometryMode === "route" &&
    lineGeometry &&
    lineGeometry.coordinates.length >= 2 &&
    origin &&
    destination,
  );
  const canSaveMission = Boolean(activeMission && missionName.trim() && authSession);

  const geometryFingerprint = useMemo(() => {
    return JSON.stringify({
      missionName,
      geometryMode,
      origin,
      destination,
      waypoints,
      polygonVertices,
      sampleSpacingKm,
    });
  }, [destination, geometryMode, missionName, origin, polygonVertices, sampleSpacingKm, waypoints]);

  useEffect(() => {
    setAnalysis(null);
    setAnalysisMessage(null);
    setAnalysisStatus("idle");
    setExportMessage(null);
    setHistoryMessage(null);
  }, [geometryFingerprint]);

  useEffect(() => {
    setPlacementMode(null);
  }, [geometryMode]);

  const refreshMissionHistory = async () => {
    if (!authSession) {
      setMissionHistory([]);
      setMissionHistoryError(null);
      setMissionHistoryLoading(false);
      return;
    }

    setMissionHistoryLoading(true);
    setMissionHistoryError(null);
    try {
      const response = await api.getMissionHistory();
      setMissionHistory(response.missions);
    } catch (error) {
      setMissionHistory([]);
      setMissionHistoryError(await getErrorMessage(error));
    } finally {
      setMissionHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!authSession) {
      setMissionHistory([]);
      setMissionHistoryError(null);
      setMissionHistoryLoading(false);
      return;
    }
    void refreshMissionHistory();
  }, [authSession]);

  const replaceRouteCoordinates = (coordinates: MissionCoordinate[]) => {
    const next = buildRoutePlannerStateFromCoordinates(coordinates);
    setOrigin(next.origin);
    setDestination(next.destination);
    setWaypoints(next.waypoints);
  };

  const replacePolygonCoordinates = (coordinates: MissionCoordinate[]) => {
    setPolygonVertices(buildPolygonPlannerStateFromCoordinates(coordinates));
  };

  const appendRouteDrawPoint = (coordinate: MissionCoordinate) => {
    replaceRouteCoordinates([
      ...orderedRoutePoints.map(missionCoordinateFromPoint),
      coordinate,
    ]);
  };

  const appendPolygonVertex = (coordinate: MissionCoordinate) => {
    replacePolygonCoordinates([
      ...polygonVertices.map(missionCoordinateFromPoint),
      coordinate,
    ]);
  };

  const handleMapPlacement = (coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate) || !placementMode) {
      return;
    }

    if (placementMode === "route_draw") {
      appendRouteDrawPoint(coordinate);
      return;
    }

    if (placementMode === "polygon_draw") {
      appendPolygonVertex(coordinate);
      return;
    }

    if (placementMode === "origin") {
      setOrigin(createPlannerPoint("origin", coordinate, "Origin") as RoutePlannerPoint);
    } else if (placementMode === "destination") {
      setDestination(createPlannerPoint("destination", coordinate, "Destination") as RoutePlannerPoint);
    } else {
      setWaypoints((current) =>
        relabelWaypoints([
          ...current,
          createPlannerPoint("waypoint", coordinate, `Waypoint ${current.length + 1}`) as RoutePlannerPoint,
        ]),
      );
    }

    setPlacementMode(null);
  };

  const updateOrigin = (coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate)) {
      return;
    }

    setOrigin((current) =>
      current
        ? { ...current, lat: coordinate.lat, lon: coordinate.lon, alt: coordinate.alt }
        : (createPlannerPoint("origin", coordinate, "Origin") as RoutePlannerPoint),
    );
  };

  const updateDestination = (coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate)) {
      return;
    }

    setDestination((current) =>
      current
        ? { ...current, lat: coordinate.lat, lon: coordinate.lon, alt: coordinate.alt }
        : (createPlannerPoint("destination", coordinate, "Destination") as RoutePlannerPoint),
    );
  };

  const updateWaypoint = (waypointId: string, coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate)) {
      return;
    }

    setWaypoints((current) =>
      current.map((waypoint) =>
        waypoint.id === waypointId
          ? { ...waypoint, lat: coordinate.lat, lon: coordinate.lon, alt: coordinate.alt }
          : waypoint,
      ),
    );
  };

  const updatePolygonVertex = (vertexId: string, coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate)) {
      return;
    }

    setPolygonVertices((current) =>
      current.map((vertex) =>
        vertex.id === vertexId
          ? { ...vertex, lat: coordinate.lat, lon: coordinate.lon, alt: coordinate.alt }
          : vertex,
      ),
    );
  };

  const removeWaypoint = (waypointId: string) => {
    setWaypoints((current) => relabelWaypoints(current.filter((waypoint) => waypoint.id !== waypointId)));
  };

  const insertRoutePoint = (afterIndex: number, coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate)) {
      return;
    }

    const current = orderedRoutePoints.map(missionCoordinateFromPoint);
    const insertionIndex = Math.max(0, Math.min(afterIndex + 1, current.length));
    replaceRouteCoordinates([
      ...current.slice(0, insertionIndex),
      coordinate,
      ...current.slice(insertionIndex),
    ]);
  };

  const removeRoutePoint = (pointId: string) => {
    replaceRouteCoordinates(
      orderedRoutePoints
        .filter((point) => point.id !== pointId)
        .map(missionCoordinateFromPoint),
    );
  };

  const insertPolygonVertex = (afterIndex: number, coordinate: MissionCoordinate) => {
    if (!isValidMissionCoordinate(coordinate)) {
      return;
    }

    const current = polygonVertices.map(missionCoordinateFromPoint);
    const insertionIndex = Math.max(0, Math.min(afterIndex + 1, current.length));
    replacePolygonCoordinates([
      ...current.slice(0, insertionIndex),
      coordinate,
      ...current.slice(insertionIndex),
    ]);
  };

  const removePolygonVertex = (vertexId: string) => {
    setPolygonVertices((current) => relabelPolygonVertices(current.filter((vertex) => vertex.id !== vertexId)));
  };

  const clearCurrentGeometry = () => {
    if (geometryMode === "polygon") {
      setPolygonVertices([]);
      setPlacementMode(null);
      return;
    }

    setOrigin(null);
    setDestination(null);
    setWaypoints([]);
    setPlacementMode(null);
  };

  const runRouteAnalysis = async (
    missionToAnalyze: MissionRouteAnalysisModel,
    spacingKm: number,
  ) => {
    const payload: RouteRiskAnalyzeRequest = {
      mission: missionToAnalyze,
      sample_spacing_km: spacingKm,
    };

    setAnalysisLoading(true);
    setAnalysisStatus("loading");
    setAnalysisMessage(null);

    try {
      const response = await api.analyzeRouteRisk(payload);
      setAnalysis(response);
      setAnalysisStatus("success");
    } catch (error) {
      setAnalysis(null);
      if (isUnavailableError(error)) {
        setAnalysisStatus("unavailable");
        setAnalysisMessage(
          "Route analysis backend is unavailable. POST /api/v1/route-risk/analyze is not wired in the current backend.",
        );
      } else {
        setAnalysisStatus("error");
        setAnalysisMessage(await getErrorMessage(error));
      }
    } finally {
      setAnalysisLoading(false);
    }
  };

  const analyzeRoute = async () => {
    if (!canAnalyze || !activeRouteAnalysisMission) {
      return;
    }

    await runRouteAnalysis(activeRouteAnalysisMission, sampleSpacingKm);
  };

  const exportMission = async (format: MissionExportFormat) => {
    if (!activeExportMission) {
      return;
    }

    const payload: MissionExportKmlRequest | MissionExportTxtRequest = {
      mission: activeExportMission,
    };

    setExportingFormat(format);
    setExportMessage(null);

    try {
      const file = format === "kml"
        ? await api.exportMissionKml(payload)
        : await api.exportMissionTxt(payload);
      downloadFileBlob(file);
      setExportMessage(`Downloaded ${file.filename}.`);
    } catch (error) {
      if (isUnavailableError(error)) {
        setExportMessage(
          `Mission export backend is unavailable. POST /api/v1/mission-export/${format} is not wired.`,
        );
      } else {
        setExportMessage(await getErrorMessage(error));
      }
    } finally {
      setExportingFormat(null);
    }
  };

  const exportKml = async () => {
    await exportMission("kml");
  };

  const exportTxt = async () => {
    await exportMission("txt");
  };

  const loadMissionFromHistory = (item: MissionHistoryItem) => {
    const mission = item.mission;
    const nextMissionName = missionNameFromDefinition(mission);
    const nextGeometry = mission.geometry;

    setMissionName(nextMissionName);
    setSampleSpacingKm(item.sample_spacing_km ?? 100);
    setPlacementMode(null);
    setHistoryMessage(`Loaded ${item.mission_name}.`);

    if (nextGeometry.type === "Polygon") {
      setGeometryMode("polygon");
      replacePolygonCoordinates(nextGeometry.coordinates);
      setOrigin(null);
      setDestination(null);
      setWaypoints([]);
      return;
    }

    setGeometryMode("route");
    replaceRouteCoordinates(nextGeometry.coordinates);
    setPolygonVertices([]);
  };

  const loadMissionFromHistoryAndAnalyze = async (item: MissionHistoryItem) => {
    loadMissionFromHistory(item);

    if (!missionSupportsRouteAnalysis(item.mission)) {
      setAnalysis(null);
      setAnalysisStatus("unavailable");
      setAnalysisMessage("Saved polygons can be reloaded, but route risk analysis currently requires a LineString mission.");
      return;
    }

    await runRouteAnalysis(
      buildMissionRouteAnalysisModel(item.mission.metadata, item.mission.geometry),
      item.sample_spacing_km ?? 100,
    );
  };

  const saveMissionToHistory = async () => {
    if (!authSession) {
      setHistoryMessage("Sign in before saving mission history.");
      return;
    }

    if (!activeMission || !missionName.trim()) {
      setHistoryMessage("Enter a mission name before saving.");
      return;
    }

    setHistorySaveLoading(true);
    setMissionHistoryError(null);
    setHistoryMessage(null);

    try {
      const savedMission = await api.saveMissionHistory({
        mission: activeMission,
        sample_spacing_km: geometryMode === "route" ? sampleSpacingKm : undefined,
      });
      setMissionHistory((current) => [
        savedMission,
        ...current.filter((item) => item.mission_id !== savedMission.mission_id),
      ]);
      setHistoryMessage(`Saved ${savedMission.mission_name} to mission history.`);
    } catch (error) {
      setHistoryMessage(await getErrorMessage(error));
    } finally {
      setHistorySaveLoading(false);
    }
  };

  return {
    authSession,
    missionName,
    setMissionName,
    geometryMode,
    setGeometryMode,
    missionMetadata,
    missionGeometry,
    activeMission,
    activeMissionState,
    geometrySummary,
    origin,
    destination,
    waypoints,
    polygonVertices,
    orderedRoutePoints,
    placementMode,
    setPlacementMode,
    handleMapPlacement,
    updateOrigin,
    updateDestination,
    updateWaypoint,
    updatePolygonVertex,
    insertRoutePoint,
    insertPolygonVertex,
    removeRoutePoint,
    removeWaypoint,
    removePolygonVertex,
    clearCurrentGeometry,
    lineGeometry,
    polygonGeometry,
    sampleSpacingKm,
    setSampleSpacingKm,
    sampledCoordinates,
    canAnalyze,
    analysisStatus,
    analysisLoading,
    analysis,
    analysisMessage,
    analyzeRoute,
    exportLoading,
    exportingFormat,
    exportMessage,
    exportKml,
    exportTxt,
    canSaveMission,
    missionHistory,
    missionHistoryLoading,
    missionHistoryError,
    historyMessage,
    historySaveLoading,
    refreshMissionHistory,
    saveMissionToHistory,
    loadMissionFromHistory,
    loadMissionFromHistoryAndAnalyze,
  };
}
