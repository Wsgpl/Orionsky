import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { TopBar } from "./components/TopBar/TopBar";
import { SidePanel } from "./components/SidePanel/SidePanel";
import { DetailDrawer } from "./components/Drawer/DetailDrawer";
import { OverviewDock } from "./components/OverviewDock/OverviewDock";
import { AircraftRadar } from "./pages/AircraftRadar";
import { WeatherDashboard } from "./pages/WeatherDashboard";
import { useAircraftStream } from "./hooks/useAircraftStream";
import { useWeatherLayer } from "./hooks/useWeatherLayer";
import { useThemeBySunCycle } from "./hooks/useThemeBySunCycle";
import { useWebSocket } from "./hooks/useWebSocket";
import { useStore } from "./store";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootOut, setBootOut] = useState(false);
  const theme = useStore((s) => s.theme);
  const location = useLocation();
  const isWeatherRoute = location.pathname.startsWith("/weather");
  const isRadarRoute = location.pathname.startsWith("/radar");

  useAircraftStream();
  useWeatherLayer();
  useThemeBySunCycle();
  useWebSocket();

  useEffect(() => {
    const fadeOut = setTimeout(() => setBootOut(true), 2400);
    const remove = setTimeout(() => setBooting(false), 3000);
    return () => {
      clearTimeout(fadeOut);
      clearTimeout(remove);
    };
  }, []);

  return (
    <div className="app-root" data-theme={theme}>
      {booting && (
        <div className={`boot-screen ${bootOut ? "boot-out" : ""}`}>
          <div className="boot-ring"><div className="boot-ring-inner">AIR</div></div>
          <div className="boot-wordmark">AEROINTEL</div>
          <div className="boot-sub">AIRSPACE INTELLIGENCE PLATFORM</div>
          <div className="boot-bar"><div className="boot-bar-fill" /></div>
        </div>
      )}

      <div className="map-layer">
        <Routes>
          <Route path="/" element={<Navigate to="/radar" replace />} />
          <Route path="/radar" element={<AircraftRadar />} />
          <Route path="/weather" element={<WeatherDashboard />} />
        </Routes>
      </div>

      <TopBar />

      <div className="dashboard-nav">
        <NavLink to="/radar" className={({ isActive }) => `dashboard-nav-link ${isActive ? "dashboard-nav-link--active" : ""}`}>
          Radar
        </NavLink>
        <NavLink to="/weather" className={({ isActive }) => `dashboard-nav-link ${isActive ? "dashboard-nav-link--active" : ""}`}>
          Weather
        </NavLink>
      </div>

      <SidePanel mode={isWeatherRoute ? "weather" : "radar"} />
      <OverviewDock />
      {isRadarRoute && <DetailDrawer />}
    </div>
  );
}
