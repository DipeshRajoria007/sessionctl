import { execFile } from 'child_process';
import { promisify } from 'util';
import { TerminalApp, SessionDef } from '../models/types';

const execFileAsync = promisify(execFile);

// Maximum script execution time
const EXEC_TIMEOUT_MS = 10_000;

/**
 * Abstract terminal adapter interface.
 * Each supported terminal app gets its own implementation.
 */
export interface TerminalAdapter {
  readonly name: TerminalApp;

  /** Check if this terminal app is available on the system. */
  isAvailable(): Promise<boolean>;

  /** Focus a specific session by TTY path. */
  focusSession(tty: string): Promise<void>;

  /** Launch a new terminal session. */
  launchSession(def: SessionDef): Promise<void>;

  /** Update the badge/title for a session. */
  updateLabel(tty: string, label: string): Promise<void>;

  /** Close a terminal session. */
  closeSession(tty: string): Promise<void>;
}

/**
 * Execute an AppleScript safely with timeout.
 */
async function runAppleScript(script: string): Promise<string> {
  // Sanitize: ensure no script injection
  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  } catch (err: any) {
    // On Linux (no osascript), return empty
    if (err.code === 'ENOENT') {
      throw new Error('AppleScript is not available on this platform');
    }
    throw err;
  }
}

/**
 * Escape a string for safe use in AppleScript string literals.
 * Handles backslashes, double quotes, newlines, tabs, and control characters.
 */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')     // Backslashes first
    .replace(/"/g, '\\"')        // Double quotes
    .replace(/\n/g, '\\n')      // Newlines (prevent statement injection)
    .replace(/\r/g, '\\r')      // Carriage returns
    .replace(/\t/g, '\\t')      // Tabs
    .replace(/[\x00-\x1f\x7f]/g, ''); // Strip all other control characters
}

/**
 * Validate a filesystem path to prevent path traversal.
 */
function validatePath(p: string): boolean {
  // Must be absolute path
  if (!p.startsWith('/')) return false;
  // No path traversal
  if (p.includes('..')) return false;
  // No null bytes
  if (p.includes('\0')) return false;
  // Reasonable length
  if (p.length > 4096) return false;
  return true;
}

/**
 * Validate a startup command for safety.
 * Allows only safe characters - no shell metacharacters that could escape context.
 */
