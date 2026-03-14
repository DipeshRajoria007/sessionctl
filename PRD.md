# SessionCtl

**Mission Control for AI Terminal Sessions**

**Product Requirements Document — v1.0**

| Field          | Value                    |
| -------------- | ------------------------ |
| Working Title  | SessionCtl               |
| Version        | 1.0 (Draft)              |
| Date           | March 2026               |
| Author         | Dipesh                   |
| Distribution   | Open source (MIT)        |
| Platform       | macOS (native Swift)     |
| Status         | Pre-development          |

---

## Executive Summary

SessionCtl is a native macOS menu bar app that discovers, labels, groups, launches, and focuses terminal sessions by repository. It targets developers running multiple AI coding sessions (Claude Code, Codex, aider) across local repositories who lose context because terminal windows do not expose repo, branch, tool, or session state.

The app uses a lightweight shell companion as its source of truth, with native integrations for iTerm2 (primary) and Terminal.app (secondary). It is local-first, metadata-only, and open source from day one.

---

## Problem Statement

Developers running multiple AI coding agents across repositories face a compounding context problem:

- **Terminal windows and tabs are visually identical.** A developer with six sessions open cannot tell at a glance which one is the payments-api on feat/auth versus the frontend on main.
- **Window titles are unreliable.** They get overwritten by running processes (vim, htop, npm), leaving stale or misleading labels.
- **Switching costs multiply.** Alt-tabbing through unlabelled terminals to find the right session breaks flow state and wastes minutes per hour.
- **Workspace reconstruction is manual.** After a reboot or at the start of a workday, developers manually reopen 4–10 terminal sessions, cd into the right directories, and relaunch tools.

The root cause is that terminals are process managers, not project managers. They have no concept of which repository a session belongs to or what role it plays in a developer's workflow.

---

## Target User

**Primary persona:** A developer running 3–10 concurrent AI coding sessions across 2–5 local repositories on macOS. They use Claude Code, Codex, aider, or similar terminal-based AI tools alongside manual shell sessions for git, builds, and servers.

**Key traits:**

- Uses iTerm2 or Terminal.app (or both)
- Has zsh or bash as their default shell
- Works across multiple repos daily
- Values keyboard shortcuts and fast switching
- Cares about privacy — does not want session data leaving their machine

---

## v1 Scope

### Core Capabilities

| #  | Capability          | Description |
| -- | ------------------- | ----------- |
| C1 | Session Discovery   | Detect all active terminal sessions and map each to its repository, branch, terminal app, and running tool. |
| C2 | Session Dashboard   | Menu bar popover showing all sessions grouped by repo, with one-click focus to jump to any session. |
| C3 | Session Labelling   | Set iTerm2 badges and Terminal.app window titles to show repo, branch, and tool at a glance. |
| C4 | Managed Launch      | Launch new terminal sessions pre-configured with a target repo, directory, and optional startup command. |
| C5 | Workspace Save/Restore | Save a named workspace (e.g. "payments-stack" = api + worker + frontend) and restore all sessions in one action. |
| C6 | Shell Companion     | Lightweight zsh/bash integration that reports structured session events to the app over a Unix domain socket. |

### Explicitly Out of Scope for v1

- Terminal emulation or rendering
- Parsing or recording terminal output
- Fish shell support (deferred to v2)
- Cloud sync, team features, or telemetry
- Support for terminal apps beyond iTerm2 and Terminal.app
- AI tool-specific integrations (e.g. reading Codex state)

---

## Architecture

SessionCtl has three layers: a shell companion that produces events, a native app that consumes and acts on them, and terminal adapters that bridge to specific terminal apps.

### Shell Companion

A small script sourced in the user's `.zshrc` or `.bashrc`. It hooks into shell lifecycle events and sends structured JSON messages to the app over a Unix domain socket at a well-known path (`~/.sessionctl/sock`).

**Events emitted:**

- **`directory_changed`** — fired on every `cd`. Includes resolved repo root, repo name (from `.git`), and current branch.
- **`command_start`** — fired via `preexec`. Includes the command string and a tool classification (`claude`, `codex`, `aider`, `git`, `npm`, `other`).
- **`command_end`** — fired via `precmd`. Includes exit status and duration.
- **`session_init`** — fired once when the shell starts. Registers the session with its TTY, PID, shell type, and initial directory.

Each message includes a stable `sessionId` derived from the TTY path, ensuring the app can correlate events across the session lifetime.

If the socket is unavailable (app not running), the companion silently no-ops. It must never block the shell prompt or produce visible errors.

### Desktop App (SwiftUI + AppKit)

