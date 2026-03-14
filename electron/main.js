/**
 * SessionCtl — Electron Main Process
 *
 * Runs as a macOS menu bar (tray) app with no dock icon.
 * Embeds the Express + WebSocket server and shows a popover window.
 */

const {
  app,
  BrowserWindow,
  Tray,
  nativeImage,
  screen,
  globalShortcut,
  ipcMain,
  shell,
  Menu,
  dialog,
  nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Config ────────────────────────────────────────────────────────────────

const HTTP_PORT = 9340;
const POPOVER_WIDTH = 420;
const POPOVER_HEIGHT = 640;

// ─── State ─────────────────────────────────────────────────────────────────

let tray = null;
let popoverWindow = null;
let server = null;
let sessionStore = null;
let workspaceManager = null;

// ─── Resolve paths ─────────────────────────────────────────────────────────
//
// Key insight for packaged Electron apps:
//
//   __dirname  →  inside app.asar (Electron patches fs/require to read it)
//   asarUnpack →  extracted to  <resourcesPath>/app.asar.unpacked/...
//   extraResources → extracted to  <resourcesPath>/...
//
// We use __dirname-relative paths for code (dist/) that lives in the asar,
// and the .unpacked path for node_modules + public/ that were asarUnpacked.
// Shell scripts use extraResources so they're real files on disk.
// ────────────────────────────────────────────────────────────────────────────

/** Root of the server directory (inside asar for dist/, unpacked for node_modules) */
function getServerDistDir() {
  // dist/ is inside the asar — __dirname-relative paths work via Electron's asar patch
  return path.join(__dirname, '..', 'server', 'dist');
}

/** node_modules are asarUnpacked — they live on the real filesystem */
function getServerNodeModules() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules');
  }
  return path.join(__dirname, '..', 'server', 'node_modules');
}

/** public/ is asarUnpacked so express.static can serve real files */
function getServerPublicDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'public');
  }
  return path.join(__dirname, '..', 'server', 'public');
}

/** Shell scripts are in extraResources — real files the user can source */
function getShellPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'shell');
  }
  return path.join(__dirname, '..', 'shell');
}

/** Assets (icons) are inside the asar */
function getAssetPath(asset) {
  return path.join(__dirname, '..', 'assets', asset);
}

// ─── Embedded Server ───────────────────────────────────────────────────────