function validateCommand(cmd: string): boolean {
  // Block dangerous shell metacharacters that could escape AppleScript string context
  const dangerousPatterns = /[;&|`$(){}[\]<>!]/;
  if (dangerousPatterns.test(cmd)) return false;
  if (cmd.length > 8192) return false;
  return true;
}

/**
 * iTerm2 adapter using AppleScript and escape sequences.
 */
export class ITerm2Adapter implements TerminalAdapter {
  readonly name: TerminalApp = 'iterm2';

  async isAvailable(): Promise<boolean> {
    try {
      const result = await runAppleScript(
        'tell application "System Events" to (name of processes) contains "iTerm2"'
      );
      return result === 'true';
    } catch {
      return false;
    }
  }

  async focusSession(tty: string): Promise<void> {
    const escapedTty = escapeAppleScript(tty);
    const script = `
      tell application "iTerm2"
        activate
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if tty of s is "${escapedTty}" then
                select t
                select s
                return
              end if
            end repeat
          end repeat
        end repeat
      end tell
    `;
    await runAppleScript(script);
  }

  async launchSession(def: SessionDef): Promise<void> {
    // Validate inputs to prevent command injection
    if (!validatePath(def.repoPath)) {
      throw new Error('Invalid repository path');
    }
    if (def.startupCommand && !validateCommand(def.startupCommand)) {
      throw new Error('Invalid startup command: contains unsafe characters');
    }

    const escapedPath = escapeAppleScript(def.repoPath);
    const command = def.startupCommand
      ? `cd "${escapedPath}" && ${escapeAppleScript(def.startupCommand)}`
      : `cd "${escapedPath}"`;

    const target = def.windowPreference === 'new_window'
      ? 'create window with default profile'
      : 'tell current window to create tab with default profile';

    const script = `
      tell application "iTerm2"
        activate
        ${target}
        tell current session of current window
          write text "${escapeAppleScript(command)}"
        end tell
      end tell
    `;
    await runAppleScript(script);
  }

  async updateLabel(tty: string, label: string): Promise<void> {
    const escapedTty = escapeAppleScript(tty);
    const escapedLabel = escapeAppleScript(label);
    const script = `
      tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if tty of s is "${escapedTty}" then
                tell s
                  set name to "${escapedLabel}"
                  set variable named "user.badge" to "${escapedLabel}"
                end tell
                return
              end if
            end repeat
          end repeat
        end repeat
      end tell
    `;
    await runAppleScript(script);
  }

  async closeSession(tty: string): Promise<void> {
    const escapedTty = escapeAppleScript(tty);
    const script = `
      tell application "iTerm2"
        repeat with w in windows
          repeat with t in tabs of w
            repeat with s in sessions of t
              if tty of s is "${escapedTty}" then
                close s
                return
              end if
            end repeat
          end repeat
        end repeat
      end tell
    `;
    await runAppleScript(script);
  }
}

/**
 * Terminal.app adapter using AppleScript.
 */
export class TerminalAppAdapter implements TerminalAdapter {
  readonly name: TerminalApp = 'terminal';

  async isAvailable(): Promise<boolean> {
    try {
      const result = await runAppleScript(
        'tell application "System Events" to (name of processes) contains "Terminal"'
      );
      return result === 'true';
    } catch {
      return false;
    }
  }

  async focusSession(tty: string): Promise<void> {
    const escapedTty = escapeAppleScript(tty);
    const script = `
      tell application "Terminal"
        activate
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is "${escapedTty}" then
              set selected of t to true
              set index of w to 1
              return
            end if
          end repeat
        end repeat
      end tell
    `;
    await runAppleScript(script);
  }

  async launchSession(def: SessionDef): Promise<void> {
    // Validate inputs to prevent command injection
    if (!validatePath(def.repoPath)) {
      throw new Error('Invalid repository path');
    }
    if (def.startupCommand && !validateCommand(def.startupCommand)) {
      throw new Error('Invalid startup command: contains unsafe characters');
    }

    const escapedPath = escapeAppleScript(def.repoPath);
    const command = def.startupCommand
      ? `cd "${escapedPath}" && ${escapeAppleScript(def.startupCommand)}`
      : `cd "${escapedPath}"`;

    if (def.windowPreference === 'new_window') {
      const script = `
        tell application "Terminal"
          activate
          do script "${escapeAppleScript(command)}"
        end tell
      `;
      await runAppleScript(script);
    } else {
      const script = `
        tell application "Terminal"
          activate
          tell application "System Events" to keystroke "t" using command down
          delay 0.3
          do script "${escapeAppleScript(command)}" in front window
        end tell
      `;
      await runAppleScript(script);
    }
  }

  async updateLabel(tty: string, label: string): Promise<void> {
    const escapedTty = escapeAppleScript(tty);
    const escapedLabel = escapeAppleScript(label);
    const script = `
      tell application "Terminal"
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is "${escapedTty}" then
              set custom title of t to "${escapedLabel}"
              return
            end if
          end repeat
        end repeat
      end tell
    `;
    await runAppleScript(script);
  }

  async closeSession(tty: string): Promise<void> {
    const escapedTty = escapeAppleScript(tty);
    const script = `
      tell application "Terminal"
        repeat with w in windows
          repeat with t in tabs of w
            if tty of t is "${escapedTty}" then
              close t
              return
            end if
          end repeat
        end repeat
      end tell
    `;
    await runAppleScript(script);
  }
}

/**
 * Registry of terminal adapters.
 */
export class TerminalAdapterRegistry {
  private adapters: Map<TerminalApp, TerminalAdapter> = new Map();

  constructor() {
    this.adapters.set('iterm2', new ITerm2Adapter());
    this.adapters.set('terminal', new TerminalAppAdapter());
  }

  get(app: TerminalApp): TerminalAdapter | undefined {
    return this.adapters.get(app);
  }

  async detectAvailable(): Promise<TerminalApp[]> {
    const available: TerminalApp[] = [];
    for (const [name, adapter] of this.adapters) {
      try {
        if (await adapter.isAvailable()) {
          available.push(name);
        }
      } catch {
        // Skip unavailable adapters
      }
    }
    return available;
  }
}