The app runs as a menu bar agent (`LSUIElement = true`). It has no dock icon. Its primary interface is a popover triggered from the menu bar icon.

**Internal components:**

- **Socket Server** — Listens on the Unix domain socket. Parses incoming JSON events. Updates the session store.
- **Session Store** — In-memory model of all active sessions, backed by SQLite for workspace persistence. Sessions are pruned after a configurable staleness timeout (default: 5 minutes with no events).
- **Terminal Adapters** — Abstraction layer with one implementation per supported terminal app. Handles focus, launch, badge/title updates, and tab enumeration.
- **Workspace Manager** — Saves and restores named session groups. A workspace definition includes: name, list of sessions (each with repo path, startup command, terminal app preference, and tab/window preference).
- **Hotkey Manager** — Global keyboard shortcuts for toggling the popover, focusing sessions by repo, and cycling through sessions within a repo group.

### Terminal Adapters

#### iTerm2 Adapter (Primary)

iTerm2 is the first-class integration target because of its rich scripting surface:

- AppleScript API for creating tabs/windows, setting profiles, and focusing sessions.
- Shell integration protocol for tracking CWD and command history.
- Badge support via escape sequences for dynamic in-terminal labels.
- Session variables (`path`, `lastCommand`, `tty`) accessible from scripts.

The adapter uses AppleScript for launch and focus operations, and escape sequences for badge updates. Badge format: `{repo} | {tool} | {branch}`.

#### Terminal.app Adapter (Secondary)

Terminal.app is scriptable via AppleScript and supports window title customization. The adapter sets window titles to show repo and tool context. Terminal's Window Groups feature can be leveraged for workspace restore.

#### Accessibility Fallback

For edge cases where scripting is insufficient (e.g. focusing a specific tab in a non-scriptable terminal), the app can use the Accessibility API (`AXUIElement`). This requires explicit user permission and is only requested when needed.

---

## Session Modes

SessionCtl recognizes two types of sessions, and this distinction is central to the UX:

|                | Managed Sessions | Attached Sessions |
| -------------- | ---------------- | ----------------- |
| **Origin**     | Launched by SessionCtl | Pre-existing shell sessions |
| **Setup**      | Zero config — app knows everything at launch time | Requires shell companion installed in `.zshrc`/`.bashrc` |
| **Metadata**   | Complete from the start | Populates after first `cd` or command |
| **Labelling**  | Badge/title set immediately | Badge/title set once metadata arrives |
| **Best for**   | New work: "open payments-api in iTerm2" | Adopting SessionCtl into an existing workflow |

Managed sessions feel polished. Attached sessions make adoption frictionless. Both converge to the same experience once the shell companion is active.

---

## Data Model

### Session Object

| Field           | Type       | Description |
| --------------- | ---------- | ----------- |
| `sessionId`     | String     | Stable ID derived from TTY path (e.g. `/dev/ttys003`) |
| `tty`           | String     | TTY device path |
| `pid`           | Int        | Shell process ID |
| `shellType`     | Enum       | `zsh` \| `bash` |
| `repoRoot`      | String?    | Absolute path to repo root (from `.git` discovery) |
| `repoName`      | String?    | Directory name of repo root |
| `branch`        | String?    | Current git branch |
| `tool`          | Enum?      | `claude` \| `codex` \| `aider` \| `git` \| `npm` \| `other` \| `none` |
| `currentCommand`| String?    | Currently running command (if any) |
| `status`        | Enum       | `idle` \| `running` \| `exited` |
| `terminalApp`   | Enum       | `iterm2` \| `terminal` |
| `mode`          | Enum       | `managed` \| `attached` |
| `lastSeenAt`    | Timestamp  | Last event received from this session |

### Workspace Definition

| Field            | Type          | Description |
| ---------------- | ------------- | ----------- |
| `name`           | String        | Human-readable workspace name (e.g. "payments-stack") |
| `sessions`       | [SessionDef]  | Ordered list of session definitions |
| `createdAt`      | Timestamp     | When the workspace was saved |
| `lastRestoredAt` | Timestamp?    | When the workspace was last restored |

Each `SessionDef` within a workspace contains: `repoPath`, `startupCommand` (optional), `terminalApp` preference, and window/tab preference (new window vs. new tab).

---

## User Experience

### Menu Bar Popover

The primary interface. Triggered by clicking the menu bar icon or pressing a global hotkey.

**Layout:**

- Sessions grouped by repository, sorted by most recent activity.
- Each session row shows: repo name, branch, tool, status indicator (idle/running), and terminal app icon.
- Click a session to focus it instantly.
- Right-click for actions: close, move to workspace, copy path.
- Top bar: search/filter field, "+ New Session" button, workspace switcher.
- Bottom bar: workspace save button, settings gear.

