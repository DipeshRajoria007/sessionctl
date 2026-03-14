import { SessionEvent } from '../../server/src/models/types';

describe('Event Validation (Zod)', () => {

  describe('session_init', () => {
    it('should accept valid session_init event', () => {
      const result = SessionEvent.safeParse({
        type: 'session_init',
        sessionId: 'abc123',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 12345,
        shellType: 'zsh',
        initialDirectory: '/Users/test',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty sessionId', () => {
      const result = SessionEvent.safeParse({
        type: 'session_init',
        sessionId: '',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid shell type', () => {
      const result = SessionEvent.safeParse({
        type: 'session_init',
        sessionId: 'test',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'fish',
        initialDirectory: '/tmp',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative PID', () => {
      const result = SessionEvent.safeParse({
        type: 'session_init',
        sessionId: 'test',
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: -1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('directory_changed', () => {
    it('should accept valid directory_changed with repo', () => {
      const result = SessionEvent.safeParse({
        type: 'directory_changed',
        sessionId: 'test',
        timestamp: Date.now(),
        directory: '/Users/test/repo',
        repoRoot: '/Users/test/repo',
        repoName: 'repo',
        branch: 'main',
      });
      expect(result.success).toBe(true);
    });

    it('should accept directory_changed with null repo fields', () => {
      const result = SessionEvent.safeParse({
        type: 'directory_changed',
        sessionId: 'test',
        timestamp: Date.now(),
        directory: '/tmp',
        repoRoot: null,
        repoName: null,
        branch: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('command_start', () => {
    it('should accept valid command_start', () => {
      const result = SessionEvent.safeParse({
        type: 'command_start',
        sessionId: 'test',
        timestamp: Date.now(),
        command: 'claude code review',
        tool: 'claude',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all tool types', () => {
      for (const tool of ['claude', 'codex', 'aider', 'git', 'npm', 'other', 'none']) {
        const result = SessionEvent.safeParse({
          type: 'command_start',
          sessionId: 'test',
          timestamp: Date.now(),
          command: 'some command',
          tool,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid tool type', () => {
      const result = SessionEvent.safeParse({
        type: 'command_start',
        sessionId: 'test',
        timestamp: Date.now(),
        command: 'test',
        tool: 'invalid-tool',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('command_end', () => {
    it('should accept valid command_end', () => {
      const result = SessionEvent.safeParse({
        type: 'command_end',
        sessionId: 'test',
        timestamp: Date.now(),
        exitStatus: 0,
        duration: 1500,
      });
      expect(result.success).toBe(true);
    });

    it('should accept non-zero exit status', () => {
      const result = SessionEvent.safeParse({
        type: 'command_end',
        sessionId: 'test',
        timestamp: Date.now(),
        exitStatus: 127,
        duration: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('session_exit', () => {
    it('should accept valid session_exit', () => {
      const result = SessionEvent.safeParse({
        type: 'session_exit',
        sessionId: 'test',
        timestamp: Date.now(),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should reject unknown event type', () => {
      const result = SessionEvent.safeParse({
        type: 'unknown_event',
        sessionId: 'test',
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });

    it('should reject oversized sessionId', () => {
      const result = SessionEvent.safeParse({
        type: 'session_init',
        sessionId: 'x'.repeat(257),
        timestamp: Date.now(),
        tty: '/dev/ttys001',
        pid: 1,
        shellType: 'zsh',
        initialDirectory: '/tmp',
      });
      expect(result.success).toBe(false);
    });

    it('should reject oversized command', () => {
      const result = SessionEvent.safeParse({
        type: 'command_start',
        sessionId: 'test',
        timestamp: Date.now(),
        command: 'x'.repeat(8193),
        tool: 'other',
      });
      expect(result.success).toBe(false);
    });

    it('should handle missing fields gracefully', () => {
      const result = SessionEvent.safeParse({
        type: 'session_init',
        sessionId: 'test',
        // missing everything else
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-object input', () => {
      expect(SessionEvent.safeParse(null).success).toBe(false);
      expect(SessionEvent.safeParse('string').success).toBe(false);
      expect(SessionEvent.safeParse(42).success).toBe(false);
    });
  });
});
