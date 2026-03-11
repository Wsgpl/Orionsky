import { useState, type CSSProperties } from "react";
import { useStore } from "../../store";
import type { ConnectionStatus } from "../../types";
import { aircraftSearchText, getAirlineInfo, getFlightNumber } from "../../utils/airline";

const STATUS_COPY: Record<ConnectionStatus, { label: string; color: string }> = {
  connected: { label: "LIVE", color: "#00e87a" },
  disconnected: { label: "OFFLINE", color: "#ff3333" },
  connecting: { label: "SYNC", color: "#ff9500" },
  reconnecting: { label: "RETRY", color: "#ff9500" },
};

export function TopBar() {
  const aircraft = useStore((s) => s.aircraft);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const lastUpdated = useStore((s) => s.lastUpdated);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setManualTheme = useStore((s) => s.setManualTheme);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const activeWeatherMode = useStore((s) => s.activeWeatherMode);
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  const airborne = aircraft.filter((item) => !item.on_ground).length;
  const onGround = aircraft.length - airborne;
  const trackedIndian = aircraft.filter((item) => {
    const code = getAirlineInfo(item.callsign).code;
    return ["IGO", "AIC", "AXB", "VTI", "SEJ", "AIA", "UK", "VTR", "IAF", "NAVY"].includes(code);
  }).length;

  const searchResults = search.length >= 2
    ? aircraft.filter((item) => aircraftSearchText(item).includes(search.toLowerCase())).slice(0, 8)
    : [];

  const handleTheme = () => {
    setManualTheme(true);
    setTheme(theme === "day" ? "night" : "day");
  };

  const status = STATUS_COPY[connectionStatus];

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">
          <svg viewBox="0 0 44 44" fill="none" width="34" height="34">
            <circle cx="22" cy="22" r="20" stroke="var(--accent)" strokeWidth="1.4" />
            <circle cx="22" cy="22" r="11" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" />
            <path d="M22 7 L26 22 L22 19 L18 22 Z" fill="var(--accent)" />
            <path d="M10 28 L22 22 L34 28" stroke="var(--accent)" strokeWidth="1.1" strokeOpacity="0.4" />
          </svg>
        </div>
        <div className="topbar-title-group">
          <span className="topbar-kicker">Flight Radar and Weather Desk</span>
          <span className="topbar-title">AEROINTEL RADAR</span>
        </div>
      </div>

      <div className="topbar-search-wrap">
        <span className="topbar-search-icon">SRCH</span>
        <input
          className="topbar-search"
          placeholder="Search flight number, callsign, ICAO, airline"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 180)}
        />
        {search && <button className="topbar-search-clear" onClick={() => setSearch("")}>CLR</button>}
        {showResults && searchResults.length > 0 && (
          <div className="topbar-search-results">
            {searchResults.map((aircraftItem) => (
              <div
                key={aircraftItem.icao}
                className="topbar-search-row"
                onMouseDown={() => {
                  setSelectedIcao(aircraftItem.icao);
                  setSearch("");
                  setShowResults(false);
                }}
              >
                <span className="tsr-cs">{getFlightNumber(aircraftItem.callsign)} - {getAirlineInfo(aircraftItem.callsign).airline}</span>
                <span className="tsr-meta">
                  {(aircraftItem.callsign ?? aircraftItem.icao).trim()} - {aircraftItem.icao} - {aircraftItem.altitude > 100 ? `FL${Math.round(aircraftItem.altitude / 100)}` : "GND"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="topbar-stats">
        <Stat label="Tracked" value={aircraft.length} />
        <Stat label="Airborne" value={airborne} />
        <Stat label="Ground" value={onGround} />
        <Stat label="Indian Ops" value={trackedIndian} />
        <Stat label="Layer" value={activeWeatherMode === "none" ? "Off" : activeWeatherMode.toUpperCase()} compact />
      </div>

      <div className="topbar-right">
        <div className="status-chip" style={{ "--status-color": status.color } as CSSProperties}>
          <span className="status-chip-dot" />
          <span>{status.label}</span>
        </div>
        {lastUpdated && (
          <span className="topbar-upd">
            {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} UTC
          </span>
        )}
        <button className="theme-btn" onClick={handleTheme}>
          {theme === "day" ? "Night" : "Day"}
        </button>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | string;
  compact?: boolean;
}) {
  return (
    <div className={`stat-item ${compact ? "stat-item--compact" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-val">{value}</span>
    </div>
  );
}
