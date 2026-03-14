import {
  Session,
  SessionEvent,
  SessionStatus,
  ToolType,
  SessionMode,
  TerminalApp,
  SessionGroup,
  AppState,
} from './types';

/**
 * In-memory session store with staleness pruning.
 * This is the source of truth for all active sessions.
 */
export class SessionStore {
  private static readonly MAX_SESSIONS = 10000;
  private sessions: Map<string, Session> = new Map();
  private pruneIntervalMs: number;
  private staleTimeoutMs: number;
  private pruneTimer: NodeJS.Timeout | null = null;
  private eventListeners: Array<(event: SessionEvent, session: Session) => void> = [];

  constructor(staleTimeoutMs = 5 * 60 * 1000, pruneIntervalMs = 30 * 1000) {
    this.staleTimeoutMs = staleTimeoutMs;
    this.pruneIntervalMs = pruneIntervalMs;
  }

  /**
   * Start the periodic pruning of stale sessions.
   */
  start(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.pruneStaleSessions(), this.pruneIntervalMs);
    // Don't prevent process exit
    if (this.pruneTimer.unref) {
      this.pruneTimer.unref();
    }
  }

  /**
   * Stop the pruning timer.
   */
  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  /**
   * Register a listener for session events.
   */
  onEvent(listener: (event: SessionEvent, session: Session) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  /**
   * Process an incoming event from the shell companion.
   */
  handleEvent(event: SessionEvent): Session {
    const now = Date.now();

    switch (event.type) {
      case 'session_init': {
        const session: Session = {
          sessionId: event.sessionId,
          tty: event.tty,
          pid: event.pid,
          shellType: event.shellType,
          repoRoot: null,
          repoName: null,
          branch: null,
          tool: 'none',
          currentCommand: null,
          status: 'idle',
          terminalApp: 'unknown',
          mode: 'attached',
          lastSeenAt: now,
          createdAt: now,
          directory: event.initialDirectory,
        };
        this.sessions.set(event.sessionId, session);
        this.notifyListeners(event, session);
        return session;
      }

      case 'directory_changed': {
        const session = this.getOrCreateSession(event.sessionId, now);
        session.directory = event.directory;
        session.repoRoot = event.repoRoot;
        session.repoName = event.repoName;
        session.branch = event.branch;
        session.lastSeenAt = now;
        this.notifyListeners(event, session);
        return session;
      }

      case 'command_start': {
        const session = this.getOrCreateSession(event.sessionId, now);
        session.currentCommand = event.command;
        session.tool = event.tool;
        session.status = 'running';
        session.lastSeenAt = now;
        this.notifyListeners(event, session);
        return session;
      }

      case 'command_end': {
        const session = this.getOrCreateSession(event.sessionId, now);
        session.currentCommand = null;
        session.status = 'idle';
        session.lastSeenAt = now;
        this.notifyListeners(event, session);
        return session;
      }

      case 'session_exit': {
        const session = this.getOrCreateSession(event.sessionId, now);
        session.status = 'exited';
        session.lastSeenAt = now;
        this.notifyListeners(event, session);
        // Remove after a short delay to allow UI to show exit state
        setTimeout(() => this.sessions.delete(event.sessionId), 2000);
        return session;
      }
    }
  }

  /**
   * Get a session by ID, creating a stub if it doesn't exist.
   */
  private getOrCreateSession(sessionId: string, now: number): Session {
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Enforce maximum session limit to prevent DoS
      if (this.sessions.size >= SessionStore.MAX_SESSIONS) {
        this.pruneStaleSessions();
        if (this.sessions.size >= SessionStore.MAX_SESSIONS) {
          throw new Error('Session limit exceeded');
        }
      }
      session = {
        sessionId,
        tty: '',
        pid: 0,
        shellType: 'zsh',
        repoRoot: null,
        repoName: null,
        branch: null,
        tool: 'none',
        currentCommand: null,
        status: 'idle',
        terminalApp: 'unknown',
        mode: 'attached',
        lastSeenAt: now,
        createdAt: now,
        directory: '',
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Get a session by its ID.
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get the full app state: sessions grouped by repo.
   */
  getAppState(): AppState {
    const all = this.getAllSessions().filter(s => s.status !== 'exited');
    const grouped = new Map<string, Session[]>();
    const ungrouped: Session[] = [];

    for (const session of all) {
      if (session.repoRoot && session.repoName) {
        const key = session.repoRoot;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(session);
      } else {
        ungrouped.push(session);
      }
    }

    const groups: SessionGroup[] = Array.from(grouped.entries())
      .map(([repoRoot, sessions]) => ({
        repoName: sessions[0].repoName!,
        repoRoot,
        sessions: sessions.sort((a, b) => b.lastSeenAt - a.lastSeenAt),
      }))
      .sort((a, b) => {
        const aLatest = Math.max(...a.sessions.map(s => s.lastSeenAt));
        const bLatest = Math.max(...b.sessions.map(s => s.lastSeenAt));
        return bLatest - aLatest;
      });

    return {
      groups,
      ungrouped: ungrouped.sort((a, b) => b.lastSeenAt - a.lastSeenAt),
      totalSessions: all.length,
    };
  }

  /**
   * Update a session's terminal app.
   */
  setTerminalApp(sessionId: string, app: TerminalApp): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.terminalApp = app;
    }
  }

  /**
   * Mark a session as managed (launched by SessionCtl).
   */
  setManaged(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.mode = 'managed';
    }
  }

  /**
   * Remove a session.
   */
  removeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Prune sessions that haven't sent events within the staleness timeout.
   */
  pruneStaleSessions(): string[] {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [id, session] of this.sessions) {
      if (now - session.lastSeenAt > this.staleTimeoutMs) {
        this.sessions.delete(id);
        pruned.push(id);
      }
    }

    return pruned;
  }

  /**
   * Get count of active sessions.
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Clear all sessions.
   */
  clear(): void {
    this.sessions.clear();
  }

  private notifyListeners(event: SessionEvent, session: Session): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, session);
      } catch (err) {
        console.error('Event listener error:', err);
      }
    }
  }
}
