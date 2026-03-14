import { Server as HttpServer } from 'http';
import * as ws from 'ws';
import { SessionStore } from './models/session-store';
import { SessionEvent, Session } from './models/types';

// ws module exports Server (not WebSocketServer) in older versions
const WsServer = (ws as any).Server || (ws as any).WebSocketServer;
const WS_OPEN = (ws as any).OPEN || 1;

/**
 * WebSocket server for real-time session updates to the frontend.
 * Broadcasts session state changes to all connected clients.
 */
export class RealtimeServer {
  private wss: any = null;
  private unsubscribe: (() => void) | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(private sessionStore: SessionStore) {}

  /**
   * Attach to an HTTP server and start broadcasting events.
   */
  attach(server: HttpServer): void {
    this.wss = new WsServer({ server, path: '/ws' });

    this.wss.on('connection', (wsClient: any) => {
      // Send current state on connect
      const state = this.sessionStore.getAppState();
      this.safeSend(wsClient, { type: 'state', data: state });

      wsClient.on('error', (err: any) => {
        console.error('WebSocket client error:', err.message);
      });

      // Respond to pings
      wsClient.on('pong', () => {
        wsClient.isAlive = true;
      });

      wsClient.isAlive = true;
    });

    // Subscribe to session events
    this.unsubscribe = this.sessionStore.onEvent((event: SessionEvent, session: Session) => {
      this.broadcast({
        type: 'event',
        event: event.type,
        session,
        appState: this.sessionStore.getAppState(),
      });
    });

    // Heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((client: any) => {
        if (client.isAlive === false) {
          client.terminate();
          return;
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30_000);

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Broadcast a message to all connected clients.
   */
  private broadcast(data: object): void {
    if (!this.wss) return;

    const message = JSON.stringify(data);
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === WS_OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Safely send a message to a single client.
   */
  private safeSend(wsClient: any, data: object): void {
    if (wsClient.readyState === WS_OPEN) {
      wsClient.send(JSON.stringify(data));
    }
  }

  /**
   * Stop the WebSocket server.
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }
}
