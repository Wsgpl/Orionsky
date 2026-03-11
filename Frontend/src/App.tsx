import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { GuideLauncher } from "./components/GuideLauncher/GuideLauncher";
import { TopBar } from "./components/TopBar/TopBar";
import { SidePanel } from "./components/SidePanel/SidePanel";
import { DetailDrawer } from "./components/Drawer/DetailDrawer";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ConfigProvider } from "./components/ConfigProvider";
import { GlobeIntro } from "./components/GlobeIntro/GlobeIntro";
import { UserLocationController } from "./components/UserLocationController";
import { useAircraftStream } from "./hooks/useAircraftStream";
import { useWeatherLayer } from "./hooks/useWeatherLayer";
import { useThemeBySunCycle } from "./hooks/useThemeBySunCycle";
import { AUTH_SESSION_EVENT, api } from "./services/api";
import AircraftRadar from "./pages/AircraftRadar";
import AuthPortal from "./pages/AuthPortal";
import EmailVerification from "./pages/EmailVerification";
import RoutePlanning from "./pages/RoutePlanning";
import UserGuide from "./pages/UserGuide";
import WeatherDashboard from "./pages/WeatherDashboard";
import { useStore } from "./store";

export default function App() {
  const [booting, setBooting] = useState(true);
  const theme = useStore((s) => s.theme);
  const authSession = useStore((s) => s.authSession);
  const setAuthSession = useStore((s) => s.setAuthSession);
  const location = useLocation();
  const isWeatherRoute = location.pathname.startsWith("/weather");
  const isRadarRoute = location.pathname.startsWith("/radar");
  const isPlanningRoute = location.pathname.startsWith("/planning");
  const isPortalRoute =
    location.pathname.startsWith("/auth") ||
    location.pathname.startsWith("/verify-email") ||
    location.pathname.startsWith("/guide");

  const routes = ["/radar", "/weather", "/planning"];
  const currentIndex = Math.max(0, routes.indexOf(location.pathname));
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  const direction = currentIndex > prevIndex ? 1 : -1;

  useEffect(() => {
    setPrevIndex(currentIndex);
  }, [currentIndex]);

  useAircraftStream();
  useWeatherLayer();
  useThemeBySunCycle();

  useEffect(() => {
    const syncSession = () => {
      setAuthSession(api.getSession());
    };

    syncSession();
    window.addEventListener(AUTH_SESSION_EVENT, syncSession as EventListener);
    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, syncSession as EventListener);
    };
  }, [setAuthSession]);

  const pageVariants = {
    initial: (d: number) => ({
      x: d > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    animate: {
      x: 0,
      opacity: 1,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.1, 0.25, 1],
      },
    },
    exit: (d: number) => ({
      x: d > 0 ? "-100%" : "100%",
      opacity: 0,
      transition: {
        duration: 0.35,
        ease: [0.25, 0.1, 0.25, 1],
      },
    }),
  } as any;

  return (
    <ConfigProvider>
      <AppErrorBoundary>
        <div className="app-root" data-theme={theme}>
          {booting && !isPortalRoute && <GlobeIntro onComplete={() => setBooting(false)} />}
          <UserLocationController enabled={!booting && !isPortalRoute} />

          {isPortalRoute ? (
            <div className="portal-layer">
              <Routes>
                <Route path="/auth" element={<AuthPortal />} />
                <Route path="/verify-email" element={<EmailVerification />} />
                <Route
                  path="/guide"
                  element={authSession ? <UserGuide /> : <Navigate to="/auth?mode=login&next=%2Fguide" replace />}
                />
                <Route path="*" element={<Navigate to="/radar" replace />} />
              </Routes>
            </div>
          ) : (
            <>
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={location.pathname}
                  custom={direction}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="map-layer"
                  style={{ willChange: "transform, opacity" }}
                >
                  <Routes location={location}>
                    <Route path="/" element={<Navigate to="/radar" replace />} />
                    <Route path="/radar" element={<AircraftRadar />} />
                    <Route path="/weather" element={<WeatherDashboard />} />
                    <Route path="/planning" element={<RoutePlanning />} />
                    <Route path="*" element={<Navigate to="/radar" replace />} />
                  </Routes>
                </motion.div>
              </AnimatePresence>
              <TopBar />

              <div className="dashboard-nav">
                <div 
                  className="dashboard-nav__indicator" 
                  style={{
                    transform: `translateX(${currentIndex * 100}%)`
                  }}
                />
                <NavLink
                  to="/radar"
                  className={({ isActive }) => `dashboard-nav-link ${isActive ? "dashboard-nav-link--active" : ""}`}
                >
                  Radar
                </NavLink>
                <NavLink
                  to="/weather"
                  className={({ isActive }) => `dashboard-nav-link ${isActive ? "dashboard-nav-link--active" : ""}`}
                >
                  Weather
                </NavLink>
                <NavLink
                  to="/planning"
                  className={({ isActive }) => `dashboard-nav-link ${isActive ? "dashboard-nav-link--active" : ""}`}
                >
                  Planning
                </NavLink>
              </div>

              {!isPlanningRoute && <SidePanel key={isWeatherRoute ? "weather" : "radar"} mode={isWeatherRoute ? "weather" : "radar"} />}
              {isRadarRoute && <DetailDrawer />}
              <GuideLauncher />
            </>
          )}
        </div>
      </AppErrorBoundary>
    </ConfigProvider>
  );
}
