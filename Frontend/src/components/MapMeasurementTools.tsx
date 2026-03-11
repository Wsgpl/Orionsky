import { useEffect, useMemo, useState, type CSSProperties } from "react";
import L from "leaflet";
import { CircleMarker, Polygon, Polyline, useMap, useMapEvents } from "react-leaflet";
import { useStore } from "../store";
import { getRadarOverlayPalette } from "../utils/radarOverlayTheme";

export type MeasurementMode = "none" | "distance" | "area";
type MeasurementPoint = [number, number];

export type MapMeasurementState = {
  measurementMode: MeasurementMode;
  measurementPoints: MeasurementPoint[];
  isMeasuring: boolean;
  hasResult: boolean;
};

type MapMeasurementToolsProps = {
  anchorLeft?: number;
  anchorTop?: number;
  resultAnchorTop?: number;
  resultAnchorRight?: number;
  floatingResult?: boolean;
  onDrawingChange?: (isDrawing: boolean) => void;
  onMeasurementStateChange?: (state: MapMeasurementState) => void;
};

const EARTH_RADIUS_METERS = 6_378_137;

const PANEL_STYLE: CSSProperties = {
  position: "absolute",
  zIndex: 540,
  width: "min(216px, calc(100% - 28px))",
  padding: "10px 10px 9px",
  borderRadius: 18,
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

const BUTTON_BASE_STYLE: CSSProperties = {
  appearance: "none",
  borderRadius: 14,
  padding: "10px 12px",
  cursor: "pointer",
  transition: "all 160ms ease",
  fontFamily: "Orbitron, monospace",
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(points: MeasurementPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += L.latLng(points[index - 1][0], points[index - 1][1]).distanceTo(
      L.latLng(points[index][0], points[index][1]),
    );
  }

  return total;
}

function calculateAreaSquareMeters(points: MeasurementPoint[]): number {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area +=
      toRadians(next[1] - current[1]) *
      (2 + Math.sin(toRadians(current[0])) + Math.sin(toRadians(next[0])));
  }

  return Math.abs((area * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
}

function formatDistance(meters: number): string {
  if (meters >= 1_000) {
    return `${(meters / 1_000).toFixed(meters >= 10_000 ? 0 : 1)} km`;
  }

  return `${Math.round(meters)} m`;
}

function formatArea(squareMeters: number): string {
  if (squareMeters >= 1_000_000) {
    return `${(squareMeters / 1_000_000).toFixed(squareMeters >= 10_000_000 ? 0 : 2)} km2`;
  }

  if (squareMeters >= 10_000) {
    return `${(squareMeters / 10_000).toFixed(2)} ha`;
  }

  return `${Math.round(squareMeters)} m2`;
}

function isMeasurementComplete(mode: Exclude<MeasurementMode, "none">, points: MeasurementPoint[]): boolean {
  if (mode === "distance") {
    return points.length >= 2;
  }

  return points.length >= 3;
}

function hasCompletedMeasurement(mode: MeasurementMode, points: MeasurementPoint[]): boolean {
  if (mode === "none") {
    return false;
  }

  return isMeasurementComplete(mode, points);
}

function appendPoint(points: MeasurementPoint[], point: MeasurementPoint): MeasurementPoint[] {
  const previous = points[points.length - 1];
  if (previous && Math.abs(previous[0] - point[0]) < 0.000001 && Math.abs(previous[1] - point[1]) < 0.000001) {
    return points;
  }

  return [...points, point];
}

export function MapMeasurementTools({
  anchorLeft = 14,
  anchorTop = 190,
  resultAnchorTop,
  resultAnchorRight = 14,
  floatingResult = false,
  onDrawingChange,
  onMeasurementStateChange,
}: MapMeasurementToolsProps) {
  const map = useMap();
  const theme = useStore((s) => s.theme);
  const overlayPalette = getRadarOverlayPalette(theme);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>("none");
  const [measurementPoints, setMeasurementPoints] = useState<MeasurementPoint[]>([]);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [cursorPoint, setCursorPoint] = useState<MeasurementPoint | null>(null);

  const previewPoints = useMemo<MeasurementPoint[]>(
    () =>
      measurementMode !== "none" && isMeasuring && cursorPoint && measurementPoints.length > 0
        ? [...measurementPoints, cursorPoint]
        : measurementPoints,
    [cursorPoint, isMeasuring, measurementMode, measurementPoints],
  );

  const distanceMeters = useMemo(() => calculateDistanceMeters(previewPoints), [previewPoints]);
  const areaSquareMeters = useMemo(
    () => (measurementMode === "area" ? calculateAreaSquareMeters(previewPoints) : 0),
    [measurementMode, previewPoints],
  );
  const perimeterMeters = useMemo(() => {
    if (measurementMode !== "area") {
      return distanceMeters;
    }

    if (previewPoints.length < 2) {
      return 0;
    }

    if (previewPoints.length < 3) {
      return calculateDistanceMeters(previewPoints);
    }

    return calculateDistanceMeters([...previewPoints, previewPoints[0]]);
  }, [distanceMeters, measurementMode, previewPoints]);

  const finalDistanceMeters = useMemo(() => calculateDistanceMeters(measurementPoints), [measurementPoints]);
  const finalAreaSquareMeters = useMemo(
    () => (measurementMode === "area" ? calculateAreaSquareMeters(measurementPoints) : 0),
    [measurementMode, measurementPoints],
  );
  const canFinish = measurementMode !== "none" ? isMeasurementComplete(measurementMode, measurementPoints) : false;
  const hasMeasurement = measurementMode !== "none" && measurementPoints.length > 0;
  const hasResult = measurementMode !== "none" && !isMeasuring && hasCompletedMeasurement(measurementMode, measurementPoints);

  useEffect(() => {
    onDrawingChange?.(isMeasuring);
    return () => {
      onDrawingChange?.(false);
    };
  }, [isMeasuring, onDrawingChange]);

  useEffect(() => {
    onMeasurementStateChange?.({
      measurementMode,
      measurementPoints,
      isMeasuring,
      hasResult,
    });

    return () => {
      onMeasurementStateChange?.({
        measurementMode: "none",
        measurementPoints: [],
        isMeasuring: false,
        hasResult: false,
      });
    };
  }, [hasResult, isMeasuring, measurementMode, measurementPoints, onMeasurementStateChange]);

  useEffect(() => {
    if (isMeasuring) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    return () => {
      map.doubleClickZoom.enable();
    };
  }, [isMeasuring, map]);

  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = measurementMode !== "none" && isMeasuring ? "crosshair" : "";

    return () => {
      container.style.cursor = "";
    };
  }, [isMeasuring, map, measurementMode]);

  const clearMeasurement = () => {
    setMeasurementMode("none");
    setMeasurementPoints([]);
    setIsMeasuring(false);
    setCursorPoint(null);
  };

  const finishMeasurement = () => {
    if (!canFinish) {
      return;
    }

    setIsMeasuring(false);
    setCursorPoint(null);
  };

  const startMeasurement = (mode: Exclude<MeasurementMode, "none">) => {
    setMeasurementMode(mode);
    setMeasurementPoints([]);
    setIsMeasuring(true);
    setCursorPoint(null);
  };

  useMapEvents({
    click: (event) => {
      if (measurementMode === "none" || !isMeasuring) {
        return;
      }

      if (event.originalEvent.detail > 1) {
        return;
      }

      const nextPoint: MeasurementPoint = [event.latlng.lat, event.latlng.lng];
      setMeasurementPoints((current) => appendPoint(current, nextPoint));
      setCursorPoint(nextPoint);
    },
    dblclick: (event) => {
      if (measurementMode === "none" || !isMeasuring) {
        return;
      }

      event.originalEvent.preventDefault();
      L.DomEvent.stop(event.originalEvent);

      const pointsAfterFinish = measurementPoints;
      if (hasCompletedMeasurement(measurementMode, pointsAfterFinish)) {
        setIsMeasuring(false);
        setCursorPoint(null);
      }
    },
    mousemove: (event) => {
      if (measurementMode === "none" || !isMeasuring) {
        return;
      }

      setCursorPoint([event.latlng.lat, event.latlng.lng]);
    },
    mouseout: () => {
      if (!isMeasuring) {
        return;
      }

      setCursorPoint(null);
    },
  });

  const summaryTitle =
    measurementMode === "distance"
      ? "Distance Measure"
      : measurementMode === "area"
        ? "Area Measure"
        : "Measurement";
  const summaryValue =
    measurementMode === "distance"
      ? formatDistance(distanceMeters)
      : measurementMode === "area"
        ? previewPoints.length >= 3
          ? formatArea(areaSquareMeters)
          : "Pick 3+ points"
        : "Idle";
  const summaryMeta =
    measurementMode === "distance"
      ? `${measurementPoints.length} waypoint${measurementPoints.length === 1 ? "" : "s"}`
      : measurementMode === "area"
        ? `${measurementPoints.length} vertices / Perimeter ${formatDistance(perimeterMeters)}`
        : "Select a tool to begin";
  const helperText =
    measurementMode === "none"
      ? "Choose Distance or Area, then click on the map to place points."
      : isMeasuring
        ? measurementMode === "distance"
          ? "Single-click to add points. Double-click to finish the route."
          : "Single-click to add vertices. Double-click to close and finish the area."
        : "Measurement is complete. Use X to clear it or start another tool.";

  const resultLabel =
    measurementMode === "distance" ? "Total Distance" : measurementMode === "area" ? "Area" : "Measurement";
  const resultValue =
    measurementMode === "distance"
      ? formatDistance(finalDistanceMeters)
      : measurementMode === "area"
        ? formatArea(finalAreaSquareMeters)
        : "--";

  const distancePath = measurementMode === "distance" ? previewPoints : [];
  const areaPath = measurementMode === "area" ? previewPoints : [];
  const areaOutlinePath =
    measurementMode === "area" && areaPath.length >= 3 ? [...areaPath, areaPath[0]] : areaPath;

  const stopPropagation = (event: React.MouseEvent<HTMLDivElement | HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <>
      {measurementMode === "distance" && distancePath.length >= 2 && (
        <Polyline
          positions={distancePath}
          pathOptions={{
            color: "#38bdf8",
            weight: 3.2,
            opacity: 0.92,
            dashArray: isMeasuring ? "8 10" : "5 7",
            lineCap: "round",
            lineJoin: "round",
          }}
          interactive={false}
        />
      )}

      {measurementMode === "area" && areaPath.length >= 2 && (
        <Polyline
          positions={areaOutlinePath}
          pathOptions={{
            color: "#34d399",
            weight: 2.8,
            opacity: 0.92,
            dashArray: isMeasuring ? "7 9" : "4 6",
            lineCap: "round",
            lineJoin: "round",
          }}
          interactive={false}
        />
      )}

      {measurementMode === "area" && areaPath.length >= 3 && (
        <Polygon
          positions={areaPath}
          pathOptions={{
            color: "#34d399",
            weight: 1.8,
            opacity: 0.78,
            fillColor: "#34d399",
            fillOpacity: isMeasuring ? 0.12 : 0.18,
          }}
          interactive={false}
        />
      )}

      {measurementMode !== "none" &&
        measurementPoints.map((point, index) => (
          <CircleMarker
            key={`${measurementMode}-${index}-${point[0].toFixed(4)}-${point[1].toFixed(4)}`}
            center={point}
            radius={index === 0 ? 5.2 : 4.6}
            pathOptions={{
              color: "#e2e8f0",
              weight: 1.6,
              fillColor: measurementMode === "distance" ? "#38bdf8" : "#34d399",
              fillOpacity: 1,
            }}
            interactive={false}
          />
        ))}

      <div
        style={{
          ...PANEL_STYLE,
          left: anchorLeft,
          top: anchorTop,
          background: overlayPalette.panelBackground,
          border: `1px solid ${overlayPalette.panelBorder}`,
          boxShadow: overlayPalette.panelShadow,
        }}
        onMouseDown={stopPropagation}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
      >
        <div
          style={{
            fontFamily: "Orbitron, monospace",
            fontSize: 11,
            letterSpacing: 0.9,
            textTransform: "uppercase",
            color: overlayPalette.panelSubtle,
            marginBottom: 10,
          }}
        >
          Measure Tools
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {(["distance", "area"] as const).map((mode) => {
            const active = measurementMode === mode;

            return (
              <button
                key={mode}
                type="button"
                onMouseDown={stopPropagation}
                onClick={() => startMeasurement(mode)}
                style={{
                  ...BUTTON_BASE_STYLE,
                  border: `1px solid ${
                    active ? (mode === "distance" ? "rgba(56, 189, 248, 0.65)" : "rgba(52, 211, 153, 0.65)") : overlayPalette.buttonIdleBorder
                  }`,
                  background: active
                    ? mode === "distance"
                      ? `linear-gradient(135deg, rgba(56, 189, 248, 0.28), ${overlayPalette.surfaceBackground})`
                      : `linear-gradient(135deg, rgba(52, 211, 153, 0.28), ${overlayPalette.surfaceBackground})`
                    : overlayPalette.buttonIdleBackground,
                  color: active ? overlayPalette.surfaceText : overlayPalette.buttonIdleText,
                  boxShadow: active
                    ? mode === "distance"
                      ? "0 0 0 1px rgba(56, 189, 248, 0.16) inset, 0 0 18px rgba(56, 189, 248, 0.18)"
                      : "0 0 0 1px rgba(52, 211, 153, 0.16) inset, 0 0 18px rgba(52, 211, 153, 0.18)"
                    : "none",
                }}
              >
                {mode === "distance" ? "Distance" : "Area"}
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: "10px 11px",
            borderRadius: 14,
            background: overlayPalette.surfaceBackground,
            border: `1px solid ${overlayPalette.surfaceBorder}`,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontFamily: "Orbitron, monospace",
              fontSize: 10,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color:
                measurementMode === "distance"
                  ? "#38bdf8"
                  : measurementMode === "area"
                    ? "#34d399"
                    : overlayPalette.panelMuted,
              marginBottom: 6,
            }}
          >
            {summaryTitle}
          </div>
          <div
            style={{
              fontSize: 19,
              fontWeight: 700,
              color: overlayPalette.surfaceText,
              marginBottom: 5,
            }}
          >
            {summaryValue}
          </div>
          <div
            style={{
              fontSize: 12,
              color: overlayPalette.surfaceMuted,
            }}
          >
            {summaryMeta}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <button
            type="button"
            onMouseDown={stopPropagation}
            onClick={finishMeasurement}
            disabled={!canFinish || !isMeasuring}
            style={{
              ...BUTTON_BASE_STYLE,
              border: "1px solid rgba(96, 165, 250, 0.35)",
              background: !canFinish || !isMeasuring ? overlayPalette.buttonDisabledBackground : "rgba(37, 99, 235, 0.22)",
              color: !canFinish || !isMeasuring ? overlayPalette.buttonDisabledText : overlayPalette.panelSubtle,
              cursor: !canFinish || !isMeasuring ? "not-allowed" : "pointer",
            }}
          >
            Finish
          </button>

          <button
            type="button"
            onMouseDown={stopPropagation}
            onClick={clearMeasurement}
            disabled={!hasMeasurement && measurementMode === "none"}
            style={{
              ...BUTTON_BASE_STYLE,
              border: "1px solid rgba(248, 113, 113, 0.3)",
              background: !hasMeasurement && measurementMode === "none" ? overlayPalette.buttonDisabledBackground : "rgba(127, 29, 29, 0.22)",
              color: !hasMeasurement && measurementMode === "none" ? overlayPalette.buttonDisabledText : "#fecaca",
              cursor: !hasMeasurement && measurementMode === "none" ? "not-allowed" : "pointer",
            }}
          >
            Clear
          </button>
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: overlayPalette.panelMuted,
          }}
        >
          {helperText}
        </div>
      </div>

      {floatingResult && hasResult && (
        <div
          style={{
            position: "absolute",
            top: resultAnchorTop ?? anchorTop,
            right: resultAnchorRight,
            zIndex: 540,
            width: "min(228px, calc(100% - 28px))",
            padding: "12px 12px 11px",
            borderRadius: 18,
            background: overlayPalette.panelBackground,
            border: `1px solid ${overlayPalette.panelBorder}`,
            boxShadow: overlayPalette.panelShadow,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
          onMouseDown={stopPropagation}
          onClick={stopPropagation}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "Orbitron, monospace",
                  fontSize: 10,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: overlayPalette.panelSubtle,
                  marginBottom: 6,
                }}
              >
                {measurementMode === "distance" ? "Distance Complete" : "Area Complete"}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: overlayPalette.panelMuted,
                  marginBottom: 4,
                }}
              >
                {resultLabel}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: overlayPalette.panelText,
                }}
              >
                {resultValue}
              </div>
            </div>
            <button
              type="button"
              onClick={clearMeasurement}
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                border: `1px solid ${overlayPalette.buttonIdleBorder}`,
                background: overlayPalette.buttonIdleBackground,
                color: overlayPalette.panelText,
                fontSize: 11,
                flexShrink: 0,
              }}
              aria-label="Clear measurement"
            >
              X
            </button>
          </div>
        </div>
      )}
    </>
  );
}
