import type {
  AviationRiskItem,
  AviationRiskLevel,
  MissionCoordinate,
  MissionPlannerGeometryMode,
  RouteRiskAnalyzeResponse,
  RouteRiskPointAssessment,
  RouteRiskSegmentAssessment,
} from "../../types";
import type { RouteAnalysisStatus } from "../../hooks/useRoutePlanner";

type RouteAnalysisPanelProps = {
  geometryMode: MissionPlannerGeometryMode;
  routeReady: boolean;
  analysisStatus: RouteAnalysisStatus;
  analysisLoading: boolean;
  analysisMessage: string | null;
  analysis: RouteRiskAnalyzeResponse | null;
  onClose?: () => void;
  className?: string;
};

type LegacyRouteRiskAnalyzeResponse = RouteRiskAnalyzeResponse & {
  overall_summary?: string | null;
};

function formatCategoryLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatCoordinate(point: MissionCoordinate): string {
  return `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`;
}

function formatRiskLevel(level: AviationRiskLevel | null | undefined): string {
  return level ? level.toUpperCase() : "UNAVAILABLE";
}

function formatScore(score: number | null | undefined): string {
  return typeof score === "number" ? score.toFixed(2) : "Unavailable";
}

function formatDistance(distanceKm: number): string {
  return `${distanceKm.toFixed(1)} km`;
}

function formatFactorValue(factor: AviationRiskItem): string {
  if (factor.value === null || factor.value === undefined || factor.value === "") {
    return factor.threshold_used ?? "Unavailable";
  }
  if (factor.threshold_used) {
    return `${factor.value} / ${factor.threshold_used}`;
  }
  return String(factor.value);
}

function topFactorSummary(factors: AviationRiskItem[]): string {
  const ranked = factors
    .filter((factor) => factor.level)
    .sort((left, right) => {
      const score = { high: 3, medium: 2, low: 1 };
      return score[right.level as AviationRiskLevel] - score[left.level as AviationRiskLevel];
    })
    .slice(0, 2);

  if (ranked.length === 0) {
    return "No evaluated factors.";
  }

  return ranked.map((factor) => `${formatCategoryLabel(factor.category)} ${formatRiskLevel(factor.level)}`).join(" / ");
}

function topSamplePoints(analysis: RouteRiskAnalyzeResponse | null): RouteRiskPointAssessment[] {
  if (!analysis) {
    return [];
  }

  return [...(analysis.sample_points ?? [])]
    .filter((sample) => sample.score !== null)
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, 5);
}

function routeSections(analysis: RouteRiskAnalyzeResponse | null): RouteRiskSegmentAssessment[] {
  if (!analysis) {
    return [];
  }

  const worstSections = analysis.worst_sections ?? [];
  const segments = analysis.segments ?? [];
  return worstSections.length > 0 ? worstSections : segments.slice(0, 3);
}

function getRouteSummary(analysis: RouteRiskAnalyzeResponse | null): string | null {
  if (!analysis) {
    return null;
  }

  if (analysis.route_summary) {
    return analysis.route_summary;
  }

  const legacy = analysis as LegacyRouteRiskAnalyzeResponse;
  return legacy.overall_summary ?? null;
}

