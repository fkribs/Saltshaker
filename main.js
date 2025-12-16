// main.js
const { app, ipcMain } = require('electron');
const path = require('path');
const log = require('electron-log');

const WindowManager = require('./WindowManager');
const UpdateManager = require('./UpdateManager');
const PluginManager = require('./PluginManager');
const { EventEmitter } = require('events');

// Bridges
const registerFileBridge = require('./bridges/fileBridge');
const registerDolphinBridge = require('./bridges/dolphinBridge');

const isDev = !app.isPackaged;

// -------------------- Environment --------------------
if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
  app.commandLine.appendSwitch('enable-logging');
  app.commandLine.appendSwitch('vmodule', 'webrtc/*=3');
  process.env.ELECTRON_ENABLE_LOGGING = 'true';
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  console.log('[dev] Running with multi-instance mode enabled');
} else {
  process.env.ELECTRON_ENABLE_LOGGING = 'false';
  app.commandLine.appendSwitch('disable-logging');
}

app.setAppUserModelId('com.fkribs.saltshaker');

// -------------------- Globals --------------------
let windowManager;
let updateManager;
let pluginManager;
const pluginEvents = new EventEmitter();

// -------------------- Helpers --------------------
function createMainWindow() {
  if (!windowManager) windowManager = new WindowManager();
  windowManager.createWindow();

  const wc = windowManager.getWebContents?.();
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

// -------------------- IPC --------------------
function setupIpcMainListeners() {
  // ---------------- Plugin lifecycle ----------------
  ipcMain.on('load-plugin', (_event, { pluginId, pluginCode }) => {
    log.info(`Loading plugin: ${pluginId}`);
    pluginManager.loadAndRunPlugin(pluginId, pluginCode);
  });

  ipcMain.handle('install-plugin', async (_event, payload) => {
    log.info('[install-plugin]', payload.id);
    return pluginManager.installPlugin(payload);
  });

  ipcMain.handle('run-plugin', async (_event, pluginId) => {
    return pluginManager.runInstalledPlugin(pluginId);
  });

  ipcMain.handle('list-installed-plugins', async () => {
    return pluginManager.listInstalledPlugins();
  });

  // ---------------- Bridges ----------------
  const getPluginContext = (pluginId) =>
    pluginManager?.getInstalledPluginContext?.(pluginId);

  registerFileBridge({
    ipcMain,
    getPluginContext
  });

  registerDolphinBridge({
    ipcMain,
    pluginEvents
  });
}

// -------------------- Guards --------------------
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
app.whenReady().then(() => {
  setupProcessGuards();
  createMainWindow();
  setupManagers();
  setupIpcMainListeners();

  try {
    updateManager.checkForUpdates();
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
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Cleanup hook
});
