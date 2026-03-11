import { useEffect, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useStore } from "../../store";
import type { ConnectionStatus } from "../../types";
import { getTargetDetail, getTargetKind } from "../../utils/aircraftClassification";
import { aircraftSearchText, getAirlineInfo, getFlightNumber } from "../../utils/airline";
import { getFlightStatusLabel } from "../../utils/flightStatus";
import { searchIndiaLocations } from "../../utils/indiaLocations";
import { airportDisplayCode, searchIndiaAirports } from "../../utils/indiaAirports";
import { searchWeatherPlaces } from "../../utils/weatherMap";
import { getAppPalette } from "../../utils/designSystem";

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isWeatherRoute = location.pathname.startsWith("/weather");
  const isPlanningRoute = location.pathname.startsWith("/planning");
  const aircraft = useStore((s) => s.aircraft);
  const weatherCells = useStore((s) => s.weatherCells);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const lastUpdated = useStore((s) => s.lastUpdated);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const setManualTheme = useStore((s) => s.setManualTheme);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const setSelectedLocation = useStore((s) => s.setSelectedLocation);
  const activeWeatherMode = useStore((s) => s.activeWeatherMode);
  const authSession = useStore((s) => s.authSession);
  const setAuthSession = useStore((s) => s.setAuthSession);
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const airborne = aircraft.filter((item) => !item.on_ground).length;
  const searchEnabled = !isPlanningRoute;
  const searchPlaceholder = isPlanningRoute
    ? "Planner mode: use the route panel to place points on the map"
    : isWeatherRoute
      ? "Search weather locations"
      : "Search aircraft, airports, or locations";

  const searchResults = searchEnabled && search.length >= 2
    ? isWeatherRoute
      ? searchWeatherPlaces(search)
      : [
          ...aircraft.filter((item) => aircraftSearchText(item).includes(search.toLowerCase())).slice(0, 8),
          ...searchIndiaAirports(search).slice(0, 4).map((airport) => ({ ...airport, resultType: "airport" })),
          ...searchIndiaLocations(search).slice(0, 4).map((locationResult) => ({ ...locationResult, resultType: "location" })),
        ]
    : [];

  const handleTheme = () => {
    setManualTheme(true);
    setTheme(theme === "day" ? "night" : "day");
  };

  const handleLogout = () => {
    api.clearSession();
    setAuthSession(null);
    navigate("/radar");
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const openAuthMode = (mode: "login" | "register") => {
    setIsAuthModalOpen(false);
    navigate(`/auth?mode=${mode}`);
  };

  useEffect(() => {
    if (!isAuthModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAuthModalOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAuthModalOpen]);

  const palette = getAppPalette(theme);
  const statusMap: Record<ConnectionStatus, { label: string; color: string }> = {
    connected: { label: "LIVE", color: palette.success },
    disconnected: { label: "OFFLINE", color: palette.danger },
    connecting: { label: "SYNC", color: palette.warning },
    reconnecting: { label: "RETRY", color: palette.warning },
  };
  const status = statusMap[connectionStatus];

  return (
    <>
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
            <span className="topbar-title">ORIONSKY</span>
          </div>
        </div>

        <div className="topbar-search-wrap">
          <span className="topbar-search-icon">{isPlanningRoute ? "PLAN" : isWeatherRoute ? "AREA" : "SRCH"}</span>
          <input
            className="topbar-search"
            placeholder={searchPlaceholder}
            value={search}
            readOnly={!searchEnabled}
            onChange={(event) => {
              if (!searchEnabled) {
                return;
              }
              setSearch(event.target.value);
              setShowResults(true);
            }}
            onFocus={() => {
              if (searchEnabled) {
                setShowResults(true);
              }
            }}
            onBlur={() => setTimeout(() => setShowResults(false), 180)}
          />
          {searchEnabled && search && <button className="topbar-search-clear" onClick={() => setSearch("")}>CLR</button>}
          {showResults && searchResults.length > 0 && (
            <div className="topbar-search-results">
              {searchResults.map((result) => {
                if (isWeatherRoute) {
                  const loc = result as any;
                  return (
                    <div
                      key={loc.id}
                      className="topbar-search-row"
                      onMouseDown={() => {
                        setSelectedLocation(loc);
                        setSearch("");
                        setShowResults(false);
                      }}
                    >
                      <span className="tsr-cs">{loc.name}</span>
                      <span className="tsr-meta">
                        {loc.kind.toUpperCase()} {loc.state ? `- ${loc.state}` : ""}
                      </span>
                    </div>
                  );
                }

                const item = result as any;
                if (item.resultType === "airport" || item.resultType === "location") {
                  return (
                    <div
                      key={item.id}
                      className="topbar-search-row"
                      onMouseDown={() => {
                        setSelectedIcao(null);
                        setSelectedLocation({
                          ...item,
                          kind: item.resultType === "airport" ? "airport" : item.kind,
                          name: item.name || item.city,
                        });
                        setSearch("");
                        setShowResults(false);
                      }}
                    >
                      <span className="tsr-cs">{item.name || item.city}</span>
                      <span className="tsr-meta">
                        {item.resultType === "airport"
                          ? `AIRPORT - ${airportDisplayCode(item)}${item.state ? ` - ${item.state}` : ""}`
                          : `${item.kind?.toUpperCase()} ${item.state ? `- ${item.state}` : ""}`}
                      </span>
                    </div>
                  );
                }

                const aircraftItem = item;
                const targetKind = getTargetKind(aircraftItem);
                const targetDetail = getTargetDetail(aircraftItem);
                const aircraftLabel = `${getFlightNumber(aircraftItem.callsign)} - ${targetKind}`;
                const aircraftMeta = `${getAirlineInfo(aircraftItem.callsign).airline}${targetDetail ? ` - ${targetDetail}` : ""} - ${getFlightStatusLabel(aircraftItem)} - ${aircraftItem.icao} - ${aircraftItem.altitude > 100 ? `FL${Math.round(aircraftItem.altitude / 100)}` : "GND"}`;
                return (
                  <div
                    key={aircraftItem.icao}
                    className="topbar-search-row"
                    onMouseDown={() => {
                      setSelectedIcao(aircraftItem.icao);
                      setSearch("");
                      setShowResults(false);
                    }}
                  >
                    <span className="tsr-cs">{aircraftLabel}</span>
                    <span className="tsr-meta">{aircraftMeta}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="topbar-stats">
          {isPlanningRoute ? (
            <>
              <Stat label="Mode" value="Planning" compact />
              <Stat label="Tracked" value={aircraft.length} />
              <Stat label="Wx Cells" value={weatherCells.length} />
            </>
          ) : isWeatherRoute ? (
            <>
              <Stat label="Wx Cells" value={weatherCells.length} />
              <Stat label="Hottest" value={weatherCells.length ? `${Math.round(Math.max(...weatherCells.map((cell) => cell.data.temperature)))}°C` : "Unavailable"} />
              <Stat label="Wind Max" value={weatherCells.length ? `${Math.round(Math.max(...weatherCells.map((cell) => cell.data.wind_speed)))} m/s` : "Unavailable"} />
              <Stat label="Avg Hum." value={weatherCells.length ? `${Math.round(weatherCells.reduce((sum, cell) => sum + cell.data.humidity, 0) / weatherCells.length)}%` : "Unavailable"} />
              <Stat label="Layer" value={activeWeatherMode === "none" ? "Off" : activeWeatherMode.toUpperCase()} compact />
            </>
          ) : (
            <>
              <Stat label="Tracked" value={aircraft.length} />
              <Stat label="Airborne" value={airborne} />
              <Stat label="Layer" value={activeWeatherMode === "none" ? "Off" : activeWeatherMode.toUpperCase()} compact />
            </>
          )}
        </div>

        <div className="topbar-right">
          <div className="status-chip" style={{ "--status-color": status.color } as CSSProperties}>
            <span className="status-chip-dot" />
            <span className="status-chip-label">{status.label}</span>
          </div>
          {lastUpdated && (
            <div className="topbar-time">
              <span className="topbar-time-label">LIVE UTC</span>
              <span className="topbar-time-value">
                {lastUpdated.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false
                })}
              </span>
            </div>
          )}
          <button className="theme-btn" onClick={handleTheme}>
            {theme === "day" ? (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span>Night</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="12" x2="5.64" y2="12" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span>Day</span>
              </>
            )}
          </button>
          {authSession ? (
            <>
              <div className="auth-chip">
                <div className="auth-chip__icon">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="auth-chip__content">
                  <span className="auth-chip__label">{authSession.role.toUpperCase()}</span>
                  <span className="auth-chip__value">
                    {authSession.name || authSession.email || authSession.subject}
                  </span>
                </div>
              </div>
              <button className="topbar-auth-btn topbar-auth-btn--ghost" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <button className="topbar-auth-btn" onClick={() => setIsAuthModalOpen(true)}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Account</span>
            </button>
          )}
        </div>
      </header>

      <AuthAccessModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        onSelectMode={openAuthMode}
      />
    </>
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

function AuthAccessModal({
  isOpen,
  onClose,
  onSelectMode,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: "login" | "register") => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose}>
      <div
        className="auth-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button
          type="button"
          className="auth-modal__close"
          onClick={onClose}
          aria-label="Close account options"
        >
          X
        </button>
        <div className="auth-modal__kicker">Account Access</div>
        <h2 id="auth-modal-title" className="auth-modal__title">
          Choose how you want to continue
        </h2>
        <p className="auth-modal__copy">
          Sign in with your existing account or create a new one to unlock the user guide and saved access.
        </p>

        <div className="auth-modal__grid">
          <button
            type="button"
            className="auth-modal__option"
            onClick={() => onSelectMode("login")}
          >
            <span className="auth-modal__option-title">Login</span>
            <span className="auth-modal__option-copy">
              Use your existing email and password.
            </span>
          </button>
          <button
            type="button"
            className="auth-modal__option auth-modal__option--accent"
            onClick={() => onSelectMode("register")}
          >
            <span className="auth-modal__option-title">Register</span>
            <span className="auth-modal__option-copy">
              Create an account and verify your email to continue.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
