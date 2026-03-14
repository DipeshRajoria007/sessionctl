import React, { useState, useEffect } from 'react';
import {
  Save, RotateCcw, Trash2, Plus, Archive, ChevronRight, X
} from 'lucide-react';
import { Workspace } from '../utils/types';

interface WorkspacePanelProps {
  onSaveCurrent: (name: string) => Promise<any>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  listWorkspaces: () => Promise<Workspace[]>;
  hasActiveSessions: boolean;
}

export function WorkspacePanel({
  onSaveCurrent,
  onRestore,
  onDelete,
  listWorkspaces,
  hasActiveSessions,
}: WorkspacePanelProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = async () => {
    const list = await listWorkspaces();
    setWorkspaces(list);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    const result = await onSaveCurrent(saveName.trim());
    if (result) {
      setSaveName('');
      setShowSaveDialog(false);
      await refresh();
    }
    setSaving(false);
  };

  const handleRestore = async (id: string) => {
    await onRestore(id);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setConfirmDelete(null);
    await refresh();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-sctl-textMuted flex items-center gap-2">
          <Archive className="w-4 h-4" />
          Workspaces
        </h3>
        {hasActiveSessions && (
          <button
            className="text-xs btn-secondary py-1 px-2 flex items-center gap-1"
            onClick={() => setShowSaveDialog(true)}
          >
            <Plus className="w-3 h-3" /> Save Current
          </button>
        )}
      </div>

      {/* Save dialog */}
      {showSaveDialog && (
        <div className="card p-3 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Save Workspace</span>
            <button onClick={() => setShowSaveDialog(false)} className="p-1 hover:bg-sctl-surfaceHover rounded">
              <X className="w-4 h-4 text-sctl-textMuted" />
            </button>
          </div>
          <input
            type="text"
            className="input-field w-full text-sm"
            placeholder="e.g. payments-stack"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            maxLength={128}
            autoFocus
          />
          <p className="text-xs text-sctl-textMuted">
            Saves all active sessions so you can restore them later.
          </p>
          <button
            className="btn-primary text-sm w-full flex items-center justify-center gap-2"
            onClick={handleSave}
            disabled={saving || !saveName.trim()}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Workspace'}
          </button>
        </div>
      )}

      {/* Workspace list */}
      {workspaces.length === 0 ? (
        <p className="text-xs text-sctl-textMuted text-center py-4">
          No saved workspaces yet. Save your current session layout to restore it later.
        </p>
      ) : (
        <div className="space-y-2">
          {workspaces.map((ws) => (
            <div key={ws.id} className="card px-3 py-2.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{ws.name}</div>
                  <div className="text-xs text-sctl-textMuted mt-0.5">
                    {ws.sessions.length} session{ws.sessions.length !== 1 ? 's' : ''}
                    {ws.lastRestoredAt && (
                      <> · Last restored {new Date(ws.lastRestoredAt).toLocaleDateString()}</>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-2">
                  <button
                    className="p-1.5 hover:bg-sctl-surfaceHover rounded text-sctl-accent"
                    onClick={() => handleRestore(ws.id)}
                    title="Restore workspace"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  {confirmDelete === ws.id ? (
                    <button
                      className="p-1.5 bg-sctl-red/20 hover:bg-sctl-red/30 rounded text-sctl-red text-xs font-medium"
                      onClick={() => handleDelete(ws.id)}
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      className="p-1.5 hover:bg-sctl-surfaceHover rounded text-sctl-textMuted hover:text-sctl-red"
                      onClick={() => setConfirmDelete(ws.id)}
                      title="Delete workspace"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Session previews */}
              <div className="mt-2 flex flex-wrap gap-1">
                {ws.sessions.map((s, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-mono bg-sctl-bg px-1.5 py-0.5 rounded text-sctl-textMuted"
                  >
                    {s.repoPath.split('/').pop()}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
