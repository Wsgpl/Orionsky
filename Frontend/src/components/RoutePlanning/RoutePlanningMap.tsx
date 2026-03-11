import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { MissionGeometryEditor } from "./MissionGeometryEditor";
import { useMapConfig } from "../../hooks/useConfig";
import type { MissionCoordinate, MissionGeometry, MissionPlannerGeometryMode, PolygonPlannerPoint, RoutePlannerPoint } from "../../types";
import type { RoutePlacementMode } from "../../hooks/useRoutePlanner";
import { useStore } from "../../store";
import { INDIA_MAP_BOUNDS, INDIA_MAP_CENTER_POINT, INDIA_MAP_VIEW_PADDING } from "../../utils/indiaViewport";
import { getThemeBasemapUrl } from "../../utils/mapTheme";
import { toLeafletLatLngTuple } from "../../utils/missionGeometry";

type RoutePlanningMapProps = {
  geometryMode: MissionPlannerGeometryMode;
  missionGeometry: MissionGeometry | null;
  routePoints: RoutePlannerPoint[];
  polygonVertices: PolygonPlannerPoint[];
  sampledCoordinates: MissionCoordinate[];
  placementMode: RoutePlacementMode;
  sampleSpacingKm: number;
  onMapPlacement: (coordinate: MissionCoordinate) => void;
  onUpdateOrigin: (coordinate: MissionCoordinate) => void;
  onUpdateDestination: (coordinate: MissionCoordinate) => void;
  onUpdateWaypoint: (waypointId: string, coordinate: MissionCoordinate) => void;
  onUpdatePolygonVertex: (vertexId: string, coordinate: MissionCoordinate) => void;
  onInsertRoutePoint: (afterIndex: number, coordinate: MissionCoordinate) => void;
  onInsertPolygonVertex: (afterIndex: number, coordinate: MissionCoordinate) => void;
  onRemoveRoutePoint: (pointId: string) => void;
  onRemovePolygonVertex: (vertexId: string) => void;
  onInteract?: () => void;
};

function getSelectedLocationFocusKey(
  selectedLocation: {
    id?: string;
    kind?: string;
    name: string;
    latitude: number;
    longitude: number;
    state?: string;
  } | null,
  locationFocusToken: number,
): string {
  if (!selectedLocation) {
    return "";
  }

  if (selectedLocation.kind === "current_location") {
    return `${selectedLocation.id ?? "current-location"}:${locationFocusToken}`;
  }

  return [
    selectedLocation.kind ?? "location",
    selectedLocation.id ?? selectedLocation.name,
    selectedLocation.state ?? "",
    selectedLocation.latitude.toFixed(4),
    selectedLocation.longitude.toFixed(4),
  ].join(":");
}

function fitPlannerMapToIndia(map: L.Map): void {
  map.fitBounds(INDIA_MAP_BOUNDS, {
    padding: INDIA_MAP_VIEW_PADDING,
    animate: false,
  });
}

function PlannerViewController({
  visibleCoordinates,
  isPlacing,
  selectedLocation,
  locationFocusToken,
}: {
  visibleCoordinates: MissionCoordinate[];
  isPlacing: boolean;
  selectedLocation: {
    id?: string;
    kind?: string;
    name: string;
    latitude: number;
    longitude: number;
    state?: string;
  } | null;
  locationFocusToken: number;
}) {
  const map = useMap();
  const lastSignatureRef = useRef<string>("");
  const lastLocationFocusKeyRef = useRef<string>("");

  useEffect(() => {
    if (isPlacing) {
      return;
    }

    const signature = visibleCoordinates
      .map((coordinate) => `${coordinate.lat.toFixed(4)}:${coordinate.lon.toFixed(4)}`)
      .join("|");

    if (visibleCoordinates.length >= 2) {
      if (lastSignatureRef.current === signature) {
        return;
      }

      lastSignatureRef.current = signature;
      lastLocationFocusKeyRef.current = "";
      map.fitBounds(visibleCoordinates.map(toLeafletLatLngTuple), {
        padding: [72, 72],
        maxZoom: 8,
        animate: true,
        duration: 0.9,
      });
      return;
    }

    if (visibleCoordinates.length === 1) {
      if (lastSignatureRef.current === signature) {
        return;
      }

      lastSignatureRef.current = signature;
      lastLocationFocusKeyRef.current = "";
      map.flyTo(toLeafletLatLngTuple(visibleCoordinates[0]), 7, { animate: true, duration: 0.8 });
      return;
    }

    lastSignatureRef.current = "";

    if (selectedLocation) {
      const focusKey = getSelectedLocationFocusKey(selectedLocation, locationFocusToken);
      if (lastLocationFocusKeyRef.current === focusKey) {
        return;
      }

      lastLocationFocusKeyRef.current = focusKey;
      map.flyTo([selectedLocation.latitude, selectedLocation.longitude], 7.2, {
        animate: true,
        duration: 0.9,
      });
      return;
    }

    lastLocationFocusKeyRef.current = "";
    fitPlannerMapToIndia(map);
  }, [isPlacing, locationFocusToken, map, selectedLocation, visibleCoordinates]);

  return null;
}

