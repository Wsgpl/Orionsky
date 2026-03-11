import { useEffect, useRef, useCallback } from "react";
import { api } from "../services/api";
import { useStore } from "../store";

const POLL_MS = 15_000;

export function useAircraftStream() {
  const setAircraft     = useStore((s) => s.setAircraft);
  const setStatus       = useStore((s) => s.setConnectionStatus);
  const setLoading      = useStore((s) => s.setLoading);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef      = useRef(true);
  const failCountRef    = useRef(0);

  const fetch = useCallback(async () => {
    try {
      const acRes = await api.getAircraft();

      if (!mountedRef.current) return;

      setAircraft(acRes.aircraft);

      failCountRef.current = 0;
      setStatus("connected");
    } catch {
      if (!mountedRef.current) return;
      failCountRef.current++;
      setStatus(failCountRef.current > 3 ? "disconnected" : "reconnecting");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [setAircraft, setStatus, setLoading]);

  useEffect(() => {
    mountedRef.current = true;

    api.login().then(() => {
      fetch();
      intervalRef.current = setInterval(fetch, POLL_MS);
    });

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch]);
}
