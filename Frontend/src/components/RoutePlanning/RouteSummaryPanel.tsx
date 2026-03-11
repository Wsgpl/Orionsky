import type { MissionExportFormat, RoutePlacementMode } from "../../hooks/useRoutePlanner";
import type {
  AuthSession,
  MissionCoordinate,
  MissionGeometry,
  MissionHistoryItem,
  MissionPlannerGeometryMode,
  PolygonPlannerPoint,
  RoutePlannerPoint,
} from "../../types";
import { formatMissionCoordinate, type MissionGeometrySummary } from "../../utils/missionGeometry";
import { RouteGeometryPreviewMap } from "./RouteGeometryPreviewMap";

type RouteSummaryPanelProps = {
  missionName: string;
  geometryMode: MissionPlannerGeometryMode;
  missionGeometry: MissionGeometry | null;
  geometrySummary: MissionGeometrySummary;
  origin: RoutePlannerPoint | null;
  destination: RoutePlannerPoint | null;
  waypoints: RoutePlannerPoint[];
  polygonVertices: PolygonPlannerPoint[];
  sampleSpacingKm: number;
  sampleSpacingOptionsKm: readonly number[];
  sampledCoordinates: MissionCoordinate[];
  sampledPointCount: number;
  placementMode: RoutePlacementMode;
  canAnalyze: boolean;
  analysisLoading: boolean;
  exportLoading: boolean;
  exportingFormat: MissionExportFormat | null;
  exportMessage: string | null;
  authSession: AuthSession | null;
  canSaveMission: boolean;
  missionHistory: MissionHistoryItem[];
  missionHistoryLoading: boolean;
  missionHistoryError: string | null;
  historyMessage: string | null;
  historySaveLoading: boolean;
  onSetMissionName: (value: string) => void;
  onSetGeometryMode: (mode: MissionPlannerGeometryMode) => void;
  onSetPlacementMode: (mode: RoutePlacementMode) => void;
  onSetSampleSpacingKm: (spacingKm: number) => void;
  onRemoveRoutePoint: (pointId: string) => void;
  onRemovePolygonVertex: (vertexId: string) => void;
  onClearCurrentGeometry: () => void;
  onAnalyzeRoute: () => void;
  onExportKml: () => void;
  onExportTxt: () => void;
  onSaveMission: () => void;
  onRefreshHistory: () => void;
  onLoadMission: (item: MissionHistoryItem) => void;
  onAnalyzeSavedMission: (item: MissionHistoryItem) => void;
  onClose?: () => void;
  className?: string;
};



function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return "Unavailable";
  }

  return `${distanceKm.toFixed(1)} km`;
}

