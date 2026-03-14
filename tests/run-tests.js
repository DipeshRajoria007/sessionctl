/**
 * Lightweight test runner for SessionCtl.
 * No external dependencies needed.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Mini test framework ─────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
let currentSuite = '';

function describe(name, fn) {
  const prev = currentSuite;
  currentSuite = currentSuite ? `${currentSuite} > ${name}` : name;
  fn();
  currentSuite = prev;
}

function it(name, fn) {
  totalTests++;
  const testName = `${currentSuite} > ${name}`;
  try {
    fn();
    passedTests++;
    process.stdout.write('\x1b[32m.\x1b[0m');
  } catch (err) {
    failedTests++;
    failures.push({ name: testName, error: err.message });
    process.stdout.write('\x1b[31mF\x1b[0m');
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) throw new Error(`Expected ${e}, got ${a}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeNull() {
      if (actual !== null) throw new Error(`Expected null, got ${JSON.stringify(actual)}`);
    },
    toContain(item) {
      if (!actual.includes(item)) throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
    },
    toThrow(pattern) {
      let threw = false;
      try { actual(); } catch (e) {
        threw = true;
        if (pattern && !e.message.includes(pattern)) {
          throw new Error(`Expected error matching "${pattern}", got "${e.message}"`);
        }
      }
      if (!threw) throw new Error('Expected function to throw');
    },
  };
}

// ─── Load compiled modules ───────────────────────────────────────────────

const distDir = path.join(__dirname, '..', 'server', 'dist');
const { SessionStore } = require(path.join(distDir, 'models', 'session-store'));
const { WorkspaceManager } = require(path.join(distDir, 'models', 'workspace-manager'));
const { SessionEvent } = require(path.join(distDir, 'models', 'types'));

console.log('SessionCtl Test Suite');
console.log('─'.repeat(40));
console.log('');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite: SessionStore
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('SessionStore', () => {

  describe('session_init', () => {
    it('should create a new session on init', () => {
      const store = new SessionStore();
      const session = store.handleEvent({
        type: 'session_init',
        sessionId: 'test-1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 12345,
        shellType: 'zsh',
        initialDirectory: '/Users/test',
      });
      expect(session.sessionId).toBe('test-1');
      expect(session.tty).toBe('/dev/ttys001');
      expect(session.pid).toBe(12345);
      expect(session.status).toBe('idle');
      expect(session.mode).toBe('attached');
      expect(store.size).toBe(1);
      store.clear();
    });

    it('should overwrite session with same id', () => {
      const store = new SessionStore();
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 100, shellType: 'zsh', initialDirectory: '/tmp' });
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys002', pid: 200, shellType: 'bash', initialDirectory: '/home' });
      expect(store.size).toBe(1);
      expect(store.getSession('s1').pid).toBe(200);
      store.clear();
    });
  });

  describe('directory_changed', () => {
    it('should update repo info on directory change', () => {
      const store = new SessionStore();
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
      const session = store.handleEvent({
        type: 'directory_changed', sessionId: 's1', timestamp: Date.now(),
        directory: '/Users/test/payments-api', repoRoot: '/Users/test/payments-api', repoName: 'payments-api', branch: 'feat/auth',
      });
      expect(session.repoName).toBe('payments-api');
      expect(session.branch).toBe('feat/auth');
      store.clear();
    });

    it('should create session stub if init was missed', () => {
      const store = new SessionStore();
      const session = store.handleEvent({
        type: 'directory_changed', sessionId: 'new', timestamp: Date.now(),
        directory: '/tmp', repoRoot: null, repoName: null, branch: null,
      });
      expect(session.sessionId).toBe('new');
      expect(store.size).toBe(1);
      store.clear();
    });
  });

  describe('command lifecycle', () => {
    it('should track command start and end', () => {
      const store = new SessionStore();
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });

      let session = store.handleEvent({ type: 'command_start', sessionId: 's1', timestamp: Date.now(), command: 'claude', tool: 'claude' });
      expect(session.status).toBe('running');
      expect(session.tool).toBe('claude');

      session = store.handleEvent({ type: 'command_end', sessionId: 's1', timestamp: Date.now(), exitStatus: 0, duration: 5000 });
      expect(session.status).toBe('idle');
      expect(session.currentCommand).toBeNull();
      store.clear();
    });
  });

  describe('session_exit', () => {
    it('should mark session as exited', () => {
      const store = new SessionStore();
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
      const session = store.handleEvent({ type: 'session_exit', sessionId: 's1', timestamp: Date.now() });
      expect(session.status).toBe('exited');
      store.clear();
    });
  });

  describe('getAppState', () => {
    it('should group sessions by repo', () => {
      const store = new SessionStore();
      const now = Date.now();
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: now, tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
      store.handleEvent({ type: 'directory_changed', sessionId: 's1', timestamp: now, directory: '/repo1', repoRoot: '/repo1', repoName: 'repo1', branch: 'main' });
      store.handleEvent({ type: 'session_init', sessionId: 's2', timestamp: now, tty: '/dev/ttys002', pid: 2, shellType: 'zsh', initialDirectory: '/tmp' });
      store.handleEvent({ type: 'directory_changed', sessionId: 's2', timestamp: now, directory: '/repo1', repoRoot: '/repo1', repoName: 'repo1', branch: 'dev' });
      store.handleEvent({ type: 'session_init', sessionId: 's3', timestamp: now, tty: '/dev/ttys003', pid: 3, shellType: 'bash', initialDirectory: '/tmp' });
      store.handleEvent({ type: 'directory_changed', sessionId: 's3', timestamp: now, directory: '/repo2', repoRoot: '/repo2', repoName: 'repo2', branch: 'main' });
      store.handleEvent({ type: 'session_init', sessionId: 's4', timestamp: now, tty: '/dev/ttys004', pid: 4, shellType: 'zsh', initialDirectory: '/tmp' });

      const state = store.getAppState();
      expect(state.totalSessions).toBe(4);
      expect(state.groups.length).toBe(2);
      expect(state.ungrouped.length).toBe(1);
      store.clear();
    });

    it('should exclude exited sessions from total', () => {
      const store = new SessionStore();
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
      store.handleEvent({ type: 'session_exit', sessionId: 's1', timestamp: Date.now() });
      const state = store.getAppState();
      expect(state.totalSessions).toBe(0);
      store.clear();
    });
  });

  describe('pruneStaleSessions', () => {
    it('should prune sessions older than timeout', () => {
      const store = new SessionStore(1, 100000);
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
      store.getSession('s1').lastSeenAt = Date.now() - 10;
      const pruned = store.pruneStaleSessions();
      expect(pruned.length).toBe(1);
      expect(store.size).toBe(0);
    });
  });

  describe('event listeners', () => {
    it('should notify and allow unsubscribe', () => {
      const store = new SessionStore();
      const events = [];
      const unsub = store.onEvent((event) => events.push(event.type));
      store.handleEvent({ type: 'session_init', sessionId: 's1', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
      expect(events.length).toBe(1);
      unsub();
      store.handleEvent({ type: 'session_exit', sessionId: 's1', timestamp: Date.now() });
      expect(events.length).toBe(1);
      store.clear();
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite: WorkspaceManager
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('WorkspaceManager', () => {

  function makeMgr() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sctl-wm-'));
    const mgr = new WorkspaceManager(path.join(dir, 'db.json'));
    return { mgr, dir };
  }

  describe('saveWorkspace', () => {
    it('should save a workspace', () => {
      const { mgr, dir } = makeMgr();
      const ws = mgr.saveWorkspace('my-workspace', [
        { repoPath: '/Users/test/repo1', terminalApp: 'iterm2', windowPreference: 'new_tab' },
      ]);
      expect(ws.name).toBe('my-workspace');
      expect(ws.sessions.length).toBe(1);
      expect(ws.id).toBeTruthy();
      mgr.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should update existing workspace by name', () => {
      const { mgr, dir } = makeMgr();
      const ws1 = mgr.saveWorkspace('test', [{ repoPath: '/repo1', terminalApp: 'iterm2', windowPreference: 'new_tab' }]);
      const ws2 = mgr.saveWorkspace('test', [{ repoPath: '/repo2', terminalApp: 'terminal', windowPreference: 'new_window' }]);
      expect(ws2.id).toBe(ws1.id);
      expect(mgr.listWorkspaces().length).toBe(1);
      mgr.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('should reject invalid name', () => {
      const { mgr, dir } = makeMgr();
      expect(() => mgr.saveWorkspace('', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }])).toThrow('1-128');
      expect(() => mgr.saveWorkspace('test<script>', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }])).toThrow('only contain');
      expect(() => mgr.saveWorkspace('test', [])).toThrow('at least one');
      mgr.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('persistence', () => {
    it('should persist and reload workspaces', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sctl-persist-'));
      const dbPath = path.join(dir, 'db.json');
      const mgr1 = new WorkspaceManager(dbPath);
      mgr1.saveWorkspace('persistent', [{ repoPath: '/repo', terminalApp: 'iterm2', windowPreference: 'new_tab' }]);
      mgr1.close();

      const mgr2 = new WorkspaceManager(dbPath);
      expect(mgr2.listWorkspaces().length).toBe(1);
      expect(mgr2.listWorkspaces()[0].name).toBe('persistent');
      mgr2.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete workspace', () => {
      const { mgr, dir } = makeMgr();
      const ws = mgr.saveWorkspace('deleteme', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }]);
      expect(mgr.deleteWorkspace(ws.id)).toBe(true);
      expect(mgr.listWorkspaces().length).toBe(0);
      expect(mgr.deleteWorkspace('nonexistent')).toBe(false);
      mgr.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  describe('markRestored', () => {
    it('should update lastRestoredAt', () => {
      const { mgr, dir } = makeMgr();
      const ws = mgr.saveWorkspace('restore-test', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }]);
      expect(ws.lastRestoredAt).toBeNull();
      mgr.markRestored(ws.id);
      expect(mgr.getWorkspace(ws.id).lastRestoredAt).toBeTruthy();
      mgr.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite: Event Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Event Validation', () => {

  it('should accept valid session_init', () => {
    const result = SessionEvent.safeParse({ type: 'session_init', sessionId: 'abc', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
    expect(result.success).toBe(true);
  });

  it('should reject empty sessionId', () => {
    const result = SessionEvent.safeParse({ type: 'session_init', sessionId: '', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid shell type (fish)', () => {
    const result = SessionEvent.safeParse({ type: 'session_init', sessionId: 'test', timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'fish', initialDirectory: '/tmp' });
    expect(result.success).toBe(false);
  });

  it('should reject negative PID', () => {
    const result = SessionEvent.safeParse({ type: 'session_init', sessionId: 'test', timestamp: Date.now(), tty: '/dev/ttys001', pid: -1, shellType: 'zsh', initialDirectory: '/tmp' });
    expect(result.success).toBe(false);
  });

  it('should accept directory_changed with null repo', () => {
    const result = SessionEvent.safeParse({ type: 'directory_changed', sessionId: 'test', timestamp: Date.now(), directory: '/tmp', repoRoot: null, repoName: null, branch: null });
    expect(result.success).toBe(true);
  });

  it('should accept all tool types in command_start', () => {
    for (const tool of ['claude', 'codex', 'aider', 'git', 'npm', 'other', 'none']) {
      const result = SessionEvent.safeParse({ type: 'command_start', sessionId: 'test', timestamp: Date.now(), command: 'cmd', tool });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid tool type', () => {
    const result = SessionEvent.safeParse({ type: 'command_start', sessionId: 'test', timestamp: Date.now(), command: 'cmd', tool: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('should reject unknown event type', () => {
    const result = SessionEvent.safeParse({ type: 'unknown', sessionId: 'test', timestamp: Date.now() });
    expect(result.success).toBe(false);
  });

  it('should reject oversized sessionId (>256 chars)', () => {
    const result = SessionEvent.safeParse({ type: 'session_init', sessionId: 'x'.repeat(257), timestamp: Date.now(), tty: '/dev/ttys001', pid: 1, shellType: 'zsh', initialDirectory: '/tmp' });
    expect(result.success).toBe(false);
  });

  it('should reject oversized command (>8192 chars)', () => {
    const result = SessionEvent.safeParse({ type: 'command_start', sessionId: 'test', timestamp: Date.now(), command: 'x'.repeat(8193), tool: 'other' });
    expect(result.success).toBe(false);
  });

  it('should reject non-object input', () => {
    expect(SessionEvent.safeParse(null).success).toBe(false);
    expect(SessionEvent.safeParse('string').success).toBe(false);
    expect(SessionEvent.safeParse(42).success).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test Suite: Security
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('Security', () => {

  it('should not allow path traversal in workspace name', () => {
    const mgr = new WorkspaceManager(path.join(os.tmpdir(), 'sctl-sec-test', 'sec.json'));
    expect(() => mgr.saveWorkspace('../../../etc/passwd', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }])).toThrow('only contain');
    mgr.close();
    fs.rmSync(path.join(os.tmpdir(), 'sctl-sec-test'), { recursive: true, force: true });
  });

  it('should sanitize XSS in workspace name', () => {
    const mgr = new WorkspaceManager(path.join(os.tmpdir(), 'sctl-sec-test2', 'sec.json'));
    expect(() => mgr.saveWorkspace('<script>alert(1)</script>', [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }])).toThrow('only contain');
    mgr.close();
    fs.rmSync(path.join(os.tmpdir(), 'sctl-sec-test2'), { recursive: true, force: true });
  });

  it('should reject SQL injection attempts in workspace name', () => {
    const mgr = new WorkspaceManager(path.join(os.tmpdir(), 'sctl-sec-test3', 'sec.json'));
    expect(() => mgr.saveWorkspace("'; DROP TABLE workspaces;--", [{ repoPath: '/tmp', terminalApp: 'iterm2', windowPreference: 'new_tab' }])).toThrow('only contain');
    mgr.close();
    fs.rmSync(path.join(os.tmpdir(), 'sctl-sec-test3'), { recursive: true, force: true });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Results
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('\n');
console.log('─'.repeat(40));
console.log(`Total: ${totalTests} | \x1b[32mPassed: ${passedTests}\x1b[0m | \x1b[31mFailed: ${failedTests}\x1b[0m`);

if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(({ name, error }, i) => {
    console.log(`  ${i + 1}. \x1b[31m${name}\x1b[0m`);
    console.log(`     ${error}`);
  });
  process.exit(1);
} else {
  console.log('\n\x1b[32mAll tests passed!\x1b[0m');
}
