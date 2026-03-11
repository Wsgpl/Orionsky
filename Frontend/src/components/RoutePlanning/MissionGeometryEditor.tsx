import { useMemo } from "react";
import L from "leaflet";
import {
  CircleMarker,
  Marker,
  Polygon,
  Polyline,
  Tooltip,
} from "react-leaflet";
import type { MissionCoordinate, MissionGeometry, MissionPlannerGeometryMode, PolygonPlannerPoint, RoutePlannerPoint } from "../../types";
import {
  buildMissionGeometrySegments,
  toLeafletLatLngTuple,
} from "../../utils/missionGeometry";

type MissionGeometryEditorProps = {
  geometryMode: MissionPlannerGeometryMode;
  missionGeometry: MissionGeometry | null;
  routePoints: RoutePlannerPoint[];
  polygonVertices: PolygonPlannerPoint[];
  sampledCoordinates: MissionCoordinate[];
  sampleSpacingKm: number;
  onUpdateOrigin: (coordinate: MissionCoordinate) => void;
  onUpdateDestination: (coordinate: MissionCoordinate) => void;
  onUpdateWaypoint: (waypointId: string, coordinate: MissionCoordinate) => void;
  onUpdatePolygonVertex: (vertexId: string, coordinate: MissionCoordinate) => void;
  onInsertRoutePoint: (afterIndex: number, coordinate: MissionCoordinate) => void;
  onInsertPolygonVertex: (afterIndex: number, coordinate: MissionCoordinate) => void;
  onRemoveRoutePoint: (pointId: string) => void;
  onRemovePolygonVertex: (vertexId: string) => void;
};

function createPlannerIcon(kind: RoutePlannerPoint["kind"] | PolygonPlannerPoint["kind"], label: string): L.DivIcon {
  const themeMap = {
    origin: {
      color: "#16a34a",
      ring: "rgba(22, 163, 74, 0.24)",
      text: "ORG",
    },
    waypoint: {
      color: "#d97706",
      ring: "rgba(217, 119, 6, 0.24)",
      text: label,
    },
    destination: {
      color: "#dc2626",
      ring: "rgba(220, 38, 38, 0.24)",
      text: "DST",
    },
    polygon_vertex: {
      color: "#7c3aed",
      ring: "rgba(124, 58, 237, 0.24)",
      text: label,
    },
  } as const;

  const style = themeMap[kind];

  return L.divIcon({
    className: "",
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `
      <div style="position:relative;width:42px;height:42px;display:grid;place-items:center;">
        <div style="
          position:absolute;
          inset:6px;
          border-radius:999px;
          background:${style.ring};
          filter:blur(6px);
        "></div>
        <div style="
          position:relative;
          width:32px;
          height:32px;
          display:grid;
          place-items:center;
          border-radius:999px;
          background:${style.color};
          border:2px solid rgba(255,255,255,0.88);
          box-shadow:0 10px 18px rgba(15,23,42,0.24);
          color:#ffffff;
          font:700 8px/1 Orbitron, monospace;
          letter-spacing:1.2px;
        ">${style.text}</div>
      </div>
    `,
  });
}

