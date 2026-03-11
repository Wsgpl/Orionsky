import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useStore } from "../store";
import type { WeatherCell } from "../types";

const OWM_TILE_KEY = import.meta.env.VITE_OWM_KEY || "";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inferStep(values: number[], fallback: number): number {
  const unique = Array.from(new Set(values.map((value) => Number(value.toFixed(2))))).sort((a, b) => a - b);
  let best = Number.POSITIVE_INFINITY;

  for (let index = 1; index < unique.length; index += 1) {
    const diff = Math.abs(unique[index] - unique[index - 1]);
    if (diff > 0.2 && diff < best) best = diff;
  }

  return Number.isFinite(best) ? best : fallback;
}

function getTemperatureFill(tempC: number): string {
  const normalized = clamp((tempC - 8) / 30, 0, 1);
  const hue = 58 - normalized * 24;
  const saturation = 94 - normalized * 10;
  const lightness = 74 - normalized * 18;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getTemperatureLabelBackground(tempC: number): string {
  const normalized = clamp((tempC - 8) / 30, 0, 1);
  const hue = 58 - normalized * 24;
  const saturation = 92 - normalized * 8;
  const lightness = 78 - normalized * 18;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getTemperatureLabelColor(tempC: number): string {
  const normalized = clamp((tempC - 8) / 30, 0, 1);
  const hue = 32 - normalized * 8;
  const saturation = 82 + normalized * 6;
  const lightness = 28 - normalized * 8;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function buildTemperaturePopup(cell: WeatherCell): string {
  return `
    <div class="wx-temp-popup">
      <div class="wx-temp-popup__label">Temperature</div>
      <div class="wx-temp-popup__value">${Math.round(cell.data.temperature)} C</div>
      <div class="wx-temp-popup__meta">
        ${cell.data.latitude.toFixed(2)} N, ${cell.data.longitude.toFixed(2)} E
      </div>
    </div>
  `;
}

function WeatherLayers() {
  const map = useMap();
  const activeWeather = useStore((s) => s.activeWeatherMode);
  const weatherCells = useStore((s) => s.weatherCells);
  const precipitationLayerRef = useRef<L.TileLayer | null>(null);
  const windLayerRef = useRef<L.TileLayer | null>(null);
  const pressureLayerRef = useRef<L.TileLayer | null>(null);
  const temperatureLayerRef = useRef<L.LayerGroup | null>(null);
  const radarFramesRef = useRef<number[]>([]);
  const radarTimerRef = useRef<number>(0);
  const radarFetchRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!temperatureLayerRef.current) {
      temperatureLayerRef.current = L.layerGroup();
    }

    temperatureLayerRef.current.clearLayers();

    const latHalf = clamp(inferStep(weatherCells.map((cell) => cell.data.latitude), 3) / 2, 0.9, 1.8);
    const lonHalf = clamp(inferStep(weatherCells.map((cell) => cell.data.longitude), 3) / 2, 0.9, 1.8);

    for (const cell of weatherCells) {
      const { latitude, longitude, temperature } = cell.data;
      const bounds = L.latLngBounds(
        [latitude - latHalf, longitude - lonHalf],
        [latitude + latHalf, longitude + lonHalf]
      );

      const wash = L.rectangle(bounds, {
        className: "wx-temp-wash",
        stroke: false,
        fillColor: getTemperatureFill(temperature),
        fillOpacity: 0.42,
        interactive: true,
      }).bindPopup(buildTemperaturePopup(cell), {
        className: "wx-temp-popup-shell",
        closeButton: false,
        offset: L.point(0, -4),
      });

      const label = L.marker([latitude, longitude], {
        interactive: true,
        icon: L.divIcon({
          className: "",
          iconSize: [40, 24],
          iconAnchor: [20, 12],
          html: `<div class="wx-temp-label" style="background:${getTemperatureLabelBackground(temperature)};color:${getTemperatureLabelColor(temperature)};">${Math.round(temperature)}°</div>`,
        }),
      }).bindPopup(buildTemperaturePopup(cell), {
        className: "wx-temp-popup-shell",
        closeButton: false,
        offset: L.point(0, -4),
      });

      temperatureLayerRef.current.addLayer(wash);
      temperatureLayerRef.current.addLayer(label);
    }
  }, [weatherCells]);

  const ensureRadarFrames = async () => {
    if (radarFramesRef.current.length) return;
    if (radarFetchRef.current) return radarFetchRef.current;

    radarFetchRef.current = fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((res) => res.json())
      .then((data) => {
        const frames: Array<{ time: number }> = Array.isArray(data?.radar?.past) ? data.radar.past : [];
        radarFramesRef.current = frames.map((frame) => frame.time);
        if (precipitationLayerRef.current && radarFramesRef.current.length) {
          precipitationLayerRef.current.setUrl(
            `https://tilecache.rainviewer.com/v2/radar/${radarFramesRef.current[radarFramesRef.current.length - 1]}/256/{z}/{x}/{y}/2/1_1.png`
          );
        }
      })
      .finally(() => {
        radarFetchRef.current = null;
      });

    return radarFetchRef.current;
  };

  useEffect(() => {
    if (!precipitationLayerRef.current) {
      precipitationLayerRef.current = L.tileLayer(
        "https://tilecache.rainviewer.com/v2/radar/0/256/{z}/{x}/{y}/2/1_1.png",
        { opacity: 0.72 }
      );
    }

    if (!windLayerRef.current && OWM_TILE_KEY) {
      windLayerRef.current = L.tileLayer(
        `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${OWM_TILE_KEY}`,
        { opacity: 0.82 }
      );
    }

    if (!pressureLayerRef.current && OWM_TILE_KEY) {
      pressureLayerRef.current = L.tileLayer(
        `https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid=${OWM_TILE_KEY}`,
        { opacity: 0.84 }
      );
    }

    if (!temperatureLayerRef.current) {
      temperatureLayerRef.current = L.layerGroup();
    }

    return () => {
      if (radarTimerRef.current) window.clearTimeout(radarTimerRef.current);
      precipitationLayerRef.current?.remove();
      windLayerRef.current?.remove();
      pressureLayerRef.current?.remove();
      temperatureLayerRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (radarTimerRef.current) {
      window.clearTimeout(radarTimerRef.current);
      radarTimerRef.current = 0;
    }

    precipitationLayerRef.current?.removeFrom(map);
    windLayerRef.current?.removeFrom(map);
    pressureLayerRef.current?.removeFrom(map);
    temperatureLayerRef.current?.removeFrom(map);

    if (activeWeather === "temperature" && temperatureLayerRef.current) {
      temperatureLayerRef.current.addTo(map);
      return;
    }

    if (activeWeather === "precipitation" && precipitationLayerRef.current) {
      precipitationLayerRef.current.addTo(map);
      void ensureRadarFrames().then(() => {
        const frames = radarFramesRef.current;
        if (!frames.length || useStore.getState().activeWeatherMode !== "precipitation") return;

        let frameIndex = frames.length - 1;
        const animate = () => {
          if (!precipitationLayerRef.current || useStore.getState().activeWeatherMode !== "precipitation") return;
          precipitationLayerRef.current.setUrl(
            `https://tilecache.rainviewer.com/v2/radar/${frames[frameIndex]}/256/{z}/{x}/{y}/2/1_1.png`
          );
          frameIndex = (frameIndex + 1) % frames.length;
          radarTimerRef.current = window.setTimeout(animate, 1400);
        };
        animate();
      });
      return;
    }

    if (activeWeather === "wind" && windLayerRef.current) {
      windLayerRef.current.addTo(map);
      return;
    }

    if (activeWeather === "pressure" && pressureLayerRef.current) {
      pressureLayerRef.current.addTo(map);
    }
  }, [activeWeather, map]);

  return null;
}

export function WeatherDashboard() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapContainer center={[22, 82]} zoom={4.6} style={{ width: "100%", height: "100%" }} zoomControl={false}>
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" />
        <WeatherLayers />
      </MapContainer>
    </div>
  );
}
