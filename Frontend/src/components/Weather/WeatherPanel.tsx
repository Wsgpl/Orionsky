import { useStore } from "../../store";
import type { CSSProperties } from "react";
import { WeatherMode } from "../../types";

interface WeatherBtn {
  mode: WeatherMode;
  icon: string;
  label: string;
  accent: string;
  description: string;
}

const BUTTONS: WeatherBtn[] = [
  { mode: "temperature", icon: "TMP", label: "TEMP", accent: "#f4793a", description: "Surface temperature" },
  { mode: "wind", icon: "WND", label: "WIND", accent: "#42a5f5", description: "Wind speed and direction" },
  { mode: "precipitation", icon: "PRC", label: "PRECIP", accent: "#4a90e2", description: "Weather condition overlay" },
  { mode: "humidity", icon: "HUM", label: "HUMID", accent: "#4caf50", description: "Relative humidity" },
  { mode: "pressure", icon: "PRS", label: "PRESS", accent: "#26c6da", description: "Surface pressure" },
];

export function WeatherPanel() {
  const mode = useStore((s) => s.activeWeatherMode);
  const setMode = useStore((s) => s.setWeatherMode);

  const toggle = (next: WeatherMode) => setMode(mode === next ? "none" : next);

  return (
    <div className="weather-panel">
      <div className="weather-panel-header">
        <span className="weather-panel-title">WEATHER</span>
        {mode !== "none" && <span className="weather-panel-active-dot" />}
      </div>

      <div className="weather-buttons">
        {BUTTONS.map((btn) => {
          const active = mode === btn.mode;
          return (
            <button
              key={btn.mode}
              className={`wx-btn ${active ? "wx-btn--active" : ""}`}
              style={{ "--wx-accent": btn.accent } as CSSProperties}
              onClick={() => toggle(btn.mode)}
              title={btn.description}
            >
              <span className="wx-btn-icon">{btn.icon}</span>
              <span className="wx-btn-label">{btn.label}</span>
              {active && <span className="wx-btn-pip" />}
            </button>
          );
        })}
      </div>

      {mode !== "none" && <div className="wx-hint">Click map for data</div>}
    </div>
  );
}
