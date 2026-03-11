import { useNavigate } from "react-router-dom";
import { useStore } from "../store";

const GUIDE_SECTIONS = [
  {
    title: "Radar Workflow",
    body: "Use the search bar for flights, airports, and locations. Select an aircraft to open the detail drawer and inspect altitude, speed, route context, and backend forecast data.",
  },
  {
    title: "Weather Workflow",
    body: "Switch to the weather route to inspect temperature, wind, precipitation, humidity, and pressure layers on the same India-focused map coverage.",
  },
  {
    title: "Forecast Desk",
    body: "Open the Forecast section in the side panel to request backend forecasts by query or from the currently selected aircraft or map location.",
  },
  {
    title: "Operations And System",
    body: "The side panel also exposes backend snapshot sync, health readiness, runtime configuration, and metrics preview without moving away from the main dashboard.",
  },
  {
    title: "Admin Tools",
    body: "Admin/API key controls remain inside the side panel. They require an admin JWT session and are separate from normal user registration and guide access.",
  },
];

export default function UserGuide() {
  const navigate = useNavigate();
  const authSession = useStore((s) => s.authSession);

  return (
    <div className="portal-page portal-page--guide">
      <div className="guide-shell">
        <div className="guide-hero">
          <div>
            <div className="portal-kicker">User Guide</div>
            <h1 className="portal-title">How To Use The Dashboard</h1>
            <p className="portal-copy">
              Signed in as {authSession?.name || authSession?.email || authSession?.subject}. This guide covers the
              main radar, weather, forecast, and backend tooling flows already present in your application.
            </p>
          </div>
          <div className="portal-actions">
            <button className="portal-btn" onClick={() => navigate("/radar")} type="button">
              Open Radar
            </button>
            <button className="portal-btn portal-btn--ghost" onClick={() => navigate("/weather")} type="button">
              Open Weather
            </button>
          </div>
        </div>

        <div className="guide-grid">
          {GUIDE_SECTIONS.map((section) => (
            <section className="guide-card" key={section.title}>
              <h2 className="guide-card__title">{section.title}</h2>
              <p className="guide-card__body">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
