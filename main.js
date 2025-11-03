// main.js
const { app, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');

const WindowManager = require('./WindowManager');
const UpdateManager = require('./UpdateManager');
const PluginManager = require('./PluginManager');
const { EventEmitter } = require('events');

const isDev = !app.isPackaged;

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222'); // attach VS Code "Renderer"
  app.commandLine.appendSwitch('enable-logging');
  app.commandLine.appendSwitch('vmodule', 'webrtc/*=3');
  process.env.ELECTRON_ENABLE_LOGGING = 'true';
} else {
  // Hide any unwanted console window for packaged builds
  process.env.ELECTRON_ENABLE_LOGGING = 'false';
  app.commandLine.appendSwitch('disable-logging');
}
// Optional: set AppUserModelID on Windows (helps with notifications/updates)
app.setAppUserModelId('com.fkribs.saltshaker');

// -------------------- Globals --------------------
let windowManager;
let updateManager;
let pluginManager;
const pluginEvents = new EventEmitter(); // reserved if you later want to share globally

// -------------------- Helpers --------------------
function createMainWindow() {
  if (!windowManager) windowManager = new WindowManager();
  windowManager.createWindow();

  // Auto-open DevTools in development
  const wc = windowManager.getWebContents?.();
  const isDev = !app.isPackaged; // built-in replacement for electron-is-dev

  if (wc && isDev) {
    try {
      wc.openDevTools({ mode: 'detach' });
    } catch (err) {
      log.warn('[devtools]', err);
    }
  }
}

function setupManagers() {
  updateManager = updateManager || new UpdateManager();

  const wc = windowManager.getWebContents?.();
  if (!wc) {
    app.once('browser-window-created', () => {
      pluginManager = new PluginManager(windowManager);
    });
  } else {
    pluginManager = new PluginManager(windowManager);
  }
}

function setupIpcMainListeners() {
  // Noisy IPC logging (handy while iterating)
  const _on = ipcMain.on.bind(ipcMain);
  ipcMain.on = (channel, listener) => {
    _on(channel, (event, ...args) => {
      log.info('[ipcMain]', channel, ...args);
      listener(event, ...args);
    });
  };

  ipcMain.on('load-plugin', (event, { pluginId, pluginCode }) => {
    log.info(`Loading plugin: ${pluginId}`);
    try {
      pluginManager.loadAndRunPlugin(pluginId, pluginCode);
    } catch (err) {
      log.error(`Failed to load plugin ${pluginId}:`, err);
    }
  });
}

function setupProcessGuards() {
  process.on('uncaughtException', (err) => {
    log.error('[uncaughtException]', err);
  });
  process.on('unhandledRejection', (reason) => {
    log.error('[unhandledRejection]', reason);
  });

  app.on('render-process-gone', (_e, details) => {
    log.error('[RendererGone]', details);
  });
  app.on('child-process-gone', (_e, details) => {
    log.error('[ChildGone]', details);
  });
}

// -------------------- App lifecycle --------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window if user tries to open another instance
    const win = windowManager?.window;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    setupProcessGuards();
    createMainWindow();
    setupManagers();
    setupIpcMainListeners();
    try {
      updateManager.checkForUpdates(); // safe to no-op if updater isn’t fully configured yet
    } catch (err) {
      log.warn('[update] checkForUpdates failed:', err?.message || err);
    }
  });

  app.on('activate', () => {
    if (!windowManager?.window) {
      createMainWindow();
      setupManagers();
    }
  });

  app.on('window-all-closed', () => {
    // On macOS keep app alive until Cmd+Q; on Windows/Linux quit.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    // place for explicit cleanup if needed in future (e.g., pluginManager.dispose())
  });
}
