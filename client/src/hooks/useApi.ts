import { useState, useCallback } from 'react';
import { Workspace, StatusInfo } from '../utils/types';

const API_BASE = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ─── Sessions ──────────────────────────────────────────────────────

  const focusSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      await apiFetch(`/sessions/${encodeURIComponent(sessionId)}/focus`, { method: 'POST' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeSession = useCallback(async (sessionId: string) => {
    try {
      setLoading(true);
      await apiFetch(`/sessions/${encodeURIComponent(sessionId)}/close`, { method: 'POST' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeSession = useCallback(async (sessionId: string) => {
    try {
      await apiFetch(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ─── Launch ────────────────────────────────────────────────────────

  const launchSession = useCallback(async (
    repoPath: string,
    opts?: { startupCommand?: string; terminalApp?: string; windowPreference?: string }
  ) => {
    try {
      setLoading(true);
      await apiFetch('/launch', {
        method: 'POST',
        body: JSON.stringify({ repoPath, ...opts }),
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Workspaces ────────────────────────────────────────────────────

  const listWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    try {
      return await apiFetch<Workspace[]>('/workspaces');
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  const saveWorkspace = useCallback(async (name: string, sessions: any[]) => {
    try {
      setLoading(true);
      return await apiFetch<Workspace>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name, sessions }),
      });
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveCurrentWorkspace = useCallback(async (name: string) => {
    try {
      setLoading(true);
      return await apiFetch<Workspace>('/workspaces/save-current', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreWorkspace = useCallback(async (id: string) => {
    try {
      setLoading(true);
      await apiFetch(`/workspaces/${encodeURIComponent(id)}/restore`, { method: 'POST' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteWorkspace = useCallback(async (id: string) => {
    try {
      await apiFetch(`/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  // ─── Status ────────────────────────────────────────────────────────

  const getStatus = useCallback(async (): Promise<StatusInfo | null> => {
    try {
      return await apiFetch<StatusInfo>('/status');
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  return {
    loading,
    error,
    clearError,
    focusSession,
    closeSession,
    removeSession,
    launchSession,
    listWorkspaces,
    saveWorkspace,
    saveCurrentWorkspace,
    restoreWorkspace,
    deleteWorkspace,
    getStatus,
  };
}