function startEmbeddedServer() {
  const distDir = getServerDistDir();
  const nodeModulesDir = getServerNodeModules();
  const publicDir = getServerPublicDir();

  // Debug: log resolved paths so we can diagnose issues
  console.log('SessionCtl paths:');
  console.log('  distDir:', distDir);
  console.log('  nodeModules:', nodeModulesDir);
  console.log('  publicDir:', publicDir);
  console.log('  isPackaged:', app.isPackaged);

  // Check if the server is built
  const indexPath = path.join(distDir, 'index.js');
  if (!fs.existsSync(indexPath)) {
    console.error('Server not built — cannot find:', indexPath);
    dialog.showErrorBox(
      'SessionCtl Error',
      `Server not built.\n\nLooked for: ${indexPath}\n\nPlease run "npm run build" in the project directory.`
    );
    app.quit();
    return;
  }

  // Set up module resolution: when server dist/ code requires a package,
  // redirect to the (unpacked) server/node_modules directory
  const Module = require('module');
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function (request, parent, isMain, options) {
    // Only intercept requires from our server dist/ code
    if (parent && parent.filename && parent.filename.includes('server')) {
      // Don't intercept relative requires or built-in modules
      if (!request.startsWith('.') && !request.startsWith('/')) {
        try {
          // Try server/node_modules first
          const pkgName = request.startsWith('@')
            ? request.split('/').slice(0, 2).join('/')
            : request.split('/')[0];
          const serverPkgPath = path.join(nodeModulesDir, pkgName);
          if (fs.existsSync(serverPkgPath)) {
            const fullPath = path.join(nodeModulesDir, request);
            return originalResolveFilename.call(this, fullPath, parent, isMain, options);
          }
        } catch (e) {
          // Fall through to default resolution
        }
      }
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };

  // Start the server
  try {
    // Load server modules from dist/ (inside asar — Electron handles this)
    const { SessionStore } = require(path.join(distDir, 'models', 'session-store'));
    const { WorkspaceManager } = require(path.join(distDir, 'models', 'workspace-manager'));
    const { SocketServer } = require(path.join(distDir, 'socket-server'));
    const { RealtimeServer } = require(path.join(distDir, 'websocket-server'));
    const { TerminalAdapterRegistry } = require(path.join(distDir, 'adapters', 'terminal-adapter'));
    const { createApiRouter } = require(path.join(distDir, 'routes', 'api'));
    const {
      localhostOnly,
      apiRateLimiter,
      errorHandler,
      JSON_BODY_LIMIT,
    } = require(path.join(distDir, 'middleware', 'security'));

    // Load npm packages from the unpacked node_modules
    const express = require(path.join(nodeModulesDir, 'express'));
    const cors = require(path.join(nodeModulesDir, 'cors'));
    const helmet = require(path.join(nodeModulesDir, 'helmet'));
    const http = require('http');

    // Initialize components
    sessionStore = new SessionStore();
    workspaceManager = new WorkspaceManager();
    const adapterRegistry = new TerminalAdapterRegistry();
    const socketServer = new SocketServer(sessionStore);
    const realtimeServer = new RealtimeServer(sessionStore);

    // Express app
    const expressApp = express();
    expressApp.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
    expressApp.use(localhostOnly);
    expressApp.use(apiRateLimiter);
    expressApp.use(cors({
      origin: [`http://127.0.0.1:${HTTP_PORT}`, `http://localhost:${HTTP_PORT}`],
      credentials: false,
    }));
    expressApp.use(express.json({ limit: JSON_BODY_LIMIT }));

    // API routes
    expressApp.use('/api', createApiRouter(sessionStore, workspaceManager, adapterRegistry));

    // Static files — must serve from the UNPACKED directory (real filesystem)
    expressApp.use(express.static(publicDir));
    expressApp.use((_req, res) => {
      res.sendFile('index.html', { root: publicDir });
    });
    expressApp.use(errorHandler);

    // HTTP + WebSocket server
    server = http.createServer(expressApp);
    realtimeServer.attach(server);

    server.listen(HTTP_PORT, '127.0.0.1', () => {
      console.log(`SessionCtl server running on http://127.0.0.1:${HTTP_PORT}`);
    });

    // Unix socket server (for shell companion)
    socketServer.start().then(() => {
      console.log(`Unix socket: ${socketServer.path}`);
    }).catch((err) => {
      console.log(`Socket: ${err.message} (shell companion will retry)`);
    });

    // Session pruning
    sessionStore.start();

    // IPC: expose session count to renderer for tray badge
    setInterval(() => {
      if (popoverWindow && !popoverWindow.isDestroyed()) {
        const sessions = sessionStore.getAllSessions().filter(s => s.status !== 'exited');
        popoverWindow.webContents.send('session-count', sessions.length);
      }
    }, 2000);

    console.log('Embedded server started successfully');
  } catch (err) {
    console.error('Failed to start embedded server:', err);
    dialog.showErrorBox(
      'SessionCtl Error',
      `Failed to start server:\n\n${err.message}\n\nRun "cd server && npm install && npx tsc" then try again.`
    );
    app.quit();
  }
}

// ─── Tray & Popover ────────────────────────────────────────────────────────

function createTray() {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip('SessionCtl — Mission Control for AI Terminal Sessions');

  tray.on('click', (event, bounds) => {
    togglePopover(bounds);
  });

  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show SessionCtl',
        click: () => {
          if (tray) togglePopover(tray.getBounds());
        },
      },
      { type: 'separator' },
      {
        label: 'Shell Setup…',
        click: () => {
          const shellPath = getShellPath();
          const sourceCmd = `source "${path.join(shellPath, 'sessionctl.sh')}"`;
          dialog.showMessageBox({
            type: 'info',
            title: 'Shell Companion Setup',
            message: 'Install the shell companion',
            detail: `Add this to your ~/.zshrc or ~/.bashrc:\n\n${sourceCmd}`,
            buttons: ['Copy Command', 'OK'],
          }).then((result) => {
            if (result.response === 0) {
              const { clipboard } = require('electron');
              clipboard.writeText(sourceCmd);
            }
          });
        },
      },
      {
        label: 'Open in Browser',
        click: () => {
          shell.openExternal(`http://127.0.0.1:${HTTP_PORT}`);
        },
      },
      { type: 'separator' },
      {
        label: `SessionCtl v1.0.0`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Quit SessionCtl',
        accelerator: 'CommandOrControl+Q',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray.popUpContextMenu(contextMenu);
  });
}

