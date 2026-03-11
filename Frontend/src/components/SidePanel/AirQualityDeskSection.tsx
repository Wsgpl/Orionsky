import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "../../services/api";
import { useStore } from "../../store";
import type { AirQualityCellResponse, AirQualityGridResponse } from "../../types";
import { FOUNDATION_COLORS } from "../../utils/designSystem";
import { formatCoord } from "../../utils/mapHelpers";
import {
  formatProviderLabel,
  formatShortDateTime,
  getErrorMessage,
  InlineNotice,
  OverviewTile,
  SourceBadge,
  StatusRow,
} from "./deskShared";

type Props = {
  open: boolean;
  onToggle: () => void;
};

type PollutantMetric = keyof AirQualityGridResponse["units"];

const AIR_QUALITY_METRICS: Array<{ key: PollutantMetric; label: string; accent: string }> = [
  { key: "pm25", label: "PM2.5", accent: "#0f766e" },
  { key: "pm10", label: "PM10", accent: "#0ea5e9" },
  { key: "ozone", label: "Ozone", accent: "#7c3aed" },
  { key: "no2", label: "NO2", accent: "#dc2626" },
  { key: "so2", label: "SO2", accent: "#d97706" },
  { key: "co", label: "CO", accent: "#475569" },
];

type LocationTarget = {
  latitude: number;
  longitude: number;
  name: string;
};

function formatAirQualityValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) {
    return "Unavailable";
  }
  const digits = unit === "kg/m2" ? 6 : 1;
  return `${value.toFixed(digits)} ${unit}`;
}

function getMetricValue(cell: AirQualityCellResponse, metric: PollutantMetric): number | null {
  const value = cell.data[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getNearestCell(
  cells: AirQualityCellResponse[],
  selection: LocationTarget | null,
): AirQualityCellResponse | null {
  if (!selection) {
    return null;
  }

  let bestCell: AirQualityCellResponse | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const latDiff = cell.data.latitude - selection.latitude;
    const lonDiff = cell.data.longitude - selection.longitude;
    const distance = latDiff * latDiff + lonDiff * lonDiff;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestCell = cell;
    }
  }
  return bestCell;
}

