import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { SessionStore } from './models/session-store';
import { WorkspaceManager } from './models/workspace-manager';
import { SocketServer } from './socket-server';
import { RealtimeServer } from './websocket-server';
import { TerminalAdapterRegistry } from './adapters/terminal-adapter';
import { createApiRouter } from './routes/api';
import {
  localhostOnly,
  apiRateLimiter,
  errorHandler,
  JSON_BODY_LIMIT,
} from './middleware/security';

const HTTP_PORT = parseInt(process.env.SESSIONCTL_PORT || '9340', 10);
const DB_PATH = process.env.SESSIONCTL_DB_PATH || undefined;
const SOCKET_PATH = process.env.SESSIONCTL_SOCKET_PATH || undefined;

async function main() {
  console.log('SessionCtl v1.0.0 — Mission Control for AI Terminal Sessions');
  console.log('─'.repeat(55));

  // ─── Initialize components ───────────────────────────────────────────
  const sessionStore = new SessionStore();
  const workspaceManager = new WorkspaceManager(DB_PATH);
  const adapterRegistry = new TerminalAdapterRegistry();
  const socketServer = new SocketServer(sessionStore, SOCKET_PATH);
  const realtimeServer = new RealtimeServer(sessionStore);

  // ─── Express app ─────────────────────────────────────────────────────
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // We serve a SPA
    crossOriginEmbedderPolicy: false,
  }));
  app.use(localhostOnly);
  app.use(apiRateLimiter);
  app.use(cors({
    origin: [`http://127.0.0.1:${HTTP_PORT}`, `http://localhost:${HTTP_PORT}`],
    credentials: false,
  }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // API routes
  app.use('/api', createApiRouter(sessionStore, workspaceManager, adapterRegistry));

  // Serve static frontend (production)
  app.use(express.static('public'));

  // SPA fallback
  app.use((_req, res) => {
    res.sendFile('index.html', { root: 'public' });
  });

  // Error handler
  app.use(errorHandler);

  // ─── HTTP + WebSocket server ─────────────────────────────────────────
  const server = http.createServer(app);
  realtimeServer.attach(server);

  server.listen(HTTP_PORT, '127.0.0.1', () => {
    console.log(`HTTP server:   http://127.0.0.1:${HTTP_PORT}`);
    console.log(`WebSocket:     ws://127.0.0.1:${HTTP_PORT}/ws`);
  });

  // ─── Unix socket server ──────────────────────────────────────────────
  try {
    await socketServer.start();
    console.log(`Unix socket:   ${socketServer.path}`);
  } catch (err: any) {
    console.error(`Socket server failed: ${err.message}`);
    if (err.message.includes('already running')) {
      process.exit(1);
    }
    console.log('Continuing without Unix socket (use HTTP API for testing)');
  }

  // ─── Session store pruning ───────────────────────────────────────────
  sessionStore.start();
  console.log('Session pruning: active (5 min staleness timeout)');
  console.log('─'.repeat(55));
  console.log('Ready. Waiting for shell companion events...\n');

  // ─── Graceful shutdown ───────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down...`);
    sessionStore.stop();
    realtimeServer.stop();
    await socketServer.stop();
    workspaceManager.close();
    server.close(() => {
      console.log('Goodbye.');
      process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
