// main.js
const { app, ipcMain } = require("electron");
const log = require("electron-log");
const { EventEmitter } = require("events");

const WindowManager = require("./WindowManager");
const UpdateManager = require("./UpdateManager");
const PluginManager = require("./PluginManager");

// Bridges (now return direct-call APIs)
const registerFileBridge = require("./bridges/fileBridge");
const registerDolphinBridge = require("./bridges/dolphinBridge");

const isDev = !app.isPackaged;

// -------------------- Environment --------------------
if (isDev) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
  app.commandLine.appendSwitch("enable-logging");
  app.commandLine.appendSwitch("vmodule", "webrtc/*=3");
  process.env.ELECTRON_ENABLE_LOGGING = "true";
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
  console.log("[dev] Running with multi-instance mode enabled");
} else {
  process.env.ELECTRON_ENABLE_LOGGING = "false";
  app.commandLine.appendSwitch("disable-logging");
}

app.setAppUserModelId("com.fkribs.saltshaker");

// -------------------- Globals --------------------
let windowManager;
let updateManager;
let pluginManager;

const pluginEvents = new EventEmitter();
let _pluginEventsWiredToRenderer = false;

// Direct-call bridge surfaces (returned from register*Bridge)
let fileBridge;
let dolphinBridge;

// -------------------- Helpers --------------------
function createMainWindow() {
  if (!windowManager) windowManager = new WindowManager();
  windowManager.createWindow();

  const wc = windowManager.getWebContents?.();
  if (wc && isDev) {
    try {
      wc.openDevTools({ mode: "detach" });
    } catch (err) {
      log.warn("[devtools]", err);
    }
  }
}

function setupManagers() {
  updateManager = updateManager || new UpdateManager();
  pluginManager = pluginManager || new PluginManager(windowManager, pluginEvents);

  // IMPORTANT: inject direct-call bridges into PluginManager so it no longer needs executeJavaScript hops
  if (typeof pluginManager.setHostBridges === "function") {
    pluginManager.setHostBridges({ fileBridge, dolphinBridge });
  }
}

/**
 * Relays main-process pluginEvents -> renderer IPC channels (for UI).
 * Keep this only for UI consumption (debug panels, etc.). Plugin sandbox no longer needs it.
 */
function wirePluginEventsToRenderer() {
  if (_pluginEventsWiredToRenderer) return;
  _pluginEventsWiredToRenderer = true;

  // Explicit allowlist: only UI-relevant events
  const channels = [
    "connect",
    "disconnect",
    "dolphin:Connected",
    "dolphin:Connecting",
    "dolphin:Disconnected",
    "dolphin:Error",
    "dolphin:GameStart",
    "dolphin:GameEnd"
  ];

  for (const ch of channels) {
    pluginEvents.on(ch, (...args) => {
      const wc = windowManager?.getWebContents?.();
      if (wc && !wc.isDestroyed()) {
        // Forward variadic args as a single payload (or adjust your preload to support spread if you prefer)
        // Here we forward a single arg if one, else an array for multiple.
        const payload = args.length <= 1 ? args[0] : args;
        wc.send(ch, payload);
      } else {
        log.warn(`[pluginEvents->renderer] Dropped '${ch}' event; renderer not ready`);
      }
    });
  }

  log.info(`[pluginEvents->renderer] Wired: ${channels.join(", ")}`);
}

// -------------------- IPC --------------------
function setupIpcMainListeners() {
  // ---------------- Plugin lifecycle ----------------
  ipcMain.on("load-plugin", (_event, { pluginId, pluginCode }) => {
    log.info(`Loading plugin: ${pluginId}`);
    pluginManager.loadAndRunPlugin(pluginId, pluginCode);
  });

  ipcMain.handle("install-plugin", async (_event, payload) => {
    log.info("[install-plugin]", payload.id);
    return pluginManager.installPlugin(payload);
  });

  ipcMain.handle("uninstall-plugin", async (_event, pluginId) => {
    log.info("[uninstall-plugin]", pluginId);
    return pluginManager.uninstallPlugin(pluginId);
  });

  ipcMain.handle("run-plugin", async (_event, pluginId) => {
    return pluginManager.runInstalledPlugin(pluginId);
  });

  ipcMain.handle("list-installed-plugins", async () => {
    return pluginManager.listInstalledPlugins();
  });
}

// -------------------- Bridges --------------------
function setupBridges() {
  // Plugin context provider used by file bridge authorization
  const getPluginContext = async (pluginId) =>
    await pluginManager?.getInstalledPluginContext?.(pluginId);

  // Register IPC handlers (optional) AND get direct-call APIs
  fileBridge = registerFileBridge({
    ipcMain,
    getPluginContext
  });

  dolphinBridge = registerDolphinBridge({
    ipcMain,
    pluginEvents
  });
}

// -------------------- Guards --------------------
function setupProcessGuards() {
  process.on("uncaughtException", (err) => {
    log.error("[uncaughtException]", err);
  });

  process.on("unhandledRejection", (reason) => {
    log.error("[unhandledRejection]", reason);
  });

  app.on("render-process-gone", (_e, details) => {
    log.error("[RendererGone]", details);
  });

  app.on("child-process-gone", (_e, details) => {
    log.error("[ChildGone]", details);
  });
}

// -------------------- App lifecycle --------------------
app.whenReady().then(() => {
  setupProcessGuards();

  // 1) Create window
  createMainWindow();

  // 2) Wire plugin bus -> renderer (UI only)
  wirePluginEventsToRenderer();

  // 3) Setup managers early, then bridges (bridges depend on pluginManager for getPluginContext)
  setupManagers();
  setupBridges();

  // 4) Now that bridges exist, inject them into pluginManager (again) in case setupManagers ran first
  if (typeof pluginManager.setHostBridges === "function") {
    pluginManager.setHostBridges({ fileBridge, dolphinBridge });
  }

  // 5) IPC
  setupIpcMainListeners();

  try {
    updateManager.checkForUpdates();
  } catch (err) {
    log.warn("[update] checkForUpdates failed:", err?.message || err);
  }
});

app.on("activate", () => {
  if (!windowManager?.window) {
    createMainWindow();
    wirePluginEventsToRenderer();
    setupManagers();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  // Optional: dispose active plugins on quit
  try {
    if (pluginManager?.activePlugins?.size) {
      for (const [id, active] of pluginManager.activePlugins.entries()) {
        try {
          await active?.onDispose?.();
        } catch (e) {
          log.warn(`[before-quit] plugin dispose failed: ${id}`, e);
        }
      }
    }
  } catch (e) {
    log.warn("[before-quit] disposal loop failed", e);
  }
});
