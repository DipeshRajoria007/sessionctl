import React, { useState } from 'react';
import { Folder, ChevronDown, ChevronRight, GitBranch } from 'lucide-react';
import { SessionGroup } from '../utils/types';
import { SessionRow } from './SessionRow';

interface SessionGroupCardProps {
  group: SessionGroup;
  onFocusSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onRemoveSession: (id: string) => void;
  defaultExpanded?: boolean;
}

export function SessionGroupCard({
  group,
  onFocusSession,
  onCloseSession,
  onRemoveSession,
  defaultExpanded = true,
}: SessionGroupCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const activeSessions = group.sessions.filter(s => s.status !== 'exited');
  const runningSessions = group.sessions.filter(s => s.status === 'running');
  const branches = [...new Set(group.sessions.map(s => s.branch).filter(Boolean))];

  return (
    <div className="card overflow-hidden animate-slide-up">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sctl-surfaceHover transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-sctl-textMuted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-sctl-textMuted flex-shrink-0" />
        )}

        <Folder className="w-4 h-4 text-sctl-accent flex-shrink-0" />

        <div className="flex-1 text-left">
          <span className="font-medium text-sm">{group.repoName}</span>
        </div>

        {/* Session count badges */}
        <div className="flex items-center gap-2">
          {runningSessions.length > 0 && (
            <span className="flex items-center gap-1 text-xs bg-sctl-green/20 text-sctl-green px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-sctl-green animate-pulse-slow" />
              {runningSessions.length} running
            </span>
          )}
          <span className="text-xs text-sctl-textMuted">
            {activeSessions.length} session{activeSessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </button>

      {/* Branch overview */}
      {expanded && branches.length > 0 && (
        <div className="px-4 pb-1 flex items-center gap-2 flex-wrap">
          {branches.map(branch => (
            <span
              key={branch}
              className="inline-flex items-center gap-1 text-xs text-sctl-cyan bg-sctl-cyan/10 px-2 py-0.5 rounded-full"
            >
              <GitBranch className="w-3 h-3" />
              {branch}
            </span>
          ))}
        </div>
      )}

      {/* Sessions list */}
      {expanded && (
        <div className="px-2 pb-2">
          {group.sessions.map((session, i) => (
            <SessionRow
              key={session.sessionId}
              session={session}
              onFocus={onFocusSession}
              onClose={onCloseSession}
              onRemove={onRemoveSession}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
