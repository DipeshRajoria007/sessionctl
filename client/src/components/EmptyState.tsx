import React from 'react';
import { Terminal, ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  onSetup: () => void;
}

export function EmptyState({ onSetup }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-sctl-surface flex items-center justify-center mb-4">
        <Terminal className="w-7 h-7 text-sctl-textMuted" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No sessions detected</h3>
      <p className="text-sm text-sctl-textMuted mb-6 max-w-xs">
        Install the shell companion in your terminal to start tracking sessions, or launch a new managed session.
      </p>
      <button className="btn-primary flex items-center gap-2" onClick={onSetup}>
        Setup Guide <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
