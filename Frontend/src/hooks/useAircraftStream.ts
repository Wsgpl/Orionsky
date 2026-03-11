import { useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { useStore } from "../store";

const POLL_MS = 15_000;
const RETRY_MS = 5_000;

export function useAircraftStream() {
  const setAircraft     = useStore((s) => s.setAircraft);
  const setStatus       = useStore((s) => s.setConnectionStatus);
  const setLoading      = useStore((s) => s.setLoading);
  const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef      = useRef(true);
  const failCountRef    = useRef(0);

  const fetch = useCallback(async () => {
    try {
      console.info("[Aircraft] request started");
      const acRes = await api.getAircraft();

      if (!mountedRef.current) return;

      setAircraft(acRes.aircraft);
      console.info("[Aircraft] response received", {
        count: acRes.aircraft.length,
      });

      failCountRef.current = 0;
      setStatus("connected");
    } catch (error) {
      console.warn("[Aircraft] request failed", error);
      if (!mountedRef.current) return;
      failCountRef.current++;
      const backendHealthy = await api.checkHealth();
      if (!mountedRef.current) return;
      setStatus(backendHealthy ? "reconnecting" : "disconnected");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [setAircraft, setStatus, setLoading]);

  useEffect(() => {
    mountedRef.current = true;
    setStatus("connecting");

    const poll = async () => {
      await fetch();

      if (!mountedRef.current) return;
      const delay = failCountRef.current > 0 ? RETRY_MS : POLL_MS;
      timerRef.current = setTimeout(poll, delay);
    };

    void poll();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetch, setStatus]);
}
