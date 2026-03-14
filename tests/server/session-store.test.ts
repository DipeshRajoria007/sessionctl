import { SessionStore } from '../../server/src/models/session-store';
import { SessionEvent, Session } from '../../server/src/models/types';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(5 * 60 * 1000, 30 * 1000);
  });

  afterEach(() => {
    store.stop();
    store.clear();
  });

  // ─── session_init ──────────────────────────────────────────────────

  describe('session_init', () => {
    it('should create a new session on init', () => {
      const event: SessionEvent = {
        type: 'session_init',
        sessionId: 'test-session-1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 12345,
        shellType: 'zsh',
        initialDirectory: '/Users/test/projects/my-repo',
      };

      const session = store.handleEvent(event);
      expect(session.sessionId).toBe('test-session-1');
      expect(session.tty).toBe('/dev/ttys001');
      expect(session.pid).toBe(12345);
      expect(session.shellType).toBe('zsh');
      expect(session.status).toBe('idle');
      expect(session.mode).toBe('attached');
      expect(session.tool).toBe('none');
      expect(store.size).toBe(1);
    });

    it('should overwrite session with same id', () => {
      const event1: SessionEvent = {
        type: 'session_init',
        sessionId: 'same-id',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 100,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      };
      const event2: SessionEvent = {
        type: 'session_init',
        sessionId: 'same-id',
        timestamp: Date.now(),
        tty: '/dev/ttys002',
        pid: 200,
        shellType: 'bash',
        initialDirectory: '/home',
      };

      store.handleEvent(event1);
      store.handleEvent(event2);
      expect(store.size).toBe(1);
      expect(store.getSession('same-id')?.pid).toBe(200);
    });
  });

  // ─── directory_changed ─────────────────────────────────────────────

  describe('directory_changed', () => {
    it('should update repo info on directory change', () => {
      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });

      const session = store.handleEvent({
        type: 'directory_changed',
        sessionId: 's1',
        timestamp: Date.now(),
        directory: '/Users/test/projects/payments-api',
        repoRoot: '/Users/test/projects/payments-api',
        repoName: 'payments-api',
        branch: 'feat/auth',
      });

      expect(session.repoRoot).toBe('/Users/test/projects/payments-api');
      expect(session.repoName).toBe('payments-api');
      expect(session.branch).toBe('feat/auth');
    });

    it('should create session stub if init was missed', () => {
      const session = store.handleEvent({
        type: 'directory_changed',
        sessionId: 'new-session',
        timestamp: Date.now(),
        directory: '/tmp',
        repoRoot: null,
        repoName: null,
        branch: null,
      });

      expect(session.sessionId).toBe('new-session');
      expect(store.size).toBe(1);
    });
  });

  // ─── command_start / command_end ───────────────────────────────────

  describe('command lifecycle', () => {
    beforeEach(() => {
      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
    });

    it('should track command start', () => {
      const session = store.handleEvent({
        type: 'command_start',
        sessionId: 's1',
        timestamp: Date.now(),
        command: 'claude',
        tool: 'claude',
      });

      expect(session.status).toBe('running');
      expect(session.tool).toBe('claude');
      expect(session.currentCommand).toBe('claude');
    });

    it('should track command end', () => {
      store.handleEvent({
        type: 'command_start',
        sessionId: 's1',
        timestamp: Date.now(),
        command: 'npm test',
        tool: 'npm',
      });

      const session = store.handleEvent({
        type: 'command_end',
        sessionId: 's1',
        timestamp: Date.now(),
        exitStatus: 0,
        duration: 5000,
      });

      expect(session.status).toBe('idle');
      expect(session.currentCommand).toBeNull();
    });
  });

  // ─── session_exit ──────────────────────────────────────────────────

  describe('session_exit', () => {
    it('should mark session as exited', () => {
      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });

      const session = store.handleEvent({
        type: 'session_exit',
        sessionId: 's1',
        timestamp: Date.now(),
      });

      expect(session.status).toBe('exited');
    });
  });

  // ─── getAppState ───────────────────────────────────────────────────

  describe('getAppState', () => {
    it('should group sessions by repo', () => {
      // Session 1: payments-api
      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
      store.handleEvent({
        type: 'directory_changed',
        sessionId: 's1',
        timestamp: Date.now(),
        directory: '/Users/test/payments-api',
        repoRoot: '/Users/test/payments-api',
        repoName: 'payments-api',
        branch: 'main',
      });

      // Session 2: also payments-api
      store.handleEvent({
        type: 'session_init',
        sessionId: 's2',
        timestamp: Date.now(),
        tty: '/dev/ttys002',
        pid: 2,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
      store.handleEvent({
        type: 'directory_changed',
        sessionId: 's2',
        timestamp: Date.now(),
        directory: '/Users/test/payments-api',
        repoRoot: '/Users/test/payments-api',
        repoName: 'payments-api',
        branch: 'feat/auth',
      });

      // Session 3: frontend
      store.handleEvent({
        type: 'session_init',
        sessionId: 's3',
        timestamp: Date.now(),
        tty: '/dev/ttys003',
        pid: 3,
        shellType: 'bash',
        initialDirectory: '/tmp',
      });
      store.handleEvent({
        type: 'directory_changed',
        sessionId: 's3',
        timestamp: Date.now(),
        directory: '/Users/test/frontend',
        repoRoot: '/Users/test/frontend',
        repoName: 'frontend',
        branch: 'main',
      });

      // Session 4: no repo (ungrouped)
      store.handleEvent({
        type: 'session_init',
        sessionId: 's4',
        timestamp: Date.now(),
        tty: '/dev/ttys004',
        pid: 4,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });

      const state = store.getAppState();

      expect(state.totalSessions).toBe(4);
      expect(state.groups.length).toBe(2);
      expect(state.ungrouped.length).toBe(1);

      const paymentsGroup = state.groups.find(g => g.repoName === 'payments-api');
      expect(paymentsGroup?.sessions.length).toBe(2);

      const frontendGroup = state.groups.find(g => g.repoName === 'frontend');
      expect(frontendGroup?.sessions.length).toBe(1);
    });

    it('should exclude exited sessions', () => {
      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
      store.handleEvent({
        type: 'session_exit',
        sessionId: 's1',
        timestamp: Date.now(),
      });

      const state = store.getAppState();
      expect(state.totalSessions).toBe(0);
    });
  });

  // ─── pruning ───────────────────────────────────────────────────────

  describe('pruneStaleSessions', () => {
    it('should prune sessions older than timeout', () => {
      // Create a store with 1ms staleness timeout for testing
      const fastStore = new SessionStore(1, 100000);

      fastStore.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });

      // Force the lastSeenAt to be in the past
      const session = fastStore.getSession('s1')!;
      session.lastSeenAt = Date.now() - 10;

      const pruned = fastStore.pruneStaleSessions();
      expect(pruned).toContain('s1');
      expect(fastStore.size).toBe(0);

      fastStore.stop();
    });
  });

  // ─── event listeners ──────────────────────────────────────────────

  describe('event listeners', () => {
    it('should notify listeners on events', () => {
      const events: string[] = [];
      store.onEvent((event) => {
        events.push(event.type);
      });

      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });

      expect(events).toEqual(['session_init']);
    });

    it('should allow unsubscribing', () => {
      const events: string[] = [];
      const unsub = store.onEvent((event) => {
        events.push(event.type);
      });

      store.handleEvent({
        type: 'session_init',
        sessionId: 's1',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });

      unsub();

      store.handleEvent({
        type: 'session_exit',
        sessionId: 's1',
        timestamp: Date.now(),
      });

      expect(events).toEqual(['session_init']);
    });
  });
});