function createTrayIcon() {
  // Try loading a proper template icon file first
  const iconPath = getAssetPath('trayTemplate.png');
  const icon2xPath = getAssetPath('trayTemplate@2x.png');

  if (fs.existsSync(iconPath)) {
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
    return icon;
  }

  // Fallback: create SVG-based icon
  const size = 22;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <text x="11" y="16" text-anchor="middle" font-family="SF Pro Display, Helvetica Neue, sans-serif"
          font-size="16" font-weight="700" fill="black">S</text>
  </svg>`;

  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );
  icon.setTemplateImage(true);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function createPopoverWindow() {
  popoverWindow = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: false,
    hasShadow: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#1a1b26',
    vibrancy: 'menu',
    visualEffectState: 'active',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  popoverWindow.loadURL(`http://127.0.0.1:${HTTP_PORT}`);

  // Hide when focus is lost
  popoverWindow.on('blur', () => {
    if (popoverWindow && popoverWindow.isVisible()) {
      popoverWindow.hide();
    }
  });

  // Prevent actual close — just hide
  popoverWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      popoverWindow.hide();
    }
  });
}

function togglePopover(trayBounds) {
  if (!popoverWindow) {
    createPopoverWindow();
  }

  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }

  // Position the window below the tray icon (macOS style)
  const windowBounds = popoverWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);

  popoverWindow.setPosition(x, y, false);
  popoverWindow.show();
  popoverWindow.focus();
}

// ─── Global Shortcuts ──────────────────────────────────────────────────────

function registerShortcuts() {
  globalShortcut.register('Control+Shift+S', () => {
    if (tray) {
      togglePopover(tray.getBounds());
    }
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.handle('get-shell-path', () => {
    return getShellPath();
  });

  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('open-external', (_, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('install-shell-companion', async () => {
    const shellPath = getShellPath();
    const shellRcPath = path.join(require('os').homedir(), '.zshrc');
    const sourceLine = `\n# SessionCtl shell companion\nsource "${path.join(shellPath, 'sessionctl.sh')}"\n`;

    try {
      let existing = '';
      try { existing = fs.readFileSync(shellRcPath, 'utf-8'); } catch {}
      if (existing.includes('sessionctl.sh')) {
        return { success: true, message: 'Already installed' };
      }
      fs.appendFileSync(shellRcPath, sourceLine);
      return { success: true, message: 'Added to ~/.zshrc' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────

// Hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock.hide();
}

app.whenReady().then(() => {
  startEmbeddedServer();
  createTray();
  registerShortcuts();
  setupIPC();

  console.log('SessionCtl is running in the menu bar');
  console.log('Click the "S" icon or press Ctrl+Shift+S to open');
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (server) {
    server.close();
  }
});

// Keep tray app running even when all windows are closed
app.on('window-all-closed', () => {});
