import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SessionStore } from '../models/session-store';
import { WorkspaceManager } from '../models/workspace-manager';
import { TerminalAdapterRegistry } from '../adapters/terminal-adapter';
import { TerminalApp, SessionDef } from '../models/types';

export function createApiRouter(
  sessionStore: SessionStore,
  workspaceManager: WorkspaceManager,
  adapterRegistry: TerminalAdapterRegistry
): Router {
  const router = Router();

  // ─── Session Routes ──────────────────────────────────────────────────────

  /**
   * GET /api/sessions
   * Get all sessions grouped by repo.
   */
  router.get('/sessions', (_req: Request, res: Response) => {
    try {
      const state = sessionStore.getAppState();
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  /**
   * GET /api/sessions/:id
   * Get a specific session.
   */
  router.get('/sessions/:id', (req: Request, res: Response) => {
    const session = sessionStore.getSession(String(String(req.params.id)));
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  /**
   * POST /api/sessions/:id/focus
   * Focus a session in its terminal app.
   */
  router.post('/sessions/:id/focus', async (req: Request, res: Response) => {
    try {
      const session = sessionStore.getSession(String(req.params.id));
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const adapter = adapterRegistry.get(session.terminalApp);
      if (!adapter) {
        res.status(400).json({ error: `No adapter for terminal: ${session.terminalApp}` });
        return;
      }

      await adapter.focusSession(session.tty);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to focus session' });
    }
  });

  /**
   * POST /api/sessions/:id/close
   * Close a terminal session.
   */
  router.post('/sessions/:id/close', async (req: Request, res: Response) => {
    try {
      const session = sessionStore.getSession(String(req.params.id));
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const adapter = adapterRegistry.get(session.terminalApp);
      if (adapter) {
        await adapter.closeSession(session.tty);
      }

      sessionStore.removeSession(String(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to close session' });
    }
  });

  /**
   * DELETE /api/sessions/:id
   * Remove a session from tracking (doesn't close terminal).
   */
  router.delete('/sessions/:id', (req: Request, res: Response) => {
    const removed = sessionStore.removeSession(String(req.params.id));
    if (!removed) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ success: true });
  });

  // ─── Launch Routes ───────────────────────────────────────────────────────

  const LaunchSchema = z.object({
    repoPath: z.string().min(1).max(4096),
    startupCommand: z.string().max(8192).optional(),
    terminalApp: z.enum(['iterm2', 'terminal']).default('iterm2'),
    windowPreference: z.enum(['new_window', 'new_tab']).default('new_tab'),
  });

  /**
   * POST /api/launch
   * Launch a new managed terminal session.
   */
  router.post('/launch', async (req: Request, res: Response) => {
    try {
      const parsed = LaunchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
        return;
      }

      const def: SessionDef = parsed.data;
      const adapter = adapterRegistry.get(def.terminalApp as TerminalApp);
      if (!adapter) {
        res.status(400).json({ error: `No adapter for terminal: ${def.terminalApp}` });
        return;
      }

      await adapter.launchSession(def);
      res.json({ success: true, message: 'Session launched' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to launch session' });
    }
  });

  // ─── Workspace Routes ────────────────────────────────────────────────────

  /**
   * GET /api/workspaces
   * List all saved workspaces.
   */
  router.get('/workspaces', (_req: Request, res: Response) => {
    try {
      const workspaces = workspaceManager.listWorkspaces();
      res.json(workspaces);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
  });

  /**
   * GET /api/workspaces/:id
   * Get a specific workspace.
   */
  router.get('/workspaces/:id', (req: Request, res: Response) => {
    try {
      const workspace = workspaceManager.getWorkspace(String(req.params.id));
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }
      res.json(workspace);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch workspace' });
    }
  });

  const SaveWorkspaceSchema = z.object({
    name: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_\-\s]+$/),
    sessions: z.array(z.object({
      repoPath: z.string().min(1).max(4096),
      startupCommand: z.string().max(8192).optional(),
      terminalApp: z.enum(['iterm2', 'terminal', 'unknown']).default('iterm2'),
      windowPreference: z.enum(['new_window', 'new_tab']).default('new_tab'),
    })).min(1).max(50),
  });

  /**
   * POST /api/workspaces
   * Save a new workspace.
   */
  router.post('/workspaces', (req: Request, res: Response) => {
    try {
      const parsed = SaveWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
        return;
      }

      const workspace = workspaceManager.saveWorkspace(parsed.data.name, parsed.data.sessions);
      res.status(201).json(workspace);
    } catch (err: any) {
      if (err.message?.includes('must be') || err.message?.includes('cannot contain')) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Failed to save workspace' });
    }
  });

  /**
   * POST /api/workspaces/save-current
   * Save a workspace from the current active sessions.
   */
  router.post('/workspaces/save-current', (req: Request, res: Response) => {
    try {
      const schema = z.object({ name: z.string().min(1).max(128) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid workspace name' });
        return;
      }

      const activeSessions = sessionStore.getAllSessions().filter(s => s.status !== 'exited');
      if (activeSessions.length === 0) {
        res.status(400).json({ error: 'No active sessions to save' });
        return;
      }

      const workspace = workspaceManager.saveFromActiveSessions(parsed.data.name, activeSessions);
      res.status(201).json(workspace);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save workspace' });
    }
  });

  /**
   * POST /api/workspaces/:id/restore
   * Restore a workspace (launch all its sessions).
   */
  router.post('/workspaces/:id/restore', async (req: Request, res: Response) => {
    try {
      const workspace = workspaceManager.getWorkspace(String(req.params.id));
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      const results: Array<{ repoPath: string; success: boolean; error?: string }> = [];

      for (const sessionDef of workspace.sessions) {
        try {
          const adapter = adapterRegistry.get(sessionDef.terminalApp as TerminalApp);
          if (adapter) {
            await adapter.launchSession(sessionDef);
            results.push({ repoPath: sessionDef.repoPath, success: true });
          } else {
            results.push({
              repoPath: sessionDef.repoPath,
              success: false,
              error: `No adapter for ${sessionDef.terminalApp}`,
            });
          }
        } catch (err: any) {
          results.push({
            repoPath: sessionDef.repoPath,
            success: false,
            error: err.message,
          });
        }
      }

      workspaceManager.markRestored(String(req.params.id));
      res.json({ success: true, results });
    } catch (err) {
      res.status(500).json({ error: 'Failed to restore workspace' });
    }
  });

  /**
   * DELETE /api/workspaces/:id
   * Delete a workspace.
   */
  router.delete('/workspaces/:id', (req: Request, res: Response) => {
    try {
      const deleted = workspaceManager.deleteWorkspace(String(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete workspace' });
    }
  });

  // ─── Status / Health ─────────────────────────────────────────────────────

  /**
   * GET /api/status
   * Health check and onboarding status.
   */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const availableTerminals = await adapterRegistry.detectAvailable();
      const sessions = sessionStore.getAllSessions();

      res.json({
        version: '1.0.0',
        uptime: process.uptime(),
        shellCompanionInstalled: sessions.length > 0,
        activeSessions: sessions.filter(s => s.status !== 'exited').length,
        detectedTerminals: availableTerminals,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // ─── Event injection (for testing / non-socket clients) ───────────────

  /**
   * POST /api/events
   * Inject a session event directly (useful for testing and non-socket clients).
   */
  router.post('/events', (req: Request, res: Response) => {
    try {
      const { SessionEvent } = require('../models/types');
      const result = SessionEvent.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: 'Invalid event', details: result.error.issues });
        return;
      }
      const session = sessionStore.handleEvent(result.data);
      res.json({ success: true, session });
    } catch (err) {
      res.status(500).json({ error: 'Failed to process event' });
    }
  });

  return router;
}
