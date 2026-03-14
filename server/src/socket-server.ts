import net from 'net';
import fs from 'fs';
import path from 'path';
import { SessionEvent } from './models/types';
import { SessionStore } from './models/session-store';

const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB max message size
const SOCKET_BACKLOG = 128;

/**
 * Unix domain socket server that receives events from the shell companion.
 * Protocol: newline-delimited JSON over a Unix socket.
 */
export class SocketServer {
  private server: net.Server | null = null;
  private socketPath: string;
  private sessionStore: SessionStore;
  private connections: Set<net.Socket> = new Set();

  constructor(sessionStore: SessionStore, socketPath?: string) {
    this.sessionStore = sessionStore;
    this.socketPath = socketPath || path.join(
      process.env.HOME || '/tmp',
      '.sessionctl',
      'sock'
    );
  }

  /**
   * Start listening on the Unix domain socket.
   */
  async start(): Promise<void> {
    // Ensure directory exists with secure permissions
    const dir = path.dirname(this.socketPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    // Clean up stale socket file
    if (fs.existsSync(this.socketPath)) {
      try {
        // Try to connect to see if another instance is running
        await this.checkExistingSocket();
        throw new Error('Another SessionCtl instance is already running');
      } catch (err: any) {
        if (err.message === 'Another SessionCtl instance is already running') {
          throw err;
        }
        // Socket is stale, remove it
        fs.unlinkSync(this.socketPath);
      }
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleConnection(socket));

      this.server.on('error', (err) => {
        console.error('Socket server error:', err);
        reject(err);
      });

      this.server.listen(this.socketPath, SOCKET_BACKLOG, () => {
        // Set restrictive permissions on the socket
        try {
          fs.chmodSync(this.socketPath, 0o600);
        } catch {
          // Some systems don't support chmod on sockets
        }
        console.log(`Socket server listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  /**
   * Stop the socket server and clean up.
   */
  async stop(): Promise<void> {
    // Close all active connections
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections.clear();

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          // Clean up socket file
          if (fs.existsSync(this.socketPath)) {
            try {
              fs.unlinkSync(this.socketPath);
            } catch {
              // Ignore cleanup errors
            }
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle a new client connection.
   */
  private handleConnection(socket: net.Socket): void {
    this.connections.add(socket);
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Guard against memory exhaustion from a single connection
      if (buffer.length > MAX_MESSAGE_SIZE) {
        console.warn('Message too large, dropping connection');
        socket.destroy();
        return;
      }

      // Process complete newline-delimited messages
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const message = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (message) {
          this.processMessage(message);
        }
      }
    });

    socket.on('error', (err) => {
      // Connection errors are expected (client disconnects, etc.)
      if ((err as any).code !== 'ECONNRESET') {
        console.error('Socket connection error:', err.message);
      }
    });

    socket.on('close', () => {
      this.connections.delete(socket);
    });
  }

  /**
   * Parse and process a single JSON message.
   */
  private processMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);
      const result = SessionEvent.safeParse(parsed);

      if (!result.success) {
        console.warn('Invalid event:', result.error.issues.map(i => i.message).join(', '));
        return;
      }

      this.sessionStore.handleEvent(result.data);
    } catch (err) {
      console.warn('Failed to parse message:', (err as Error).message);
    }
  }

  /**
   * Check if an existing socket is active.
   */
  private checkExistingSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.socketPath);
      client.on('connect', () => {
        client.destroy();
        resolve(); // Socket is active
      });
      client.on('error', (err) => {
        reject(err); // Socket is stale
      });
    });
  }

  get path(): string {
    return this.socketPath;
  }
}
