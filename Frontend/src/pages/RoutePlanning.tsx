import { useState } from "react";
import { RouteAnalysisPanel } from "../components/RoutePlanning/RouteAnalysisPanel";
import { RoutePlanningMap } from "../components/RoutePlanning/RoutePlanningMap";
import { RouteSummaryPanel } from "../components/RoutePlanning/RouteSummaryPanel";
import {
  ROUTE_SAMPLE_SPACING_OPTIONS_KM,
  useRoutePlanner,
} from "../hooks/useRoutePlanner";
import type { MissionHistoryItem } from "../types";


function RoutePlanning() {
  const planner = useRoutePlanner();

  const [activePanel, setActivePanel] = useState<"summary" | "analysis" | null>(null);

  const togglePanel = (panel: "summary" | "analysis") => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  const handleAnalyze = () => {
    void planner.analyzeRoute();
    setActivePanel("analysis");
  };

  const handleAnalyzeSavedMission = (item: MissionHistoryItem) => {
    void planner.loadMissionFromHistoryAndAnalyze(item);
    setActivePanel("analysis");
  };

  return (

    <div className="planner-page">
      <RoutePlanningMap
        geometryMode={planner.geometryMode}
        missionGeometry={planner.missionGeometry}
        routePoints={planner.orderedRoutePoints}
        polygonVertices={planner.polygonVertices}
        sampledCoordinates={planner.sampledCoordinates}
        placementMode={planner.placementMode}
        sampleSpacingKm={planner.sampleSpacingKm}
        onMapPlacement={planner.handleMapPlacement}
        onUpdateOrigin={planner.updateOrigin}
        onUpdateDestination={planner.updateDestination}
        onUpdateWaypoint={planner.updateWaypoint}
        onUpdatePolygonVertex={planner.updatePolygonVertex}
        onInsertRoutePoint={planner.insertRoutePoint}
        onInsertPolygonVertex={planner.insertPolygonVertex}
        onRemoveRoutePoint={planner.removeRoutePoint}
        onRemovePolygonVertex={planner.removePolygonVertex}
        onInteract={() => setActivePanel(null)} /* Close panel if interacting with map */
      />


      {!activePanel && (
        <aside className="planner-sidebar">
          <button
            type="button"
            className="planner-toggle-btn"
            onClick={() => togglePanel("summary")}
            title="Normalized Planning Model"
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>

          <button
            type="button"
            className="planner-toggle-btn"
            onClick={() => togglePanel("analysis")}
            title="Backend-Driven Route Context"
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </button>
        </aside>
      )}

      {activePanel && (
        <button 
          className="planner-toggle-btn"
          style={{ 
            position: "absolute", 
            right: "488px", /* Outside the 460px planner panel */
            top: "120px",
            zIndex: 800,
            background: "rgba(255, 255, 255, 0.45)", 
            color: "#0f172a",
            border: "1px solid rgba(255, 255, 255, 0.35)"
          }}
          onClick={() => setActivePanel(null)}
          title="Back to Menu"
        >
          <svg 
            className="blinking-arrow-icon"
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
      )}

      <RouteSummaryPanel
        missionName={planner.missionName}
        geometryMode={planner.geometryMode}
        missionGeometry={planner.missionGeometry}
        geometrySummary={planner.geometrySummary}
        origin={planner.origin}
        destination={planner.destination}
        waypoints={planner.waypoints}
        polygonVertices={planner.polygonVertices}
        sampleSpacingKm={planner.sampleSpacingKm}
        sampleSpacingOptionsKm={ROUTE_SAMPLE_SPACING_OPTIONS_KM}
        sampledCoordinates={planner.sampledCoordinates}
        sampledPointCount={planner.sampledCoordinates.length}
        placementMode={planner.placementMode}
        canAnalyze={planner.canAnalyze}
        analysisLoading={planner.analysisLoading}
        exportLoading={planner.exportLoading}
        exportingFormat={planner.exportingFormat}
        exportMessage={planner.exportMessage}
        authSession={planner.authSession}
        canSaveMission={planner.canSaveMission}
        missionHistory={planner.missionHistory}
        missionHistoryLoading={planner.missionHistoryLoading}
        missionHistoryError={planner.missionHistoryError}
        historyMessage={planner.historyMessage}
        historySaveLoading={planner.historySaveLoading}
        onSetMissionName={planner.setMissionName}
        onSetGeometryMode={planner.setGeometryMode}
        onSetPlacementMode={planner.setPlacementMode}
        onSetSampleSpacingKm={planner.setSampleSpacingKm}
        onRemoveRoutePoint={planner.removeRoutePoint}
        onRemovePolygonVertex={planner.removePolygonVertex}
        onClearCurrentGeometry={planner.clearCurrentGeometry}
        onAnalyzeRoute={handleAnalyze}
        onExportKml={planner.exportKml}
        onExportTxt={planner.exportTxt}
        onSaveMission={planner.saveMissionToHistory}
        onRefreshHistory={planner.refreshMissionHistory}
        onLoadMission={planner.loadMissionFromHistory}
        onAnalyzeSavedMission={handleAnalyzeSavedMission}

        onClose={() => setActivePanel(null)}
        className={activePanel === "summary" ? "planner-panel--open" : ""}
      />

      <RouteAnalysisPanel
        geometryMode={planner.geometryMode}
        routeReady={planner.canAnalyze}
        analysisStatus={planner.analysisStatus}
        analysisLoading={planner.analysisLoading}
        analysisMessage={planner.analysisMessage}
        analysis={planner.analysis}
        onClose={() => setActivePanel(null)}
        className={activePanel === "analysis" ? "planner-panel--open" : ""}
      />
    </div>

  );
}

export default RoutePlanning;