function formatArea(areaSqKm: number): string {
  if (!Number.isFinite(areaSqKm) || areaSqKm <= 0) {
    return "Unavailable";
  }

  return `${areaSqKm.toFixed(1)} km^2`;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pointPlacementLabel(mode: RoutePlacementMode, target: RoutePlacementMode): string {
  if (target === "route_draw") {
    return mode === target ? "DRAWING" : "DRAW ROUTE";
  }

  if (target === "polygon_draw") {
    return mode === target ? "DRAWING" : "DRAW POLYGON";
  }

  return mode === target ? "WAITING" : target === "waypoint" ? "ADD WAYPOINT" : `SET ${target?.toUpperCase()}`;
}

export function RouteSummaryPanel({
  missionName,
  geometryMode,
  missionGeometry,
  geometrySummary,
  origin,
  destination,
  waypoints,
  polygonVertices,
  sampleSpacingKm,
  sampleSpacingOptionsKm,
  sampledCoordinates,
  sampledPointCount,
  placementMode,
  canAnalyze,
  analysisLoading,
  exportLoading,
  exportingFormat,
  exportMessage,
  authSession,
  canSaveMission,
  missionHistory,
  missionHistoryLoading,
  missionHistoryError,
  historyMessage,
  historySaveLoading,
  onSetMissionName,
  onSetGeometryMode,
  onSetPlacementMode,
  onSetSampleSpacingKm,
  onRemoveRoutePoint,
  onRemovePolygonVertex,
  onClearCurrentGeometry,
  onAnalyzeRoute,
  onExportKml,
  onExportTxt,
  onSaveMission,
  onRefreshHistory,
  onLoadMission,
  onAnalyzeSavedMission,
  onClose,
  className = "",
}: RouteSummaryPanelProps) {
  const orderedRoutePoints = [origin, ...waypoints, destination].filter(Boolean) as RoutePlannerPoint[];
  const legCount = Math.max(orderedRoutePoints.length - 1, 0);
  const activeCoordinates =
    geometryMode === "polygon"
      ? polygonVertices
      : orderedRoutePoints;

  return (
    <section
      className={`planner-panel planner-panel--summary ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >


      <div className="planner-panel__header">
        <div>
          <div className="planner-panel__kicker">Mission Geometry</div>
          <h2 className="planner-panel__title">Normalized Planning Model</h2>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <button type="button" className="planner-btn planner-btn--ghost" onClick={onClearCurrentGeometry}>
            CLEAR CURRENT
          </button>
        </div>
      </div>


      <label className="planner-section-block">
        <div className="planner-section-block__title">Mission Name</div>
        <input
          type="text"
          className="planner-input"
          value={missionName}
          onChange={(event) => onSetMissionName(event.target.value)}
          placeholder="Optional mission name"
          maxLength={120}
        />
      </label>

      <div className="planner-section-block">
        <div className="planner-section-block__title">Geometry Type</div>
        <div className="planner-actions-grid">
          <button
            type="button"
            className={`planner-btn ${geometryMode === "route" ? "planner-btn--active" : ""}`}
            onClick={() => onSetGeometryMode("route")}
          >
            LINESTRING
          </button>
          <button
            type="button"
            className={`planner-btn ${geometryMode === "polygon" ? "planner-btn--active" : ""}`}
            onClick={() => onSetGeometryMode("polygon")}
          >
            POLYGON
          </button>
        </div>
      </div>

      <div className="planner-note">
        {geometryMode === "polygon"
          ? "Draw or refine a polygon footprint from real map clicks. Boundary clicks insert new vertices, drags edit them, and the geometry is normalized into a closed Polygon ring for backend and export reuse."
          : "Draw or refine a mission line from real map clicks. Segment clicks insert new vertices, drags edit them, and the geometry is normalized into a LineString for route analysis and export reuse."}
      </div>

      <div className="planner-actions-grid">
        {geometryMode === "polygon" ? (
          <button
            type="button"
            className={`planner-btn planner-btn--primary ${placementMode === "polygon_draw" ? "planner-btn--active" : ""}`}
            onClick={() => onSetPlacementMode(placementMode === "polygon_draw" ? null : "polygon_draw")}
          >
            {pointPlacementLabel(placementMode, "polygon_draw")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`planner-btn planner-btn--primary ${placementMode === "route_draw" ? "planner-btn--active" : ""}`}
              onClick={() => onSetPlacementMode(placementMode === "route_draw" ? null : "route_draw")}
            >
              {pointPlacementLabel(placementMode, "route_draw")}
            </button>
            <button
              type="button"
              className={`planner-btn ${placementMode === "origin" ? "planner-btn--active" : ""}`}
              onClick={() => onSetPlacementMode(placementMode === "origin" ? null : "origin")}
            >
              {pointPlacementLabel(placementMode, "origin")}
            </button>
            <button
              type="button"
              className={`planner-btn ${placementMode === "destination" ? "planner-btn--active" : ""}`}
              onClick={() => onSetPlacementMode(placementMode === "destination" ? null : "destination")}
            >
              {pointPlacementLabel(placementMode, "destination")}
            </button>
            <button
              type="button"
              className={`planner-btn planner-btn--ghost ${placementMode === "waypoint" ? "planner-btn--active" : ""}`}
              onClick={() => onSetPlacementMode(placementMode === "waypoint" ? null : "waypoint")}
            >
              {pointPlacementLabel(placementMode, "waypoint")}
            </button>
          </>
        )}
      </div>

      <div className="planner-metric-grid">
        <div className="planner-metric-card">
          <span className="planner-metric-card__label">
            {geometryMode === "polygon" ? "Perimeter" : "Route Distance"}
          </span>
          <span className="planner-metric-card__value">{formatDistance(geometrySummary.totalDistanceKm)}</span>
        </div>
        <div className="planner-metric-card">
          <span className="planner-metric-card__label">
            {geometryMode === "polygon" ? "Area" : "Leg Count"}
          </span>
          <span className="planner-metric-card__value">
            {geometryMode === "polygon" ? formatArea(geometrySummary.areaSqKm) : legCount}
          </span>
        </div>
        <div className="planner-metric-card">
          <span className="planner-metric-card__label">
            {geometryMode === "polygon" ? "Vertex Count" : "Sample Points"}
          </span>
          <span className="planner-metric-card__value">
            {geometryMode === "polygon" ? polygonVertices.length : sampledPointCount}
          </span>
        </div>
        <label className="planner-metric-card planner-metric-card--select">
          <span className="planner-metric-card__label">
            {geometryMode === "polygon" ? "Closed Ring" : "Sample Spacing"}
          </span>
          {geometryMode === "polygon" ? (
            <span className="planner-metric-card__value">{geometrySummary.isClosed ? "YES" : "NO"}</span>
          ) : (
            <select
              className="planner-select"
              value={sampleSpacingKm}
              onChange={(event) => onSetSampleSpacingKm(Number(event.target.value))}
            >
              {sampleSpacingOptionsKm.map((spacingKm) => (
                <option key={spacingKm} value={spacingKm}>
                  {spacingKm} km
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      <div className="planner-section-block">
        <div className="planner-section-block__title">
          {geometryMode === "polygon" ? "Normalized Polygon Coordinates" : "Normalized LineString Coordinates"}
        </div>
        {activeCoordinates.length === 0 ? (
          <div className="planner-empty-state">
            {geometryMode === "polygon"
              ? "No polygon vertices defined yet. Add vertices on the map to begin."
              : "No route points defined yet. Set origin and destination on the map to begin."}
          </div>
        ) : (
          <div className="planner-point-list">
            {geometryMode === "polygon" ? (
              polygonVertices.map((vertex, index) => (
                <div key={vertex.id} className="planner-point-card">
                  <div>
                    <div className="planner-point-card__label">Vertex {index + 1}</div>
                    <div className="planner-point-card__value">{formatMissionCoordinate(vertex)}</div>
                  </div>
                  <div className="planner-point-card__actions">
                    <span className="planner-point-card__badge planner-point-card__badge--polygon">P{index + 1}</span>
                    <button
                      type="button"
                      className="planner-inline-btn"
                      onClick={() => onRemovePolygonVertex(vertex.id)}
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <>
                {origin ? (
                  <div className="planner-point-card">
                    <div>
                      <div className="planner-point-card__label">Origin</div>
                      <div className="planner-point-card__value">{formatMissionCoordinate(origin)}</div>
                    </div>
                    <div className="planner-point-card__actions">
                      <span className="planner-point-card__badge planner-point-card__badge--origin">ORG</span>
                      <button
                        type="button"
                        className="planner-inline-btn"
                        onClick={() => onRemoveRoutePoint(origin.id)}
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="planner-point-card planner-point-card--muted">
                    <div>
                      <div className="planner-point-card__label">Origin</div>
                      <div className="planner-point-card__value">Unavailable</div>
                    </div>
                  </div>
                )}

                {waypoints.map((waypoint, index) => (
                  <div key={waypoint.id} className="planner-point-card">
                    <div>
                      <div className="planner-point-card__label">Waypoint {index + 1}</div>
                      <div className="planner-point-card__value">{formatMissionCoordinate(waypoint)}</div>
                    </div>
                    <div className="planner-point-card__actions">
                      <span className="planner-point-card__badge planner-point-card__badge--waypoint">W{index + 1}</span>
                      <button
                        type="button"
                        className="planner-inline-btn"
                        onClick={() => onRemoveRoutePoint(waypoint.id)}
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}

                {destination ? (
                  <div className="planner-point-card">
                    <div>
                      <div className="planner-point-card__label">Destination</div>
                      <div className="planner-point-card__value">{formatMissionCoordinate(destination)}</div>
                    </div>
                    <div className="planner-point-card__actions">
                      <span className="planner-point-card__badge planner-point-card__badge--destination">DST</span>
                      <button
                        type="button"
                        className="planner-inline-btn"
                        onClick={() => onRemoveRoutePoint(destination.id)}
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="planner-point-card planner-point-card--muted">
                    <div>
                      <div className="planner-point-card__label">Destination</div>
                      <div className="planner-point-card__value">Unavailable</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {missionGeometry && (
        <div className="planner-section-block">
          <div className="planner-section-block__title">Route Area Preview</div>
          <RouteGeometryPreviewMap
            missionGeometry={missionGeometry}
            sampledCoordinates={sampledCoordinates}
          />
          <div className="planner-note">
            {missionGeometry.name || "Unnamed mission"} / {missionGeometry.type} / {missionGeometry.coordinates.length} coordinates
            {missionGeometry.type === "LineString" ? ` / ${sampledCoordinates.length} sampled analysis points` : ""}
          </div>
        </div>
      )}

      <div className="planner-section-block">
        <div className="planner-section-block__title">Mission History</div>
        {!authSession ? (
          <div className="planner-note">
            Sign in with a registered account before saving missions to history.
          </div>
        ) : (
          <>
            <div className="planner-action-bar">
              <button
                type="button"
                className="planner-btn"
                onClick={onRefreshHistory}
                disabled={missionHistoryLoading}
              >
                {missionHistoryLoading ? "REFRESHING" : "REFRESH HISTORY"}
              </button>
              <button
                type="button"
                className="planner-btn planner-btn--primary"
                onClick={onSaveMission}
                disabled={!canSaveMission || historySaveLoading}
              >
                {historySaveLoading ? "SAVING" : "SAVE MISSION"}
              </button>
              {!missionName.trim() && (
                <span className="planner-inline-note">Enter a mission name before saving.</span>
              )}
            </div>

            {missionHistoryError && <div className="planner-note planner-note--danger">{missionHistoryError}</div>}
            {historyMessage && <div className="planner-inline-note">{historyMessage}</div>}

            {missionHistory.length === 0 ? (
              <div className="planner-empty-state">
                No saved missions yet. Save the current mission to build your route history.
              </div>
            ) : (
              <div className="planner-point-list">
                {missionHistory.map((item) => (
                  <div key={item.mission_id} className="planner-point-card">
                    <div>
                      <div className="planner-point-card__label">{item.mission_name}</div>
                      <div className="planner-point-card__value">
                        {item.geometry_type} / {item.coordinate_count} coordinates
                      </div>
                      <div className="planner-inline-note">
                        Saved {formatSavedAt(item.saved_at)}
                        {item.sample_spacing_km ? ` / ${item.sample_spacing_km} km spacing` : ""}
                      </div>
                    </div>
                    <div className="planner-point-card__actions">
                      <button
                        type="button"
                        className="planner-inline-btn"
                        onClick={() => onLoadMission(item)}
                      >
                        LOAD
                      </button>
                      {item.geometry_type === "LineString" && (
                        <button
                          type="button"
                          className="planner-inline-btn"
                          onClick={() => onAnalyzeSavedMission(item)}
                        >
                          LOAD + ANALYZE
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="planner-action-bar">
        <button
          type="button"
          className="planner-btn"
          onClick={onExportKml}
          disabled={!missionGeometry || exportLoading}
        >
          {exportingFormat === "kml" ? "EXPORTING KML" : "EXPORT KML"}
        </button>
        <button
          type="button"
          className="planner-btn"
          onClick={onExportTxt}
          disabled={!missionGeometry || exportLoading}
        >
          {exportingFormat === "txt" ? "EXPORTING TXT" : "EXPORT TXT"}
        </button>
        <button
          type="button"
          className="planner-btn planner-btn--primary"
          onClick={onAnalyzeRoute}
          disabled={!canAnalyze || analysisLoading}
        >
          {analysisLoading ? "ANALYZING" : "ANALYZE ROUTE"}
        </button>
        {!canAnalyze && (
          <span className="planner-inline-note">
            {geometryMode === "polygon"
              ? "Route risk analysis currently accepts LineString geometry only."
              : "Origin and destination are required before route analysis."}
          </span>
        )}
        {exportMessage && <span className="planner-inline-note">{exportMessage}</span>}
        {!missionGeometry && (
          <span className="planner-inline-note">
            Define a valid {geometryMode === "polygon" ? "polygon" : "route"} geometry before exporting KML or TXT.
          </span>
        )}
      </div>
    </section>
  );
}
