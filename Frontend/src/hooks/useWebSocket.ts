import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { Aircraft } from "../types";

function resolveWsUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}`;
  }

  return "ws://localhost:8000";
}

const WS_URL = resolveWsUrl();
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useWebSocket() {
  const setAircraft  = useStore((s) => s.setAircraft);
  const setStatus    = useStore((s) => s.setConnectionStatus);
  const wsRef        = useRef<WebSocket | null>(null);
  const attemptsRef  = useRef(0);
  const mountedRef   = useRef(true);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        // Fall back to polling — silently give up on WebSocket
        return;
      }

      try {
        const ws = new WebSocket(`${WS_URL}/api/v1/ws/aircraft`);
        wsRef.current = ws;

        ws.onopen = () => {
          attemptsRef.current = 0;
          setStatus("connected");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data?.aircraft)) {
              setAircraft(data.aircraft as Aircraft[]);
            }
          } catch {
            // malformed message — ignore
          }
        };

        ws.onerror = () => {
          // Expected if backend doesn't implement WebSocket — silently ignore
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          attemptsRef.current++;
          if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            timerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
          }
        };
      } catch {
        // WebSocket not supported or URL invalid — fall back to polling
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on cleanup
        wsRef.current.close();
      }
    };
  }, [setAircraft, setStatus]);
}