export function AirQualityDeskSection({ open, onToggle }: Props) {
  const selectedLocation = useStore((state) => state.selectedLocation) as LocationTarget | null;
  const airQualityGrid = useStore((state) => state.airQualityGrid);
  const setAirQualityGrid = useStore((state) => state.setAirQualityGrid);
  const [selectedMetric, setSelectedMetric] = useState<PollutantMetric>("pm25");
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAirQuality = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAirQuality();
      setAirQualityGrid(response);
    } catch (airQualityError) {
      setError(getErrorMessage(airQualityError, "Air-quality request failed."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !requested) {
      setRequested(true);
      void loadAirQuality();
    }
  }, [open, requested]);

  const cells = airQualityGrid?.cells ?? [];
  const units = airQualityGrid?.units ?? null;
  const metricUnit = units ? units[selectedMetric] : "";
  const nearestCell = useMemo(() => getNearestCell(cells, selectedLocation), [cells, selectedLocation]);
  const rankedCells = useMemo(
    () =>
      [...cells]
        .filter((cell) => getMetricValue(cell, selectedMetric) !== null)
        .sort((left, right) => (getMetricValue(right, selectedMetric) ?? -Infinity) - (getMetricValue(left, selectedMetric) ?? -Infinity))
        .slice(0, 6),
    [cells, selectedMetric],
  );
  const peakCell = rankedCells[0] ?? null;

  return (
    <div className={`sp-section ${open ? "sp-section--open" : ""}`}>
      <button className={`sp-header ${open ? "sp-header--open" : ""}`} onClick={onToggle}>
        <span className="sp-header-icon">AQ</span>
        <span className="sp-header-label">Air Quality</span>
        <span className="sp-chevron">{open ? "UP" : "DN"}</span>
      </button>

      {open && (
        <div className="sp-body">
          <div className="sp-overview-grid">
            <OverviewTile label="Provider" value={formatProviderLabel(airQualityGrid?.source ?? "copernicus_cams")} />
            <OverviewTile label="Cells" value={String(airQualityGrid?.count ?? 0)} />
            <OverviewTile label="Metric" value={selectedMetric.toUpperCase()} />
            <OverviewTile label="Unit" value={metricUnit || "Unavailable"} />
            <OverviewTile label="Peak" value={peakCell ? formatAirQualityValue(getMetricValue(peakCell, selectedMetric), metricUnit) : "Unavailable"} />
            <OverviewTile label="Selection" value={selectedLocation?.name ?? "Map-wide"} />
          </div>

          <div className="sp-wx-grid sp-wx-grid--dashboard">
            {AIR_QUALITY_METRICS.map((metric) => {
              const active = selectedMetric === metric.key;
              return (
                <button
                  type="button"
                  key={metric.key}
                  className={`sp-wx-btn ${active ? "sp-wx-btn--active" : ""}`}
                  style={{ "--wx-accent": metric.accent } as CSSProperties}
                  aria-pressed={active}
                  onClick={() => setSelectedMetric(metric.key)}
                >
                  <span className="sp-wx-icon">{metric.label}</span>
                  <span className="sp-wx-label">{metricUnit && active ? metricUnit : "Raw value"}</span>
                </button>
              );
            })}
          </div>

          <div className="sp-action-row">
            <button type="button" className="sp-btn" onClick={() => void loadAirQuality()} disabled={loading}>
              {loading ? "LOADING" : "REFRESH AIR"}
            </button>
            <SourceBadge source={airQualityGrid?.source ?? "copernicus_cams"} />
          </div>

          {error ? <InlineNotice tone="danger" message={error} /> : null}
          {!loading && airQualityGrid && airQualityGrid.count === 0 ? (
            <InlineNotice tone="info" message="No Copernicus CAMS cells are currently available." />
          ) : null}

          <div className="sp-list-block">
            <div className="sp-subtitle">Selected Location Sample</div>
            {nearestCell ? (
              <>
                <StatusRow
                  label={selectedLocation?.name ?? nearestCell.cell_key}
                  value={formatAirQualityValue(getMetricValue(nearestCell, selectedMetric), metricUnit)}
                  meta={`${formatCoord(nearestCell.data.latitude, "lat")} / ${formatCoord(nearestCell.data.longitude, "lon")}`}
                  accessory={<SourceBadge source={nearestCell.data.source} />}
                />
                <div className="sp-data-grid">
                  <StatusRow label="PM2.5" value={formatAirQualityValue(nearestCell.data.pm25, units?.pm25 ?? "")} />
                  <StatusRow label="PM10" value={formatAirQualityValue(nearestCell.data.pm10, units?.pm10 ?? "")} />
                  <StatusRow label="Ozone" value={formatAirQualityValue(nearestCell.data.ozone, units?.ozone ?? "")} />
                  <StatusRow label="NO2" value={formatAirQualityValue(nearestCell.data.no2, units?.no2 ?? "")} />
                  <StatusRow label="SO2" value={formatAirQualityValue(nearestCell.data.so2, units?.so2 ?? "")} />
                  <StatusRow label="CO" value={formatAirQualityValue(nearestCell.data.co, units?.co ?? "")} />
                </div>
                <div className="drawer-note">Observed at {formatShortDateTime(nearestCell.data.timestamp)}</div>
              </>
            ) : (
              <div className="sp-more">Unavailable.</div>
            )}
          </div>

          <div className="sp-list-block">
            <div className="sp-subtitle">Highest {selectedMetric.toUpperCase()} Samples</div>
            {rankedCells.length === 0 ? (
              <div className="sp-more">Unavailable.</div>
            ) : (
              rankedCells.map((cell) => (
                <StatusRow
                  key={`${cell.cell_key}-${selectedMetric}`}
                  label={`${formatCoord(cell.data.latitude, "lat")} / ${formatCoord(cell.data.longitude, "lon")}`}
                  value={formatAirQualityValue(getMetricValue(cell, selectedMetric), metricUnit)}
                  meta={formatShortDateTime(cell.data.timestamp)}
                  accessory={
                    <span
                      className="sp-inline-badge sp-inline-badge--muted"
                      style={{ color: FOUNDATION_COLORS.textBody }}
                    >
                      {selectedMetric.toUpperCase()}
                    </span>
                  }
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
