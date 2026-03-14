# SessionCtl

**Mission Control for AI Terminal Sessions**

A native macOS menu bar app that discovers, labels, groups, and focuses your terminal sessions by repository. Built for developers running multiple AI coding sessions (Claude Code, Codex, aider) who lose context switching between unlabelled terminal windows.

## Install & Build (one command)

```bash
cd sessionctl
./build.sh
```

This installs dependencies, compiles the server, and packages a `SessionCtl.app` you can drag to `/Applications`.

**Prerequisites:** Node.js 18+ (`brew install node`)

## How It Works

```
┌─────────────────────┐     ┌───────────────────────────────────┐
│  Shell Companion    │────▶│  SessionCtl.app (Electron)        │
│  (zsh/bash hooks)   │     │                                   │
│                     │     │  ┌─────────────┐  ┌────────────┐ │
│  Events:            │     │  │ Express     │  │ Menu Bar   │ │
│  • session_init     │     │  │ Server      │  │ Popover    │ │
│  • directory_changed│     │  │ + WebSocket │  │ (Dashboard)│ │
│  • command_start    │     │  └─────────────┘  └────────────┘ │
│  • command_end      │     │                                   │
│  • session_exit     │     │  Unix Socket + iTerm2/Terminal.app│
└─────────────────────┘     └───────────────────────────────────┘
```

The app runs as a **menu bar agent** (no dock icon). Click the **S** icon or press **Ctrl+Shift+S** to open the dashboard popover. Right-click the icon for quick actions.

## After Installing

Add the shell companion to your `~/.zshrc` (or `~/.bashrc`):

```bash
source "/Applications/SessionCtl.app/Contents/Resources/shell/sessionctl.sh"
```

Or if running from the project directory:

```bash
source "/path/to/sessionctl/shell/sessionctl.sh"
```

Then open a new terminal — sessions will appear automatically in the dashboard.

## Features

**Session Discovery & Grouping** — Sessions are auto-detected and grouped by repository with real-time status (branch, tool, commands).

**Managed Launch** — Launch new terminal sessions from the dashboard, pre-configured with a target repo and startup command.

**Workspace Save/Restore** — Save your session layout as a named workspace and restore everything after a reboot.

**Terminal Integration** — Native iTerm2 badge updates and Terminal.app title management via AppleScript.

**Real-time Updates** — Dashboard updates instantly via WebSocket as you work.

**Keyboard Shortcuts** — Ctrl+Shift+S (toggle), Cmd+N (new session), Cmd+1-9 (quick focus), type to filter.

## Development

```bash
# Run in dev mode (builds + launches Electron)
npm run dev

# Run tests (30 tests)
npm test

# Build .dmg installer
npm run package:dmg

# Start server standalone (for testing without Electron)
cd server && node dist/index.js
```

## Project Structure

```
sessionctl/
├── electron/
│   ├── main.js              # Electron main process (tray, popover, embedded server)
│   └── preload.js           # IPC bridge
├── server/
│   ├── src/                 # TypeScript server source
│   │   ├── socket-server.ts     # Unix domain socket listener
│   │   ├── websocket-server.ts  # Real-time WebSocket
│   │   ├── models/              # Session store, workspace manager, types
│   │   ├── routes/              # REST API
│   │   ├── adapters/            # iTerm2 & Terminal.app AppleScript
│   │   └── middleware/          # Security (rate limiting, localhost check)
│   ├── public/index.html   # Dashboard SPA
│   └── dist/               # Compiled JS
├── shell/
│   ├── sessionctl.sh        # Shell companion (zsh/bash hooks)
│   └── sessionctl-init.sh   # CLI helper
├── assets/                  # App icons
├── tests/run-tests.js       # Test suite
├── build.sh                 # One-command build script
└── package.json             # Electron + electron-builder config
```

## Security

Local-only (127.0.0.1), metadata-only (no terminal output), input validated (Zod), rate limited, command injection protected, no telemetry.

## License

MIT
