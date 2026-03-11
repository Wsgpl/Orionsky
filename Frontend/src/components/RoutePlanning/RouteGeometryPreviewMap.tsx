import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import { useMapConfig } from "../../hooks/useConfig";
import { useStore } from "../../store";
import type { MissionCoordinate, MissionGeometry } from "../../types";
import { toLeafletLatLngTuple } from "../../utils/missionGeometry";
import { getThemeBasemapUrl } from "../../utils/mapTheme";

type RouteGeometryPreviewMapProps = {
  missionGeometry: MissionGeometry;
  sampledCoordinates: MissionCoordinate[];
};

function buildBoundsSignature(coordinates: MissionCoordinate[]): string {
  return coordinates
    .map((coordinate) => `${coordinate.lat.toFixed(4)}:${coordinate.lon.toFixed(4)}`)
    .join("|");
}

function PreviewBoundsController({
  coordinates,
}: {
  coordinates: MissionCoordinate[];
}) {
  const map = useMap();
  const lastSignatureRef = useRef("");

  useEffect(() => {
    if (coordinates.length === 0) {
      return;
    }

    const signature = buildBoundsSignature(coordinates);
    if (lastSignatureRef.current === signature) {
      return;
    }

    lastSignatureRef.current = signature;

    const bounds = L.latLngBounds(coordinates.map(toLeafletLatLngTuple));
    if (!bounds.isValid()) {
      return;
    }

    map.fitBounds(bounds.pad(coordinates.length <= 2 ? 0.42 : 0.24), {
      padding: [18, 18],
      maxZoom: 9,
      animate: false,
    });
  }, [coordinates, map]);

  return null;
}

function compactSamplePoints(sampledCoordinates: MissionCoordinate[]): MissionCoordinate[] {
  if (sampledCoordinates.length <= 2) {
    return [];
  }

  const interior = sampledCoordinates.slice(1, -1);
  if (interior.length <= 12) {
    return interior;
  }

  const step = Math.ceil(interior.length / 12);
  return interior.filter((_, index) => index % step === 0);
}

export function RouteGeometryPreviewMap({
  missionGeometry,
  sampledCoordinates,
}: RouteGeometryPreviewMapProps) {
  const { config: mapConfig } = useMapConfig();
  const theme = useStore((state) => state.theme);

  const basemapUrl = useMemo(
    () => getThemeBasemapUrl(mapConfig.tiles, theme),
    [mapConfig.tiles, theme],
  );
  const routeCoordinates = useMemo(
    () => missionGeometry.coordinates.map(toLeafletLatLngTuple),
    [missionGeometry.coordinates],
  );
  const samplePreviewPoints = useMemo(
    () =>
      missionGeometry.type === "LineString"
        ? compactSamplePoints(sampledCoordinates)
        : [],
    [missionGeometry.type, sampledCoordinates],
  );

  return (
    <div className="planner-geometry-preview">
      <MapContainer
        className="planner-geometry-preview__map"
        center={routeCoordinates[0] ?? [20.5937, 78.9629]}
        zoom={6}
        zoomControl={false}
        attributionControl={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        boxZoom={false}
        keyboard={false}
      >
        <PreviewBoundsController coordinates={missionGeometry.coordinates} />
        <TileLayer url={basemapUrl} />

        {missionGeometry.type === "Polygon" ? (
          <Polygon
            positions={routeCoordinates}
            pathOptions={{
              color: "#0f5f91",
              weight: 3,
              opacity: 0.96,
              fillColor: "#0f5f91",
              fillOpacity: 0.18,
            }}
          />
        ) : (
          <>
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: "rgba(255,255,255,0.9)",
                weight: 7,
                opacity: 0.72,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: "#0f5f91",
                weight: 4,
                opacity: 0.96,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {samplePreviewPoints.map((point, index) => (
              <CircleMarker
                key={`sample-${index}-${point.lat}-${point.lon}`}
                center={toLeafletLatLngTuple(point)}
                radius={3}
                pathOptions={{
                  color: "#ffffff",
                  weight: 1,
                  opacity: 0.9,
                  fillColor: "#d97706",
                  fillOpacity: 0.9,
                }}
              />
            ))}
          </>
        )}

        {missionGeometry.coordinates[0] && (
          <CircleMarker
            center={toLeafletLatLngTuple(missionGeometry.coordinates[0])}
            radius={6}
            pathOptions={{
              color: "#ffffff",
              weight: 2,
              opacity: 0.98,
              fillColor: "#16a34a",
              fillOpacity: 1,
            }}
          />
        )}

        {missionGeometry.type === "LineString" &&
          missionGeometry.coordinates[missionGeometry.coordinates.length - 1] && (
            <CircleMarker
              center={toLeafletLatLngTuple(missionGeometry.coordinates[missionGeometry.coordinates.length - 1])}
              radius={6}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                opacity: 0.98,
                fillColor: "#dc2626",
                fillOpacity: 1,
              }}
            />
          )}
      </MapContainer>

      <div className="planner-geometry-preview__hud">
        <span className="planner-geometry-preview__badge">{missionGeometry.type}</span>
        <span className="planner-geometry-preview__caption">
          Fitted to selected {missionGeometry.type === "Polygon" ? "area" : "route"}
        </span>
      </div>
    </div>
  );
}
