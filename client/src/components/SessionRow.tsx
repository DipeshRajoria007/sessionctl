import React, { useState } from 'react';
import {
  Terminal, GitBranch, Play, Square, MoreHorizontal, X, Eye, Copy, Clock
} from 'lucide-react';
import { Session, ToolType } from '../utils/types';

interface SessionRowProps {
  session: Session;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => void;
  index: number;
}

const TOOL_COLORS: Record<ToolType, string> = {
  claude: 'text-sctl-orange',
  codex: 'text-sctl-green',
  aider: 'text-sctl-purple',
  git: 'text-sctl-red',
  npm: 'text-sctl-yellow',
  other: 'text-sctl-textMuted',
  none: 'text-sctl-textMuted',
};

const TOOL_LABELS: Record<ToolType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  aider: 'Aider',
  git: 'Git',
  npm: 'npm',
  other: 'Shell',
  none: 'Idle',
};

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function SessionRow({ session, onFocus, onClose, onRemove, index }: SessionRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyPath = async () => {
    if (session.repoRoot) {
      await navigator.clipboard.writeText(session.repoRoot);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setShowMenu(false);
  };

  return (
    <div
      className="group flex items-center gap-3 px-3 py-2.5 hover:bg-sctl-surfaceHover rounded-lg cursor-pointer transition-colors duration-100 animate-fade-in relative"
      onClick={() => onFocus(session.sessionId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onFocus(session.sessionId)}
    >
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {session.status === 'running' ? (
          <div className="w-2 h-2 rounded-full bg-sctl-green animate-pulse-slow" />
        ) : session.status === 'idle' ? (
          <div className="w-2 h-2 rounded-full bg-sctl-textMuted" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-sctl-red" />
        )}
      </div>

      {/* Terminal icon */}
      <Terminal className="w-4 h-4 text-sctl-textMuted flex-shrink-0" />

      {/* Session info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Tool badge */}
          <span className={`text-xs font-mono font-medium ${TOOL_COLORS[session.tool]}`}>
            {TOOL_LABELS[session.tool]}
          </span>

          {/* Branch */}
          {session.branch && (
            <span className="flex items-center gap-1 text-xs text-sctl-textMuted">
              <GitBranch className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{session.branch}</span>
            </span>
          )}

          {/* Mode badge */}
          {session.mode === 'managed' && (
            <span className="text-[10px] bg-sctl-accent/20 text-sctl-accent px-1.5 py-0.5 rounded font-medium">
              managed
            </span>
          )}
        </div>

        {/* Current command */}
        {session.currentCommand && (
          <div className="text-xs font-mono text-sctl-textMuted truncate mt-0.5">
            $ {session.currentCommand}
          </div>
        )}
      </div>

      {/* Time ago */}
      <div className="flex items-center gap-1 text-xs text-sctl-textMuted flex-shrink-0">
        <Clock className="w-3 h-3" />
        {timeAgo(session.lastSeenAt)}
      </div>

      {/* Keyboard shortcut hint */}
      {index < 9 && (
        <span className="hidden group-hover:inline-flex text-[10px] text-sctl-textMuted bg-sctl-bg px-1.5 py-0.5 rounded font-mono">
          {index + 1}
        </span>
      )}

      {/* Context menu trigger */}
      <button
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-sctl-bg rounded transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
      >
        <MoreHorizontal className="w-4 h-4 text-sctl-textMuted" />
      </button>

      {/* Context menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-sctl-surface border border-sctl-border rounded-lg shadow-lg py-1 min-w-[160px] animate-fade-in">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sctl-surfaceHover text-left"
              onClick={(e) => {
                e.stopPropagation();
                onFocus(session.sessionId);
                setShowMenu(false);
              }}
            >
              <Eye className="w-4 h-4" /> Focus
            </button>
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sctl-surfaceHover text-left"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyPath();
              }}
            >
              <Copy className="w-4 h-4" /> {copied ? 'Copied!' : 'Copy Path'}
            </button>
            <div className="border-t border-sctl-border my-1" />
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sctl-surfaceHover text-left text-sctl-red"
              onClick={(e) => {
                e.stopPropagation();
                onClose(session.sessionId);
                setShowMenu(false);
              }}
            >
              <X className="w-4 h-4" /> Close Session
            </button>
          </div>
        </>
      )}
    </div>
  );
}
