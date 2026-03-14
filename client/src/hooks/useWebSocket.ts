import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, WebSocketMessage } from '../utils/types';

const WS_RECONNECT_DELAY = 2000;
const WS_MAX_RECONNECT_DELAY = 30000;

export function useWebSocket() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(WS_RECONNECT_DELAY);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        reconnectDelayRef.current = WS_RECONNECT_DELAY;
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          if (message.type === 'state' && message.data) {
            setAppState(message.data);
          } else if (message.type === 'event' && message.appState) {
            setAppState(message.appState);
          }
        } catch {
          console.warn('Failed to parse WebSocket message');
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        // Reconnect with exponential backoff
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 1.5,
            WS_MAX_RECONNECT_DELAY
          );
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Will reconnect via onclose
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { appState, connected };
}