function PlannerPointMarker({
  point,
  iconLabel,
  onDrag,
  onRemove,
}: {
  point: RoutePlannerPoint | PolygonPlannerPoint;
  iconLabel: string;
  onDrag: (coordinate: MissionCoordinate) => void;
  onRemove: () => void;
}) {
  return (
    <Marker
      position={toLeafletLatLngTuple(point)}
      draggable
      icon={createPlannerIcon(point.kind, iconLabel)}
      eventHandlers={{
        dragend: (event) => {
          const marker = event.target as L.Marker;
          const latLng = marker.getLatLng();
          onDrag({
            lat: latLng.lat,
            lon: latLng.lng,
          });
        },
        contextmenu: (event) => {
          event.originalEvent.preventDefault();
          event.originalEvent.stopPropagation();
          onRemove();
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -18]} opacity={0.98}>
        {point.label} / drag to edit / right-click to remove
      </Tooltip>
    </Marker>
  );
}

function SegmentInsertTarget({
  start,
  end,
  label,
  onInsert,
}: {
  start: MissionCoordinate;
  end: MissionCoordinate;
  label: string;
  onInsert: (coordinate: MissionCoordinate) => void;
}) {
  return (
    <Polyline
      positions={[toLeafletLatLngTuple(start), toLeafletLatLngTuple(end)]}
      pathOptions={{
        color: "#0f172a",
        weight: 16,
        opacity: 0.01,
        lineCap: "round",
        lineJoin: "round",
      }}
      eventHandlers={{
        click: (event) => {
          event.originalEvent.preventDefault();
          event.originalEvent.stopPropagation();
          onInsert({
            lat: event.latlng.lat,
            lon: event.latlng.lng,
          });
        },
      }}
    >
      <Tooltip direction="center" opacity={0.92}>
        {label}
      </Tooltip>
    </Polyline>
  );
}

export function MissionGeometryEditor({
  geometryMode,
  missionGeometry,
  routePoints,
  polygonVertices,
  sampledCoordinates,
  sampleSpacingKm,
  onUpdateOrigin,
  onUpdateDestination,
  onUpdateWaypoint,
  onUpdatePolygonVertex,
  onInsertRoutePoint,
  onInsertPolygonVertex,
  onRemoveRoutePoint,
  onRemovePolygonVertex,
}: MissionGeometryEditorProps) {
  const lineLatLngs = useMemo(
    () => (missionGeometry?.type === "LineString" ? missionGeometry.coordinates.map(toLeafletLatLngTuple) : []),
    [missionGeometry],
  );
  const polygonLatLngs = useMemo(
    () => (missionGeometry?.type === "Polygon" ? missionGeometry.coordinates.slice(0, -1).map(toLeafletLatLngTuple) : []),
    [missionGeometry],
  );
  const openPolygonLatLngs = useMemo(
    () => polygonVertices.map(toLeafletLatLngTuple),
    [polygonVertices],
  );
  const sampledLatLngs = useMemo(
    () => sampledCoordinates.slice(1, -1).map(toLeafletLatLngTuple),
    [sampledCoordinates],
  );
  const routeSegments = useMemo(
    () => buildMissionGeometrySegments(routePoints, { closed: false }),
    [routePoints],
  );
  const polygonSegments = useMemo(
    () =>
      buildMissionGeometrySegments(polygonVertices, {
        closed: missionGeometry?.type === "Polygon",
      }),
    [missionGeometry, polygonVertices],
  );

  return (
    <>
      {geometryMode === "route" && lineLatLngs.length >= 2 && (
        <>
          <Polyline
            positions={lineLatLngs}
            pathOptions={{
              color: "rgba(11, 116, 178, 0.18)",
              weight: 10,
              opacity: 0.32,
              lineCap: "round",
              lineJoin: "round",
            }}
            interactive={false}
          />
          <Polyline
            positions={lineLatLngs}
            pathOptions={{
              color: "#0f5f91",
              weight: 4,
              opacity: 0.92,
              lineCap: "round",
              lineJoin: "round",
              dashArray: "10 8",
            }}
            interactive={false}
          />
          {routeSegments.map((segment) => (
            <SegmentInsertTarget
              key={segment.id}
              start={segment.start}
              end={segment.end}
              label="Click segment to insert a route vertex"
              onInsert={(coordinate) => onInsertRoutePoint(segment.afterIndex, coordinate)}
            />
          ))}
        </>
      )}

      {geometryMode === "polygon" && polygonLatLngs.length >= 3 && (
        <>
          <Polygon
            positions={polygonLatLngs}
            pathOptions={{
              color: "#7c3aed",
              weight: 3,
              opacity: 0.94,
              fillColor: "rgba(124, 58, 237, 0.22)",
              fillOpacity: 0.24,
            }}
          />
          <Polyline
            positions={polygonLatLngs}
            pathOptions={{
              color: "rgba(124, 58, 237, 0.28)",
              weight: 10,
              opacity: 0.28,
              lineCap: "round",
              lineJoin: "round",
            }}
            interactive={false}
          />
          {polygonSegments.map((segment) => (
            <SegmentInsertTarget
              key={segment.id}
              start={segment.start}
              end={segment.end}
              label="Click boundary to insert a polygon vertex"
              onInsert={(coordinate) => onInsertPolygonVertex(segment.afterIndex, coordinate)}
            />
          ))}
        </>
      )}

      {geometryMode === "polygon" && !missionGeometry && openPolygonLatLngs.length >= 2 && (
        <>
          <Polyline
            positions={openPolygonLatLngs}
            pathOptions={{
              color: "#7c3aed",
              weight: 4,
              opacity: 0.92,
              lineCap: "round",
              lineJoin: "round",
              dashArray: "8 8",
            }}
            interactive={false}
          />
          {polygonSegments.map((segment) => (
            <SegmentInsertTarget
              key={segment.id}
              start={segment.start}
              end={segment.end}
              label="Click edge to insert a polygon vertex"
              onInsert={(coordinate) => onInsertPolygonVertex(segment.afterIndex, coordinate)}
            />
          ))}
        </>
      )}

      {geometryMode === "route" &&
        sampledLatLngs.map((position, index) => (
          <CircleMarker
            key={`${position[0]}-${position[1]}-${index}`}
            center={position}
            radius={5}
            pathOptions={{
              color: "#0f5f91",
              weight: 2,
              fillColor: "#ffffff",
              fillOpacity: 0.86,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.96}>
              Sample {index + 1} / {sampleSpacingKm} km
            </Tooltip>
          </CircleMarker>
        ))}

      {geometryMode === "route" &&
        routePoints.map((point) => {
          if (point.kind === "origin") {
            return (
              <PlannerPointMarker
                key={point.id}
                point={point}
                iconLabel="ORG"
                onDrag={onUpdateOrigin}
                onRemove={() => onRemoveRoutePoint(point.id)}
              />
            );
          }
          if (point.kind === "destination") {
            return (
              <PlannerPointMarker
                key={point.id}
                point={point}
                iconLabel="DST"
                onDrag={onUpdateDestination}
                onRemove={() => onRemoveRoutePoint(point.id)}
              />
            );
          }
          return (
            <PlannerPointMarker
              key={point.id}
              point={point}
              iconLabel={point.label.replace("Waypoint ", "W")}
              onDrag={(coordinate) => onUpdateWaypoint(point.id, coordinate)}
              onRemove={() => onRemoveRoutePoint(point.id)}
            />
          );
        })}

      {geometryMode === "polygon" &&
        polygonVertices.map((vertex, index) => (
          <PlannerPointMarker
            key={vertex.id}
            point={vertex}
            iconLabel={`P${index + 1}`}
            onDrag={(coordinate) => onUpdatePolygonVertex(vertex.id, coordinate)}
            onRemove={() => onRemovePolygonVertex(vertex.id)}
          />
        ))}
    </>
  );
}
