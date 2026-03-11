import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../services/api";
import { useStore } from "../../store";
import type { ForecastResponse } from "../../types";
import { getTargetDetail, getTargetKind } from "../../utils/aircraftClassification";
import { compassPoint, formatCoord } from "../../utils/mapHelpers";
import { getAirlineInfo, getFlightNumber } from "../../utils/airline";
import { getFlightStatus, getFlightStatusLabel } from "../../utils/flightStatus";

function getUnavailableScheduleTimes(): {
  departureTime: string;
  arrivalTime: string;
  departureMeta: string;
  arrivalMeta: string;
} {
  return {
    departureTime: "Data unavailable",
    arrivalTime: "Data unavailable",
    departureMeta: "Real schedule data unavailable",
    arrivalMeta: "Real schedule data unavailable",
  };
}

function hasForecastData(forecast: ForecastResponse | null): boolean {
  if (!forecast) {
    return false;
  }

  if (typeof forecast.source === "string" && forecast.source.toLowerCase() === "unavailable") {
    return false;
  }

  return Boolean(forecast.current) || forecast.daily.length > 0 || forecast.hourly.length > 0;
}

export function DetailDrawer() {
  const selectedAircraft = useStore((s) => s.selectedAircraft);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setSelectedIcao = useStore((s) => s.setSelectedIcao);
  const advisories = useStore((s) => s.weatherAdvisories);
  const weatherCells = useStore((s) => s.weatherCells);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const forecastLat = selectedAircraft ? Number(selectedAircraft.latitude.toFixed(2)) : null;
  const forecastLon = selectedAircraft ? Number(selectedAircraft.longitude.toFixed(2)) : null;

  useEffect(() => {
    let active = true;

    if (!selectedAircraft) {
      setForecast(null);
      setForecastError(null);
      setForecastLoading(false);
      return () => {
        active = false;
      };
    }

    setForecastLoading(true);
    setForecastError(null);

    void api
      .getForecast({ lat: forecastLat ?? selectedAircraft.latitude, lon: forecastLon ?? selectedAircraft.longitude })
      .then((response) => {
        if (!active) {
          return;
        }
        if (!hasForecastData(response)) {
          setForecast(null);
          setForecastError("Data unavailable.");
          return;
        }
        setForecast(response);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setForecast(null);
        setForecastError(getErrorMessage(error, "Data unavailable."));
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setForecastLoading(false);
      });

    return () => {
      active = false;
    };
  }, [forecastLat, forecastLon, selectedAircraft?.icao]);

  if (!selectedAircraft) {
    return <div className={`detail-drawer ${drawerOpen ? "detail-drawer--open" : ""}`} />;
  }

  const aircraft = selectedAircraft;
  const advisory = advisories.find((item) => item.aircraft === aircraft.icao);
  const targetKind = getTargetKind(aircraft);
  const airline = getAirlineInfo(aircraft.callsign).airline;
  const flightNo = getFlightNumber(aircraft.callsign);
  const classification = getTargetDetail(aircraft) ?? airline;
  const flightStatus = getFlightStatus(aircraft);
  const flightStatusLabel = getFlightStatusLabel(aircraft);

  const nearestWeather =
    weatherCells.length > 0
      ? weatherCells.reduce((best, cell) => {
          const distance = Math.hypot(cell.data.latitude - aircraft.latitude, cell.data.longitude - aircraft.longitude);
          const bestDistance = Math.hypot(best.data.latitude - aircraft.latitude, best.data.longitude - aircraft.longitude);
          return distance < bestDistance ? cell : best;
        })
      : null;

  const weatherRisk = advisory ? (advisory.severity === "HIGH" ? 95 : advisory.severity === "MEDIUM" ? 60 : 25) : 0;
  const icingRisk =
    aircraft.altitude > 18000 && nearestWeather && nearestWeather.data.temperature < 2
      ? Math.min(90, 40 + (2 - nearestWeather.data.temperature) * 5)
      : nearestWeather && nearestWeather.data.temperature < 0
        ? 20
        : 5;
  const overallRisk = Math.max(weatherRisk, icingRisk);
  const scheduleTimes = getUnavailableScheduleTimes();

  return (
    <>
    <div className={`detail-drawer ${drawerOpen ? "detail-drawer--open" : ""}`}>
      <div className="drawer-header">
        <div className="drawer-ac-identity">
          <div className="drawer-plane-glyph">
            <svg
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              style={{ transform: `rotate(${aircraft.heading}deg)`, transition: "transform 0.4s ease" }}
            >
              <path d="M20 2 L25 20 L20 17 L15 20 Z" fill="currentColor" />
              <path d="M10 22 L20 18 L30 22 L28 25 L20 22 L12 25 Z" fill="currentColor" opacity="0.6" />
              <path d="M15 30 L20 27 L25 30 L24 33 L20 31 L16 33 Z" fill="currentColor" opacity="0.4" />
            </svg>
          </div>
          <div className="drawer-ac-info">
            <div className="drawer-callsign">{flightNo}</div>
            <div className="drawer-icao-hex">{targetKind}</div>
            <div className="drawer-icao-hex">{classification}</div>
            <div className="drawer-icao-hex">{(aircraft.callsign ?? aircraft.icao).trim()} - {aircraft.icao}</div>
            <div className="drawer-status-pill">
              <span className={`pill ${aircraft.on_ground ? "pill--ground" : "pill--airborne"}`}>{flightStatusLabel}</span>
              <span className="pill pill--type">{targetKind.toUpperCase()}</span>
              {advisory && <span className={`pill pill--wx-${advisory.severity.toLowerCase()}`}>{advisory.severity} WX</span>}
            </div>
          </div>
        </div>

        <div className="drawer-risk-gauge">
          <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60">
            <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
            <circle
              cx="30"
              cy="30"
              r="26"
              stroke={overallRisk > 70 ? "#ff3333" : overallRisk > 40 ? "#ff8800" : "#00ff88"}
              strokeWidth="5"
              strokeDasharray={`${(overallRisk / 100) * 163.4} 163.4`}
              strokeLinecap="round"
              transform="rotate(-90 30 30)"
            />
            <text x="30" y="33" textAnchor="middle" fontSize="13" fontFamily="Share Tech Mono" fill="white" fontWeight="700">
              {overallRisk}
            </text>
          </svg>
          <span className="risk-gauge-label">RISK</span>
        </div>
      </div>

      <div className="drawer-body">
        <DrawerSection title="FLIGHT ROUTE">
          <div className="data-grid data-grid--2">
            <DataCell
              label="DEPARTURE PLACE"
              value="Data unavailable"
              sub="Real route data unavailable"
            />
            <DataCell
              label="ARRIVAL PLACE"
              value="Data unavailable"
              sub="Real route data unavailable"
            />
          </div>
        </DrawerSection>

        <DrawerSection title="DEPARTURE & ARRIVAL">
          <div className="data-grid data-grid--2">
            <DataCell
              label="DEPARTURE TIME"
              value={scheduleTimes.departureTime}
              sub={scheduleTimes.departureMeta}
            />
            <DataCell
              label="ARRIVAL TIME"
              value={scheduleTimes.arrivalTime}
              sub={scheduleTimes.arrivalMeta}
            />
          </div>
        </DrawerSection>

        <DrawerSection title="POSITION">
          <div className="data-grid">
            <DataCell label="LATITUDE" value={formatCoord(aircraft.latitude, "lat")} />
            <DataCell label="LONGITUDE" value={formatCoord(aircraft.longitude, "lon")} />
            <DataCell label="ALTITUDE" value={`${Math.round(aircraft.altitude).toLocaleString()} ft`} />
          </div>
        </DrawerSection>

        <DrawerSection title="FLIGHT TELEMETRY">
          <div className="data-grid">
            <DataCell label="GROUND SPEED" value={`${Math.round(aircraft.velocity)}`} unit="km/h" />
            <DataCell label="HEADING" value={`${Math.round(aircraft.heading)} deg`} sub={compassPoint(aircraft.heading)} />
            <DataCell
              label="FLIGHT PHASE"
              value={
                flightStatus === "taxiing"
                  ? "TAXI"
                  : flightStatus === "recently_landed"
                    ? "LANDED"
                    : flightStatus === "arriving"
                      ? "APPROACH"
                      : flightStatus === "departing"
                        ? "DEPARTURE"
                        : aircraft.altitude < 20000
                          ? "CLIMBING"
                          : "CRUISE"
              }
            />
          </div>
        </DrawerSection>

        <DrawerSection title="FORECAST">
          {forecastLoading ? (
            <div className="drawer-note">Loading...</div>
          ) : forecastError ? (
            <div className="drawer-note drawer-note--danger">{forecastError}</div>
          ) : forecast ? (
            <>
              {forecast.current && (
                <div className="data-grid">
                  <DataCell label="CURRENT TEMP" value={`${forecast.current.temperature.toFixed(1)} C`} />
                  <DataCell label="CURRENT WIND" value={`${forecast.current.wind_speed.toFixed(1)} m/s`} />
                  <DataCell label="CURRENT VIS." value={`${(forecast.current.visibility / 1000).toFixed(1)} km`} />
                  <DataCell label="CONDITION" value={forecast.current.condition?.toUpperCase() ?? "DATA UNAVAILABLE"} />
                </div>
              )}

              {forecast.daily.length > 0 && (
                <div className="drawer-forecast-list">
                  {forecast.daily.slice(0, 3).map((item) => (
                    <div key={item.date} className="drawer-forecast-row">
                      <div className="drawer-forecast-day">{formatDrawerDate(item.date)}</div>
                      <div className="drawer-forecast-values">
                        <span>{item.temp_min !== null ? `${Math.round(item.temp_min)} C` : "Data unavailable"}</span>
                        <span>{item.temp_max !== null ? `${Math.round(item.temp_max)} C` : "Data unavailable"}</span>
                        <span>{item.condition ?? "Data unavailable"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="drawer-note">Data unavailable.</div>
          )}
        </DrawerSection>

        <DrawerSection title="RISK ASSESSMENT">
          <RiskBar
            label="WEATHER RISK"
            value={weatherRisk}
            color={weatherRisk > 70 ? "#ff3333" : weatherRisk > 40 ? "#ff8800" : "#00ff88"}
            status={weatherRisk > 70 ? "SEVERE" : weatherRisk > 40 ? "MODERATE" : "CLEAR"}
          />
          <RiskBar
            label="ICING RISK"
            value={icingRisk}
            color={icingRisk > 60 ? "#42a5f5" : icingRisk > 30 ? "#90caf9" : "#00ff88"}
            status={icingRisk > 60 ? "HIGH" : icingRisk > 20 ? "MODERATE" : "LOW"}
          />
        </DrawerSection>
      </div>

    </div>

    {/* Floating Back Button for Radar Details */}
    {drawerOpen && (
      <button 
        className="planner-toggle-btn radar-details-back-btn" 
        style={{ 
          position: "absolute", 
          right: "424px", /* 390px drawer width + 14px gutter + offset */
          top: "120px",
          zIndex: 800,
          background: "var(--bg-glass)", 
          color: "var(--text-0)",
          border: "1px solid var(--border-1)",
          backdropFilter: "var(--blur)",
          WebkitBackdropFilter: "var(--blur)",
          pointerEvents: "auto"
        }}
        onClick={() => setSelectedIcao(null)}
        title="Back to Radar"
      >
        <svg 
          className="blinking-arrow-icon"
          width="24" 
          height="24" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6"/>
        </svg>
      </button>
    )}
    </>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="drawer-section">
      <div className="drawer-section-title">{title}</div>
      {children}
    </div>
  );
}

function DataCell({
  label,
  value,
  unit,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`data-cell ${highlight ? "data-cell--highlight" : ""}`}>
      <div className="data-cell-label">{label}</div>
      <div className="data-cell-value">
        {value}
        {unit && <span className="data-cell-unit"> {unit}</span>}
      </div>
      {sub && <div className="data-cell-sub">{sub}</div>}
    </div>
  );
}

function RiskBar({
  label,
  value,
  color,
  status,
}: {
  label: string;
  value: number;
  color: string;
  status: string;
}) {
  return (
    <div className="risk-bar">
      <div className="risk-bar-header">
        <span className="risk-bar-label">{label}</span>
        <span className="risk-bar-status" style={{ color }}>
          {status}
        </span>
      </div>
      <div className="risk-bar-track">
        <div
          className="risk-bar-fill"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}

function formatDrawerDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", weekday: "short" });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const maybeAxios = error as {
      response?: {
        data?: {
          detail?: string;
        };
      };
      message?: string;
    };
    if (maybeAxios.response?.data?.detail) {
      return maybeAxios.response.data.detail;
    }
    if (maybeAxios.message) {
      return maybeAxios.message;
    }
  }
  return fallback;
}
