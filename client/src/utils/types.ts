// ─── Shared types (mirror server types for frontend) ────────────────────────

export type ShellType = 'zsh' | 'bash';
export type ToolType = 'claude' | 'codex' | 'aider' | 'git' | 'npm' | 'other' | 'none';
export type SessionStatus = 'idle' | 'running' | 'exited';
export type TerminalApp = 'iterm2' | 'terminal' | 'unknown';
export type SessionMode = 'managed' | 'attached';

export interface Session {
  sessionId: string;
  tty: string;
  pid: number;
  shellType: ShellType;
  repoRoot: string | null;
  repoName: string | null;
  branch: string | null;
  tool: ToolType;
  currentCommand: string | null;
  status: SessionStatus;
  terminalApp: TerminalApp;
  mode: SessionMode;
  lastSeenAt: number;
  createdAt: number;
  directory: string;
}

export interface SessionGroup {
  repoName: string;
  repoRoot: string;
  sessions: Session[];
}

export interface AppState {
  groups: SessionGroup[];
  ungrouped: Session[];
  totalSessions: number;
}

export interface SessionDef {
  repoPath: string;
  startupCommand?: string;
  terminalApp: TerminalApp;
  windowPreference: 'new_window' | 'new_tab';
}

export interface Workspace {
  id: string;
  name: string;
  sessions: SessionDef[];
  createdAt: number;
  lastRestoredAt: number | null;
}

export interface StatusInfo {
  version: string;
  uptime: number;
  shellCompanionInstalled: boolean;
  activeSessions: number;
  detectedTerminals: TerminalApp[];
}

export interface WebSocketMessage {
  type: 'state' | 'event';
  data?: AppState;
  event?: string;
  session?: Session;
  appState?: AppState;
}
