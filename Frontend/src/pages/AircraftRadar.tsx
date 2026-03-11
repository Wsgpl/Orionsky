import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useStore } from "../store";
import { Aircraft } from "../types";
import { getAirlineInfo, getFlightNumber } from "../utils/airline";

type AircraftWithTrack = Aircraft & { track?: number; heading?: number };

function aircraftRotation(ac: AircraftWithTrack): number {
  const rotation = ac.track ?? ac.heading ?? 0;
  return Number.isFinite(rotation) ? rotation : 0;
}

function aircraftTooltip(ac: AircraftWithTrack): string {
  const airline = getAirlineInfo(ac.callsign).airline;
  const flightNo = getFlightNumber(ac.callsign);
  const fl = ac.altitude > 100 ? `FL${Math.round(ac.altitude / 100).toString().padStart(3, "0")}` : "GND";
  return `
    <div style="
      font-family: 'Orbitron', monospace;
      font-size: 10px;
      color: #daf5ff;
      background: rgba(6,10,22,0.95);
      border: 1px solid rgba(0,212,255,0.35);
      border-radius: 7px;
      padding: 5px 10px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.55);
      letter-spacing: 0.5px;
      white-space: nowrap;">
      ${flightNo}
      <br/>
      <span style="font-size:8px;color:#8db1cb">${airline} · ${fl} · ${Math.round(ac.velocity)} km/h</span>
    </div>
  `;
}

function aircraftIcon(ac: AircraftWithTrack, selected: boolean): L.DivIcon {
  const info = getAirlineInfo(ac.callsign);
  const rotation = aircraftRotation(ac);
  const size = selected ? 34 : 28;
  const ring = selected ? "#00d4ff" : "rgba(255,255,255,0.58)";

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;left:50%;top:50%;width:${size}px;height:${size}px;transform:translate(-50%, -50%) rotate(${rotation}deg);">
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="${selected ? 1.8 : 1.1}" result="coloredBlur"/>
              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <g filter="url(#glow)">
            <path d="M7 23 C6 23 5 22 5 20 C5 19 6 18 7 18 L12 18 L17 8 C18 6 20 5 22 5 L25 5 C26 5 27 6 27 7 L24 18 L34 18 L38 12 C39 10 41 9 43 9 L45 9 C46 9 47 10 46.5 11 L42 18 L44 18 C45.5 18 47 19 47 20 C47 21.5 45.5 23 44 23 L42 23 L46.5 30 C47 31 46 32 45 32 L43 32 C41 32 39 31 38 29 L34 23 L24 23 L27 34 C27 35 26 36 25 36 L22 36 C20 36 18 35 17 33 L12 23 Z"
              fill="${info.color}" stroke="white" stroke-width="1.1" stroke-linejoin="round"/>
            <circle cx="24" cy="24" r="19" fill="none" stroke="${ring}" stroke-width="${selected ? 2 : 1.1}" opacity="${selected ? 0.86 : 0.45}"/>
          </g>
        </svg>
      </div>
    `,
  });
}

function AircraftLayer() {
  const map = useMap();
  const aircraft = useStore((s) => s.aircraft) as AircraftWithTrack[];
  const selectedIcao = useStore((s) => s.selectedIcao);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);

  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const prevPositionsRef = useRef<Map<string, [number, number]>>(new Map());
  const animationRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const seen = new Set<string>();

    for (const ac of aircraft) {
      seen.add(ac.icao);
      const selected = selectedIcao === ac.icao;
      const existing = markersRef.current.get(ac.icao);

      if (existing) {
        existing.setIcon(aircraftIcon(ac, selected));
        existing.getTooltip()?.setContent(aircraftTooltip(ac));

        const prev = prevPositionsRef.current.get(ac.icao);
        if (prev) {
          const [fromLat, fromLng] = prev;
          const steps = 18;
          const durationMs = 14000;
          const intervalMs = durationMs / steps;
          const running = animationRef.current.get(ac.icao);
          if (running) clearTimeout(running);
          let step = 0;
          const animate = () => {
            step += 1;
            const t = Math.min(1, step / steps);
            const lat = fromLat + (ac.latitude - fromLat) * t;
            const lng = fromLng + (ac.longitude - fromLng) * t;
            existing.setLatLng([lat, lng]);
            if (step < steps) {
              const timer = window.setTimeout(animate, intervalMs);
              animationRef.current.set(ac.icao, timer);
            }
          };
          animate();
        } else {
          existing.setLatLng([ac.latitude, ac.longitude]);
        }
      } else {
        const marker = L.marker([ac.latitude, ac.longitude], {
          icon: aircraftIcon(ac, selected),
          zIndexOffset: selected ? 1000 : 0,
        })
          .addTo(map)
          .bindTooltip(aircraftTooltip(ac), {
            className: "ac-tooltip",
            permanent: false,
            direction: "top",
            offset: [0, -10],
          })
          .on("click", (ev) => {
            L.DomEvent.stopPropagation(ev);
            const current = useStore.getState().selectedIcao;
            setSelectedIcao(current === ac.icao ? null : ac.icao);
          });
        markersRef.current.set(ac.icao, marker);
      }

      prevPositionsRef.current.set(ac.icao, [ac.latitude, ac.longitude]);
    }

    for (const [icao, marker] of markersRef.current.entries()) {
      if (!seen.has(icao)) {
        marker.remove();
        markersRef.current.delete(icao);
        prevPositionsRef.current.delete(icao);
        const timer = animationRef.current.get(icao);
        if (timer) {
          clearTimeout(timer);
          animationRef.current.delete(icao);
        }
      }
    }
  }, [aircraft, map, selectedIcao, setSelectedIcao]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      animationRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return null;
}

function MapClickReset() {
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);

  useEffect(() => {
    return () => setSelectedIcao(null);
  }, [setSelectedIcao]);

  return null;
}

export function AircraftRadar() {
  const center = useMemo<[number, number]>(() => [22, 82], []);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapContainer center={center} zoom={4.6} style={{ width: "100%", height: "100%" }} zoomControl={false}>
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
        <AircraftLayer />
        <MapClickReset />
      </MapContainer>
    </div>
  );
}
