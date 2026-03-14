import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { Workspace, SessionDef, Session } from './types';

/**
 * Manages workspace persistence using a JSON file.
 * Workspaces are named session groups that can be saved and restored.
 */
export class WorkspaceManager {
  private filePath: string;
  private workspaces: Map<string, Workspace> = new Map();

  constructor(dbPath?: string) {
    const dir = dbPath
      ? path.dirname(dbPath)
      : path.join(process.env.HOME || '/tmp', '.sessionctl');

    // Ensure directory exists with secure permissions
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    this.filePath = path.join(dir, 'workspaces.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          for (const ws of parsed) {
            this.workspaces.set(ws.id, ws);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  }

  private save(): void {
    try {
      const data = JSON.stringify(Array.from(this.workspaces.values()), null, 2);
      // Write atomically: write to temp file then rename
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, data, { mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('Failed to save workspaces:', err);
    }
  }

  /**
   * Save a new workspace or update an existing one by name.
   */
  saveWorkspace(name: string, sessions: SessionDef[]): Workspace {
    // Validate name
    const sanitizedName = name.trim();
    if (!sanitizedName || sanitizedName.length > 128) {
      throw new Error('Workspace name must be 1-128 characters');
    }
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(sanitizedName)) {
      throw new Error('Workspace name can only contain letters, numbers, spaces, hyphens, and underscores');
    }
    if (sessions.length === 0) {
      throw new Error('Workspace must contain at least one session');
    }
    if (sessions.length > 50) {
      throw new Error('Workspace cannot contain more than 50 sessions');
    }

    const existing = this.getWorkspaceByName(sanitizedName);

    if (existing) {
      existing.sessions = sessions;
      this.workspaces.set(existing.id, existing);
      this.save();
      return existing;
    }

    const workspace: Workspace = {
      id: uuidv4(),
      name: sanitizedName,
      sessions,
      createdAt: Date.now(),
      lastRestoredAt: null,
    };

    this.workspaces.set(workspace.id, workspace);
    this.save();
    return workspace;
  }

  /**
   * Save workspace from current active sessions.
   */
  saveFromActiveSessions(name: string, activeSessions: Session[]): Workspace {
    const sessionDefs: SessionDef[] = activeSessions
      .filter(s => s.repoRoot)
      .map(s => ({
        repoPath: s.repoRoot!,
        startupCommand: s.tool !== 'none' ? s.currentCommand || undefined : undefined,
        terminalApp: s.terminalApp,
        windowPreference: 'new_tab' as const,
      }));

    if (sessionDefs.length === 0) {
      throw new Error('No sessions with a repository to save');
    }

    return this.saveWorkspace(name, sessionDefs);
  }

  /**
   * Get a workspace by ID.
   */
  getWorkspace(id: string): Workspace | null {
    return this.workspaces.get(id) || null;
  }

  /**
   * Get a workspace by name.
   */
  getWorkspaceByName(name: string): Workspace | null {
    for (const ws of this.workspaces.values()) {
      if (ws.name === name) return ws;
    }
    return null;
  }

  /**
   * List all workspaces.
   */
  listWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Delete a workspace.
   */
  deleteWorkspace(id: string): boolean {
    const deleted = this.workspaces.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  /**
   * Mark a workspace as restored.
   */
  markRestored(id: string): void {
    const ws = this.workspaces.get(id);
    if (ws) {
      ws.lastRestoredAt = Date.now();
      this.save();
    }
  }

  /**
   * Close (no-op for JSON storage, for interface compatibility).
   */
  close(): void {
    // Ensure everything is saved
    this.save();
  }
}
