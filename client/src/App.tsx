import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Terminal, Plus, Settings, Wifi, WifiOff, Monitor, Keyboard
} from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';
import { useApi } from './hooks/useApi';
import { SessionGroupCard } from './components/SessionGroupCard';
import { SessionRow } from './components/SessionRow';
import { WorkspacePanel } from './components/WorkspacePanel';
import { NewSessionDialog } from './components/NewSessionDialog';
import { OnboardingView } from './components/OnboardingView';
import { SearchBar } from './components/SearchBar';
import { EmptyState } from './components/EmptyState';
import { AppState } from './utils/types';

type View = 'dashboard' | 'onboarding' | 'settings';

function App() {
  const { appState, connected } = useWebSocket();
  const api = useApi();
  const [view, setView] = useState<View>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewSession, setShowNewSession] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);

  // Check if first run
  useEffect(() => {
    const hasOnboarded = localStorage.getItem('sessionctl_onboarded');
    if (!hasOnboarded) {
      setView('onboarding');
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('sessionctl_onboarded', 'true');
    setView('dashboard');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+N = New session
      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        setShowNewSession(true);
      }
      // Escape = close dialogs
      if (e.key === 'Escape') {
        setShowNewSession(false);
      }
      // Cmd+1-9 = quick focus
      if (e.metaKey && e.key >= '1' && e.key <= '9' && appState) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        const allSessions = [
          ...appState.groups.flatMap(g => g.sessions),
          ...appState.ungrouped,
        ];
        if (allSessions[index]) {
          api.focusSession(allSessions[index].sessionId);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState, api]);

  // Filter sessions by search
  const filteredState = useMemo((): AppState | null => {
    if (!appState) return null;
    if (!searchQuery.trim()) return appState;

    const q = searchQuery.toLowerCase();

    const filteredGroups = appState.groups
      .map(group => ({
        ...group,
        sessions: group.sessions.filter(s =>
          s.repoName?.toLowerCase().includes(q) ||
          s.branch?.toLowerCase().includes(q) ||
          s.tool.toLowerCase().includes(q) ||
          s.currentCommand?.toLowerCase().includes(q) ||
          s.directory.toLowerCase().includes(q)
        ),
      }))
      .filter(group => group.sessions.length > 0);

    const filteredUngrouped = appState.ungrouped.filter(s =>
      s.directory.toLowerCase().includes(q) ||
      s.tool.toLowerCase().includes(q) ||
      s.currentCommand?.toLowerCase().includes(q)
    );

    return {
      groups: filteredGroups,
      ungrouped: filteredUngrouped,
      totalSessions: filteredGroups.reduce((a, g) => a + g.sessions.length, 0) + filteredUngrouped.length,
    };
  }, [appState, searchQuery]);

  if (view === 'onboarding') {
    return <OnboardingView onComplete={handleOnboardingComplete} getStatus={api.getStatus} />;
  }

  const state = filteredState;
  const hasSessions = (appState?.totalSessions ?? 0) > 0;

  return (
    <div className="min-h-screen bg-sctl-bg">
      {/* Header bar */}
      <header className="sticky top-0 z-30 bg-sctl-bg/80 backdrop-blur-lg border-b border-sctl-border">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sctl-accent/20 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-sctl-accent" />
              </div>
              <h1 className="font-semibold text-sm">SessionCtl</h1>
              <span className="text-[10px] text-sctl-textMuted bg-sctl-surface px-1.5 py-0.5 rounded">
                v1.0
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Connection status */}
              <div className="flex items-center gap-1.5 text-xs">
                {connected ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-sctl-green" />
                    <span className="text-sctl-green">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-sctl-red" />
                    <span className="text-sctl-red">Disconnected</span>
                  </>
                )}
              </div>

              {/* Session count */}
              {hasSessions && (
                <span className="text-xs text-sctl-textMuted">
                  {appState?.totalSessions} session{(appState?.totalSessions ?? 0) !== 1 ? 's' : ''}
                </span>
              )}

              {/* New session button */}
              <button
                className="p-1.5 hover:bg-sctl-surface rounded-lg transition-colors"
                onClick={() => setShowNewSession(true)}
                title="New Session (Cmd+N)"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Workspace toggle */}
              <button
                className={`p-1.5 rounded-lg transition-colors ${showWorkspaces ? 'bg-sctl-accent/20 text-sctl-accent' : 'hover:bg-sctl-surface'}`}
                onClick={() => setShowWorkspaces(!showWorkspaces)}
                title="Workspaces"
              >
                <Monitor className="w-4 h-4" />
              </button>

              {/* Settings */}
              <button
                className="p-1.5 hover:bg-sctl-surface rounded-lg transition-colors"
                onClick={() => setView(view === 'settings' ? 'dashboard' : 'settings')}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          {hasSessions && (
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Filter by repo, branch, tool..."
            />
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Error banner */}
        {api.error && (
          <div className="bg-sctl-red/10 border border-sctl-red/30 text-sctl-red text-sm px-4 py-2.5 rounded-lg flex items-center justify-between animate-fade-in">
            <span>{api.error}</span>
            <button onClick={api.clearError} className="text-xs hover:underline">Dismiss</button>
          </div>
        )}

        {/* Workspace panel */}
        {showWorkspaces && (
          <WorkspacePanel
            onSaveCurrent={api.saveCurrentWorkspace}
            onRestore={api.restoreWorkspace}
            onDelete={api.deleteWorkspace}
            listWorkspaces={api.listWorkspaces}
            hasActiveSessions={hasSessions}
          />
        )}

        {/* Settings view */}
        {view === 'settings' && (
          <div className="card p-5 space-y-4 animate-fade-in">
            <h2 className="text-lg font-semibold">Settings</h2>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Keyboard className="w-4 h-4" />
                  Keyboard Shortcuts
                </h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-sctl-textMuted">Toggle popover</span>
                    <kbd className="font-mono text-xs bg-sctl-bg px-2 py-1 rounded">Ctrl+Shift+S</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sctl-textMuted">New session</span>
                    <kbd className="font-mono text-xs bg-sctl-bg px-2 py-1 rounded">Cmd+N</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sctl-textMuted">Quick focus (1-9)</span>
                    <kbd className="font-mono text-xs bg-sctl-bg px-2 py-1 rounded">Cmd+1-9</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sctl-textMuted">Filter sessions</span>
                    <kbd className="font-mono text-xs bg-sctl-bg px-2 py-1 rounded">Type to filter</kbd>
                  </div>
                </div>
              </div>

              <div className="border-t border-sctl-border pt-3">
                <h3 className="text-sm font-medium mb-2">Shell Companion</h3>
                <p className="text-xs text-sctl-textMuted mb-2">
                  Add this to your shell config to enable session tracking:
                </p>
                <code className="block text-xs font-mono bg-sctl-bg px-3 py-2 rounded text-sctl-green">
                  eval "$(sessionctl init zsh)"
                </code>
              </div>

              <div className="border-t border-sctl-border pt-3">
                <button
                  className="text-xs text-sctl-textMuted hover:text-sctl-text"
                  onClick={() => {
                    localStorage.removeItem('sessionctl_onboarded');
                    setView('onboarding');
                  }}
                >
                  Re-run onboarding
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Session dashboard */}
        {view === 'dashboard' && (
          <>
            {!hasSessions ? (
              <EmptyState onSetup={() => setView('onboarding')} />
            ) : (
              <>
                {/* Grouped sessions */}
                {state?.groups.map(group => (
                  <SessionGroupCard
                    key={group.repoRoot}
                    group={group}
                    onFocusSession={api.focusSession}
                    onCloseSession={api.closeSession}
                    onRemoveSession={api.removeSession}
                  />
                ))}

                {/* Ungrouped sessions */}
                {state?.ungrouped && state.ungrouped.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-sctl-border">
                      <span className="text-sm font-medium text-sctl-textMuted">
                        Ungrouped Sessions
                      </span>
                    </div>
                    <div className="px-2 py-2">
                      {state.ungrouped.map((session, i) => (
                        <SessionRow
                          key={session.sessionId}
                          session={session}
                          onFocus={api.focusSession}
                          onClose={api.closeSession}
                          onRemove={api.removeSession}
                          index={i}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* No search results */}
                {searchQuery && state?.totalSessions === 0 && (
                  <div className="text-center py-8 text-sctl-textMuted text-sm">
                    No sessions matching "{searchQuery}"
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* New session dialog */}
      {showNewSession && (
        <NewSessionDialog
          onLaunch={api.launchSession}
          onClose={() => setShowNewSession(false)}
        />
      )}
    </div>
  );
}

export default App;
