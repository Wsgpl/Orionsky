import { useEffect, useRef } from "react";
import { api } from "../services/api";
import { useStore } from "../store";

const WEATHER_POLL_MS = 300_000; // 5 minutes
const WEATHER_EMPTY_RETRY_MS = 20_000; // retry sooner when the backend returns an empty grid

export function useWeatherLayer() {
  const setWeatherCells      = useStore((s) => s.setWeatherCells);
  const setWeatherLoading    = useStore((s) => s.setWeatherLoading);
  const setWeatherAdvisories = useStore((s) => s.setWeatherAdvisories);
  const intervalRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef           = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const clearRetry = () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };

    const scheduleRetry = () => {
      clearRetry();
      retryTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          void fetchWeather();
        }
      }, WEATHER_EMPTY_RETRY_MS);
    };

    const fetchWeather = async () => {
      let shouldRetrySoon = false;
      if (mountedRef.current) {
        setWeatherLoading(true);
      }

      try {
        console.info("[Weather] request started");
        const [wRes, aRes] = await Promise.allSettled([
          api.getWeather(),
          api.getWeatherAdvisories(),
        ]);
        if (!mountedRef.current) return;

        if (wRes.status === "fulfilled") {
          setWeatherCells(wRes.value.cells);
          console.info("[Weather] grid response received", {
            count: wRes.value.cells.length,
          });
          console.info("[Weather] grid payload sample", {
            sampleCell: wRes.value.cells[0]
              ? {
                  cell_key: wRes.value.cells[0].cell_key,
                  latitude: wRes.value.cells[0].data.latitude,
                  longitude: wRes.value.cells[0].data.longitude,
                  temperature: wRes.value.cells[0].data.temperature,
                  wind_speed: wRes.value.cells[0].data.wind_speed,
                  humidity: wRes.value.cells[0].data.humidity,
                  pressure: wRes.value.cells[0].data.pressure,
                  precip_mm: wRes.value.cells[0].data.precip_mm,
                  condition: wRes.value.cells[0].data.condition,
                  source: wRes.value.cells[0].data.source,
                }
              : null,
          });
          if (wRes.value.cells.length === 0) {
            console.warn("[Weather] empty grid returned, scheduling retry");
            shouldRetrySoon = true;
          } else {
            clearRetry();
          }
        } else {
          console.warn("[Weather] weather grid request failed:", wRes.reason);
          shouldRetrySoon = true;
        }

        if (aRes.status === "fulfilled") {
          setWeatherAdvisories(aRes.value.advisories);
          console.info("[Weather] advisories response received", {
            count: aRes.value.advisories.length,
          });
        } else {
          console.warn("[Weather] advisories request failed:", aRes.reason);
        }
      } catch (e) {
        console.warn("[Weather] fetch error:", e);
        shouldRetrySoon = true;
      } finally {
        if (mountedRef.current) {
          setWeatherLoading(false);
        }
      }

      if (shouldRetrySoon && mountedRef.current) {
        scheduleRetry();
      }
    };

    // Small delay to let the backend worker warm up, then retry quickly if the grid is still empty
    setWeatherLoading(true);
    const init = setTimeout(() => {
      void fetchWeather();
      intervalRef.current = setInterval(fetchWeather, WEATHER_POLL_MS);
    }, 1000);

    return () => {
      mountedRef.current = false;
      clearTimeout(init);
      clearRetry();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setWeatherLoading(false);
    };
  }, [setWeatherAdvisories, setWeatherCells, setWeatherLoading]);
}