### Keyboard Shortcuts

| Shortcut                      | Action |
| ----------------------------- | ------ |
| `Ctrl+Shift+S` (configurable) | Toggle popover |
| Arrow keys + Enter            | Navigate and focus a session |
| Type to filter                | Fuzzy search across repo names, branches, tools |
| `Cmd+N`                       | Launch new managed session |
| `Cmd+1–9`                     | Quick-focus session by position in list |

### Onboarding Flow

**First launch:**

1. **Step 1:** Welcome screen explains the app in one sentence.
2. **Step 2:** Auto-detect installed shell (zsh/bash). Show the one-liner to add to shell config:
   ```sh
   eval "$(sessionctl init zsh)"
   ```
3. **Step 3:** Verify companion is active (open a new terminal, check for `session_init` event).
4. **Step 4:** Detect terminal apps. Offer to enable iTerm2/Terminal.app integrations.
5. **Step 5:** Done. Show the popover with any detected sessions.

The entire flow should take under 60 seconds.

---

## Privacy & Security Model

- **Local-only:** No data leaves the machine. No network calls. No telemetry.
- **Metadata-only:** SessionCtl never reads terminal output, command arguments, or file contents. It only tracks: repo paths, branch names, tool names, session status.
- **Opt-in permissions:** Accessibility access is requested only when needed (non-scriptable terminal fallback). Automation entitlements are requested per terminal app.
- **Minimal persistence:** Session data is ephemeral (in-memory + pruned). Only workspace definitions are persisted to SQLite.
- **Open source:** Users can audit exactly what the shell companion sends and what the app stores.

---

## Technology Stack

| Component            | Technology |
| -------------------- | ---------- |
| App framework        | SwiftUI (views) + AppKit (menu bar, NSPopover, AppleScript bridging) |
| Language             | Swift 5.9+ |
| IPC                  | Unix domain socket (Foundation.Socket / NIO) |
| Persistence          | SQLite via GRDB (workspaces, preferences) |
| Terminal automation  | NSAppleScript / AppleScript via Process (iTerm2, Terminal.app) |
| Accessibility        | ApplicationServices.AXUIElement (fallback only) |
| Shell companion      | Pure sh/zsh/bash script, no dependencies |
| Build system         | Xcode / Swift Package Manager |
| Distribution         | GitHub releases + Homebrew cask |
| Min macOS            | macOS 14 (Sonoma) |

---

## Development Milestones

Rough sequencing for a solo developer. Estimates assume focused part-time effort.

| Phase | Deliverable                        | Key Outputs |
| ----- | ---------------------------------- | ----------- |
| M0    | Shell companion + socket server    | zsh/bash hooks, JSON protocol, Unix socket listener in Swift, basic event logging |
| M1    | Menu bar app + session dashboard   | NSPopover UI, live session list grouped by repo, click-to-focus via AppleScript |
| M2    | iTerm2 deep integration            | Badge updates, managed session launch, tab enumeration, focus-by-session |
| M3    | Terminal.app integration           | Title updates, managed launch, Window Group hooks |
| M4    | Workspace save/restore             | Save current layout, restore named workspaces, persistence in SQLite |
| M5    | Polish + open source launch        | Onboarding flow, hotkeys, Homebrew cask, README, MIT license, v1.0 tag |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Shell companion not installed | App has no session data | Clear onboarding, verification step, graceful empty state with setup prompt |
| iTerm2 AppleScript API changes | Badge/focus breaks | Pin to known-working API versions, test on iTerm2 betas, use escape sequences where possible |
| tmux/multiplexer nesting | One tab → many sessions | Shell companion reports per-pane (each pane is a shell). Document tmux as supported via companion, not via terminal adapter. |
| Accessibility permission friction | Users decline, fallback fails | Make accessibility optional. Core features work without it. Only prompt when user triggers a fallback action. |
| Socket reliability on sleep/wake | Stale sessions after wake | Heartbeat ping on wake. Prune sessions with no response. Companion re-registers on new prompt. |

---

## Success Criteria

v1 is successful if a developer with 6+ terminal sessions across 3 repos can:

- See all sessions grouped by repo within 2 seconds of opening the popover.
- Focus any session in one click or keystroke.
- Launch a new managed session in a chosen repo in under 3 seconds.
- Save their current workspace layout and fully restore it after a reboot.
- Install and onboard in under 60 seconds.

**North star metric:** Time from "I need to switch to the payments-api Codex session" to having that session focused and visible. Target: **under 2 seconds**.
