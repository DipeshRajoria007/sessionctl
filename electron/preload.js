/**
 * SessionCtl — Electron Preload Script
 *
 * Exposes a safe bridge between the renderer (web page) and the main process.
 * Uses contextBridge to avoid exposing Node.js APIs to the web content.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sessionctl', {
  // Get shell companion install path
  getShellPath: () => ipcRenderer.invoke('get-shell-path'),

  // Get app version
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Open URL in system browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Install shell companion to ~/.zshrc
  installShellCompanion: () => ipcRenderer.invoke('install-shell-companion'),

  // Listen for session count updates from main process
  onSessionCount: (callback) => {
    ipcRenderer.on('session-count', (_event, count) => callback(count));
  },

  // Platform info
  platform: process.platform,
  isElectron: true,
});
