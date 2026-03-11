import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./GlobeIntro.css";

interface GlobeIntroProps {
  onComplete: () => void;
}

const INDIA_CENTER: [number, number] = [78.9629, 20.5937];

export function GlobeIntro({ onComplete }: GlobeIntroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [fadeOut, setFadeOut] = useState(false);
  const animFrameRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapOptions: any = {
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/bright",
      center: [-30, 20], // start west of India for a dramatic eastward spin
      zoom: 1.5,
      projection: "globe",       // MapLibre 3+ globe projection
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    };

    const map = new maplibregl.Map(mapOptions);
    mapRef.current = map;

    const triggerComplete = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setFadeOut(true);
      setTimeout(onComplete, 700);
    };

    map.on("load", () => {
      // Atmosphere / space glow
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any).setFog({
          color: "rgba(5, 10, 25, 0.9)",
          "high-color": "rgba(15, 30, 80, 1)",
          "horizon-blend": 0.08,
          "space-color": "rgba(2, 4, 18, 1)",
          "star-intensity": 0.85,
        });
      } catch (_) {
        // setFog not available on this MapLibre version — gracefully ignore
      }

      // ── Phase 1: Globe rotation 3 seconds east toward India ────────────
      let startTime: number | null = null;
      const ROTATE_MS = 3000;

      function rotateGlobe(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const lon = -30 + (elapsed / ROTATE_MS) * 110; // -30° → +80°

        if (elapsed < ROTATE_MS) {
          map.setCenter([lon, 20]);
          animFrameRef.current = requestAnimationFrame(rotateGlobe);
        } else {
          // ── Phase 2: Fly to India ────────────────────────────────────────
          map.flyTo({
            center: INDIA_CENTER,
            zoom: 4.5,
            bearing: 0,
            pitch: 0,
            duration: 2800,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            easing: (t: number) => 1 - Math.pow(1 - t, 4) as any,
          });

          // Phase 3: Fade out after landing
          setTimeout(triggerComplete, 3400);
        }
      }

      animFrameRef.current = requestAnimationFrame(rotateGlobe);
    });

    // Safety net — if map never loads, still dismiss after 10 s
    const safetyTimer = setTimeout(triggerComplete, 10000);

    return () => {
      clearTimeout(safetyTimer);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.remove();
    };
  }, [onComplete]);

  return (
    <div className={`globe-intro ${fadeOut ? "globe-intro--fadeout" : ""}`}>
      {/* MapLibre canvas fills the whole screen */}
      <div ref={containerRef} className="globe-intro__map" />

      {/* Branding overlay at the bottom */}
      <div className="globe-intro__overlay">
        <div className="globe-intro__logo">
          <svg viewBox="0 0 44 44" fill="none" width="56" height="56">
            <circle cx="22" cy="22" r="20" stroke="#00e5ff" strokeWidth="1.4" />
            <circle cx="22" cy="22" r="11" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9" />
            <path d="M22 7 L26 22 L22 19 L18 22 Z" fill="#00e5ff" />
            <path d="M10 28 L22 22 L34 28" stroke="#00e5ff" strokeWidth="1.1" strokeOpacity="0.4" />
          </svg>
        </div>
        <div className="globe-intro__wordmark">ORIONSKY</div>
        <div className="globe-intro__sub">AIRSPACE INTELLIGENCE PLATFORM</div>
        <div className="globe-intro__progress">
          <div className="globe-intro__progress-fill" />
        </div>
        <div className="globe-intro__status">Initialising radar feed&hellip;</div>
      </div>
    </div>
  );
}
