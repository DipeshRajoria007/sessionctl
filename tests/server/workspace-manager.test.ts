import { WorkspaceManager } from '../../server/src/models/workspace-manager';
import { SessionDef } from '../../server/src/models/types';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionctl-test-'));
    manager = new WorkspaceManager(path.join(tmpDir, 'test.json'));
  });

  afterEach(() => {
    manager.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── saveWorkspace ─────────────────────────────────────────────────

  describe('saveWorkspace', () => {
    it('should save a workspace with valid data', () => {
      const sessions: SessionDef[] = [
        { repoPath: '/Users/test/repo1', terminalApp: 'iterm2', windowPreference: 'new_tab' },
        { repoPath: '/Users/test/repo2', startupCommand: 'npm run dev', terminalApp: 'terminal', windowPreference: 'new_window' },
      ];

      const ws = manager.saveWorkspace('my-workspace', sessions);
      expect(ws.name).toBe('my-workspace');
      expect(ws.sessions.length).toBe(2);
      expect(ws.id).toBeTruthy();
      expect(ws.createdAt).toBeTruthy();
    });

    it('should update existing workspace by name', () => {
      const sessions1: SessionDef[] = [
        { repoPath: '/Users/test/repo1', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ];
      const sessions2: SessionDef[] = [
        { repoPath: '/Users/test/repo2', terminalApp: 'terminal', windowPreference: 'new_window' },
      ];

      const ws1 = manager.saveWorkspace('my-workspace', sessions1);
      const ws2 = manager.saveWorkspace('my-workspace', sessions2);

      expect(ws2.id).toBe(ws1.id);
      expect(ws2.sessions[0].repoPath).toBe('/Users/test/repo2');
      expect(manager.listWorkspaces().length).toBe(1);
    });

    it('should reject empty name', () => {
      expect(() => manager.saveWorkspace('', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }]))
        .toThrow('1-128 characters');
    });

    it('should reject name with special characters', () => {
      expect(() => manager.saveWorkspace('test<script>', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }]))
        .toThrow('only contain');
    });

    it('should reject empty sessions array', () => {
      expect(() => manager.saveWorkspace('test', []))
        .toThrow('at least one');
    });

    it('should reject more than 50 sessions', () => {
      const sessions: SessionDef[] = Array(51).fill({
        repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab',
      });
      expect(() => manager.saveWorkspace('test', sessions))
        .toThrow('more than 50');
    });

    it('should trim workspace name', () => {
      const ws = manager.saveWorkspace('  my-workspace  ', [
        { repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);
      expect(ws.name).toBe('my-workspace');
    });
  });

  // ─── persistence ───────────────────────────────────────────────────

  describe('persistence', () => {
    it('should persist workspaces to disk and reload', () => {
      manager.saveWorkspace('persistent', [
        { repoPath: '/Users/test/repo', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);
      manager.close();

      // Create a new manager with the same path
      const manager2 = new WorkspaceManager(path.join(tmpDir, 'test.json'));
      const workspaces = manager2.listWorkspaces();
      expect(workspaces.length).toBe(1);
      expect(workspaces[0].name).toBe('persistent');
      manager2.close();
    });
  });

  // ─── getWorkspace / getWorkspaceByName ─────────────────────────────

  describe('retrieval', () => {
    it('should get workspace by ID', () => {
      const ws = manager.saveWorkspace('test', [
        { repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);

      const retrieved = manager.getWorkspace(ws.id);
      expect(retrieved?.name).toBe('test');
    });

    it('should get workspace by name', () => {
      manager.saveWorkspace('test', [
        { repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);

      const retrieved = manager.getWorkspaceByName('test');
      expect(retrieved?.name).toBe('test');
    });

    it('should return null for nonexistent workspace', () => {
      expect(manager.getWorkspace('nonexistent')).toBeNull();
      expect(manager.getWorkspaceByName('nonexistent')).toBeNull();
    });
  });

  // ─── deleteWorkspace ───────────────────────────────────────────────

  describe('deleteWorkspace', () => {
    it('should delete an existing workspace', () => {
      const ws = manager.saveWorkspace('test', [
        { repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);

      expect(manager.deleteWorkspace(ws.id)).toBe(true);
      expect(manager.listWorkspaces().length).toBe(0);
    });

    it('should return false for nonexistent workspace', () => {
      expect(manager.deleteWorkspace('nonexistent')).toBe(false);
    });
  });

  // ─── markRestored ──────────────────────────────────────────────────

  describe('markRestored', () => {
    it('should update lastRestoredAt', () => {
      const ws = manager.saveWorkspace('test', [
        { repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);

      expect(ws.lastRestoredAt).toBeNull();
      manager.markRestored(ws.id);

      const updated = manager.getWorkspace(ws.id);
      expect(updated?.lastRestoredAt).toBeTruthy();
    });
  });
});