export function RouteAnalysisPanel({
  geometryMode,
  routeReady,
  analysisStatus,
  analysisLoading,
  analysisMessage,
  analysis,
  onClose,
  className = "",
}: RouteAnalysisPanelProps) {
  const skippedCategories = analysis?.skipped_categories ?? [];
  const unavailableCategories = analysis?.unavailable_categories ?? [];
  const highlightedSamples = topSamplePoints(analysis);
  const worstSections = routeSections(analysis);

  return (
    <section
      className={`planner-panel planner-panel--analysis ${className}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >


      <div className="planner-panel__header">
        <div>
          <div className="planner-panel__kicker">Risk Analysis</div>
          <h2 className="planner-panel__title">Backend-Driven Route Context</h2>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <span className={`planner-status-badge planner-status-badge--${analysisStatus}`}>
            {analysisLoading ? "loading" : analysisStatus}
          </span>
        </div>
      </div>


      {geometryMode === "polygon" ? (
        <div className="planner-empty-state">
          Polygon geometry is normalized and ready for export/save workflows, but the current route-risk endpoint only evaluates LineString missions.
        </div>
      ) : !routeReady ? (
        <div className="planner-empty-state">
          Define at least an origin and destination before requesting route analysis.
        </div>
      ) : (
        <>
          {getRouteSummary(analysis) && (
            <div className="planner-overview-card">
              <div className="planner-overview-card__label">Overall Summary</div>
              <div className="planner-overview-card__value">{getRouteSummary(analysis)}</div>
            </div>
          )}

          {analysisMessage && <div className="planner-note planner-note--danger">{analysisMessage}</div>}

          {analysisStatus === "idle" && (
            <div className="planner-note">
              The planner is ready to call <code>/api/v1/route-risk/analyze</code>. No analysis has been requested yet.
            </div>
          )}

          {analysis && (
            <div className="planner-metric-grid">
              <div className="planner-metric-card">
                <span className="planner-metric-card__label">Overall Risk</span>
                <span className="planner-metric-card__value">{formatRiskLevel(analysis.overall_level)}</span>
              </div>
              <div className="planner-metric-card">
                <span className="planner-metric-card__label">Score</span>
                <span className="planner-metric-card__value">{formatScore(analysis.overall_score)}</span>
              </div>
              <div className="planner-metric-card">
                <span className="planner-metric-card__label">Route Distance</span>
                <span className="planner-metric-card__value">
                  {typeof analysis.total_distance_km === "number" ? formatDistance(analysis.total_distance_km) : "Unavailable"}
                </span>
              </div>
              <div className="planner-metric-card">
                <span className="planner-metric-card__label">Samples</span>
                <span className="planner-metric-card__value">
                  {analysis.sample_point_count ?? 0} @{" "}
                  {typeof analysis.sample_spacing_km === "number" ? analysis.sample_spacing_km.toFixed(1) : "Unavailable"} km
                </span>
              </div>
            </div>
          )}

          {analysis?.sampling_adjusted && typeof analysis.requested_sample_spacing_km === "number" && typeof analysis.sample_spacing_km === "number" && (
            <div className="planner-inline-note">
              Requested spacing was {analysis.requested_sample_spacing_km.toFixed(1)} km. The backend widened it to{" "}
              {analysis.sample_spacing_km.toFixed(1)} km to keep route analysis responsive.
            </div>
          )}

          {(skippedCategories.length > 0 || unavailableCategories.length > 0) && (
            <div className="planner-section-block">
              <div className="planner-section-block__title">Coverage Indicators</div>
              {skippedCategories.length > 0 && (
                <div className="planner-coverage-row">
                  <span className="planner-coverage-row__label">Skipped</span>
                  <span className="planner-coverage-row__value">
                    {skippedCategories.map(formatCategoryLabel).join(", ")}
                  </span>
                </div>
              )}
              {unavailableCategories.length > 0 && (
                <div className="planner-coverage-row">
                  <span className="planner-coverage-row__label">Unavailable</span>
                  <span className="planner-coverage-row__value">
                    {unavailableCategories.map(formatCategoryLabel).join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}

          {analysis && (
            <>
              <div className="planner-section-block">
                <div className="planner-section-block__title">Route Factors</div>
                <div className="planner-domain-grid">
                  {(analysis.factors ?? []).map((factor) => (
                    <div key={factor.category} className="planner-domain-card">
                      <div className="planner-domain-card__header">
                        <div>
                          <div className="planner-domain-card__title">{formatCategoryLabel(factor.category)}</div>
                          <div className="planner-domain-card__meta">{factor.source ?? "source unavailable"}</div>
                        </div>
                        <span className="planner-domain-card__status">{formatRiskLevel(factor.level)}</span>
                      </div>

                      <div className="planner-domain-card__summary">{factor.explanation}</div>
                      <div className="planner-domain-card__list">
                        <div className="planner-domain-card__item">Value: {formatFactorValue(factor)}</div>
                        <div className="planner-domain-card__item">
                          Threshold: {factor.threshold_used ?? "Unavailable"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="planner-section-block">
                <div className="planner-section-block__title">Worst Sections</div>
                {worstSections.length === 0 ? (
                  <div className="planner-empty-state">No scored route sections were returned.</div>
                ) : (
                  <div className="planner-point-list">
                    {worstSections.map((section) => (
                      <div key={section.segment_index} className="planner-point-card">
                        <div>
                          <div className="planner-point-card__label">
                            Segment {section.segment_index + 1} / {formatDistance(section.distance_km)}
                          </div>
                          <div className="planner-point-card__value">
                            {formatCoordinate(section.start)} to {formatCoordinate(section.end)}
                          </div>
                          <div className="planner-inline-note">
                            Score {formatScore(section.score)} / {topFactorSummary(section.factors)}
                          </div>
                          <div className="planner-inline-note">{section.explanation}</div>
                        </div>
                        <div className="planner-point-card__actions">
                          <span className="planner-domain-card__status">{formatRiskLevel(section.overall_level)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="planner-section-block">
                <div className="planner-section-block__title">Sample Highlights</div>
                {highlightedSamples.length === 0 ? (
                  <div className="planner-empty-state">No scored sample points were returned.</div>
                ) : (
                  <div className="planner-point-list">
                    {highlightedSamples.map((sample) => (
                      <div key={sample.sample_index} className="planner-point-card">
                        <div>
                          <div className="planner-point-card__label">
                            Sample {sample.sample_index + 1} / {formatDistance(sample.distance_from_start_km)}
                          </div>
                          <div className="planner-point-card__value">{formatCoordinate(sample.coordinate)}</div>
                          <div className="planner-inline-note">
                            Score {formatScore(sample.score)} / {topFactorSummary(sample.factors)}
                          </div>
                          {sample.nearest_airport && (
                            <div className="planner-inline-note">
                              Nearest airport: {sample.nearest_airport.icao} ({sample.nearest_airport.distance_km.toFixed(1)} km)
                            </div>
                          )}
                          <div className="planner-inline-note">{sample.explanation}</div>
                        </div>
                        <div className="planner-point-card__actions">
                          <span className="planner-domain-card__status">{formatRiskLevel(sample.overall_level)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
