import React, { useState } from 'react';
import { X, Rocket, FolderOpen } from 'lucide-react';

interface NewSessionDialogProps {
  onLaunch: (repoPath: string, opts?: {
    startupCommand?: string;
    terminalApp?: string;
    windowPreference?: string;
  }) => Promise<void>;
  onClose: () => void;
}

export function NewSessionDialog({ onLaunch, onClose }: NewSessionDialogProps) {
  const [repoPath, setRepoPath] = useState('');
  const [startupCommand, setStartupCommand] = useState('');
  const [terminalApp, setTerminalApp] = useState('iterm2');
  const [windowPref, setWindowPref] = useState('new_tab');
  const [launching, setLaunching] = useState(false);

  const handleLaunch = async () => {
    if (!repoPath.trim()) return;
    setLaunching(true);
    await onLaunch(repoPath.trim(), {
      startupCommand: startupCommand.trim() || undefined,
      terminalApp,
      windowPreference: windowPref,
    });
    setLaunching(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50 animate-fade-in">
      <div className="card w-full max-w-md p-5 space-y-4 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Rocket className="w-5 h-5 text-sctl-accent" />
            New Session
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-sctl-surfaceHover rounded">
            <X className="w-5 h-5 text-sctl-textMuted" />
          </button>
        </div>

        {/* Repo path */}
        <div>
          <label className="block text-xs text-sctl-textMuted mb-1.5">Repository Path</label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sctl-textMuted" />
            <input
              type="text"
              className="input-field w-full pl-9 font-mono text-sm"
              placeholder="/Users/you/projects/my-repo"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Startup command */}
        <div>
          <label className="block text-xs text-sctl-textMuted mb-1.5">
            Startup Command <span className="text-sctl-textMuted">(optional)</span>
          </label>
          <input
            type="text"
            className="input-field w-full font-mono text-sm"
            placeholder="e.g. claude, npm run dev"
            value={startupCommand}
            onChange={(e) => setStartupCommand(e.target.value)}
          />
        </div>

        {/* Terminal app */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs text-sctl-textMuted mb-1.5">Terminal App</label>
            <select
              className="input-field w-full text-sm"
              value={terminalApp}
              onChange={(e) => setTerminalApp(e.target.value)}
            >
              <option value="iterm2">iTerm2</option>
              <option value="terminal">Terminal.app</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-sctl-textMuted mb-1.5">Window</label>
            <select
              className="input-field w-full text-sm"
              value={windowPref}
              onChange={(e) => setWindowPref(e.target.value)}
            >
              <option value="new_tab">New Tab</option>
              <option value="new_window">New Window</option>
            </select>
          </div>
        </div>

        {/* Launch button */}
        <button
          className="btn-primary w-full flex items-center justify-center gap-2"
          onClick={handleLaunch}
          disabled={launching || !repoPath.trim()}
        >
          <Rocket className="w-4 h-4" />
          {launching ? 'Launching...' : 'Launch Session'}
        </button>
      </div>
    </div>
  );
}
