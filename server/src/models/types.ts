import { z } from 'zod';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const ShellType = z.enum(['zsh', 'bash']);
export type ShellType = z.infer<typeof ShellType>;

export const ToolType = z.enum(['claude', 'codex', 'aider', 'git', 'npm', 'other', 'none']);
export type ToolType = z.infer<typeof ToolType>;

export const SessionStatus = z.enum(['idle', 'running', 'exited']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const TerminalApp = z.enum(['iterm2', 'terminal', 'unknown']);
export type TerminalApp = z.infer<typeof TerminalApp>;

export const SessionMode = z.enum(['managed', 'attached']);
export type SessionMode = z.infer<typeof SessionMode>;

// ─── Event Schemas (from shell companion) ────────────────────────────────────

export const BaseEvent = z.object({
  sessionId: z.string().min(1).max(256),
  timestamp: z.number().positive(),
});

export const SessionInitEvent = BaseEvent.extend({
  type: z.literal('session_init'),
  tty: z.string().min(1).max(256),
  pid: z.number().int().positive(),
  shellType: ShellType,
  initialDirectory: z.string().min(1).max(4096),
});
export type SessionInitEvent = z.infer<typeof SessionInitEvent>;

export const DirectoryChangedEvent = BaseEvent.extend({
  type: z.literal('directory_changed'),
  directory: z.string().min(1).max(4096),
  repoRoot: z.string().max(4096).nullable(),
  repoName: z.string().max(256).nullable(),
  branch: z.string().max(256).nullable(),
});
export type DirectoryChangedEvent = z.infer<typeof DirectoryChangedEvent>;

export const CommandStartEvent = BaseEvent.extend({
  type: z.literal('command_start'),
  command: z.string().max(8192),
  tool: ToolType,
});
export type CommandStartEvent = z.infer<typeof CommandStartEvent>;

export const CommandEndEvent = BaseEvent.extend({
  type: z.literal('command_end'),
  exitStatus: z.number().int(),
  duration: z.number().nonnegative(),
});
export type CommandEndEvent = z.infer<typeof CommandEndEvent>;

export const SessionExitEvent = BaseEvent.extend({
  type: z.literal('session_exit'),
});
export type SessionExitEvent = z.infer<typeof SessionExitEvent>;

export const SessionEvent = z.discriminatedUnion('type', [
  SessionInitEvent,
  DirectoryChangedEvent,
  CommandStartEvent,
  CommandEndEvent,
  SessionExitEvent,
]);
export type SessionEvent = z.infer<typeof SessionEvent>;

// ─── Session Model ───────────────────────────────────────────────────────────

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

// ─── Workspace Model ─────────────────────────────────────────────────────────

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

// ─── API Response Types ──────────────────────────────────────────────────────

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

export interface OnboardingStatus {
  shellCompanionInstalled: boolean;
  detectedShell: ShellType | null;
  detectedTerminals: TerminalApp[];
  activeSessions: number;
}