function PlannerMapClickHandler({
  placementMode,
  onMapPlacement,
  onInteract,
}: {
  placementMode: RoutePlacementMode;
  onMapPlacement: (coordinate: MissionCoordinate) => void;
  onInteract?: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    map.getContainer().style.cursor = placementMode ? "crosshair" : "";

    return () => {
      map.getContainer().style.cursor = "";
    };
  }, [map, placementMode]);

  useMapEvents({
    click: (event) => {
      if (placementMode) {
        onMapPlacement({
          lat: event.latlng.lat,
          lon: event.latlng.lng,
        });
      } else {
        onInteract?.();
      }
    },
    mousedown: () => {
      if (!placementMode) {
        onInteract?.();
      }
    },
  });

  return null;
}


export function RoutePlanningMap({
  geometryMode,
  missionGeometry,
  routePoints,
  polygonVertices,
  sampledCoordinates,
  placementMode,
  sampleSpacingKm,
  onMapPlacement,
  onUpdateOrigin,
  onUpdateDestination,
  onUpdateWaypoint,
  onUpdatePolygonVertex,
  onInsertRoutePoint,
  onInsertPolygonVertex,
  onRemoveRoutePoint,
  onRemovePolygonVertex,
  onInteract,
}: RoutePlanningMapProps) {


  const { config: mapConfig } = useMapConfig();
  const theme = useStore((state) => state.theme);
  const selectedLocation = useStore((state) => state.selectedLocation);
  const locationFocusToken = useStore((state) => state.locationFocusToken);

  const basemapUrl = useMemo(
    () => getThemeBasemapUrl(mapConfig.tiles, theme),
    [mapConfig.tiles, theme],
  );
  const visibleCoordinates = useMemo(() => {
    if (missionGeometry) {
      return missionGeometry.type === "Polygon"
        ? missionGeometry.coordinates.slice(0, -1)
        : missionGeometry.coordinates;
    }
    return geometryMode === "polygon" ? polygonVertices : routePoints;
  }, [geometryMode, missionGeometry, polygonVertices, routePoints]);

  const placementLabel =
    placementMode === "route_draw"
      ? "Click the map to draw the route in order. Each click appends the next mission vertex."
      : placementMode === "origin"
        ? "Click the map to place origin."
        : placementMode === "destination"
          ? "Click the map to place destination."
          : placementMode === "waypoint"
            ? "Click the map to append a waypoint."
            : placementMode === "polygon_draw"
              ? "Click the map to draw the polygon boundary vertex by vertex."
              : geometryMode === "polygon"
                ? "Drag vertices to edit. Click a boundary segment to insert a vertex. Right-click a vertex to remove it."
                : "Drag vertices to edit. Click a route segment to insert a waypoint. Right-click a vertex to remove it.";

  return (
    <div className="planner-map-shell">
      <MapContainer
        center={INDIA_MAP_CENTER_POINT}
        zoom={mapConfig.default_zoom}
        zoomControl={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <PlannerViewController
          visibleCoordinates={visibleCoordinates}
          isPlacing={!!placementMode}
          selectedLocation={selectedLocation}
          locationFocusToken={locationFocusToken}
        />
        <PlannerMapClickHandler placementMode={placementMode} onMapPlacement={onMapPlacement} onInteract={onInteract} />


        <TileLayer key={`planner-basemap-${theme}`} url={basemapUrl} />
        <MissionGeometryEditor
          geometryMode={geometryMode}
          missionGeometry={missionGeometry}
          routePoints={routePoints}
          polygonVertices={polygonVertices}
          sampledCoordinates={sampledCoordinates}
          sampleSpacingKm={sampleSpacingKm}
          onUpdateOrigin={onUpdateOrigin}
          onUpdateDestination={onUpdateDestination}
          onUpdateWaypoint={onUpdateWaypoint}
          onUpdatePolygonVertex={onUpdatePolygonVertex}
          onInsertRoutePoint={onInsertRoutePoint}
          onInsertPolygonVertex={onInsertPolygonVertex}
          onRemoveRoutePoint={onRemoveRoutePoint}
          onRemovePolygonVertex={onRemovePolygonVertex}
        />
      </MapContainer>

    </div>
  );
}
