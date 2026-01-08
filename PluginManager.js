// PluginManager.js
const fs = require("fs/promises");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");
const tar = require("tar");
const log = require("electron-log");
const { app } = require("electron");

class PluginManager {
  constructor(windowManager, pluginEvents) {
    this.installedPluginContexts = new Map();
    this.windowManager = windowManager;
    this.webContents = null;

    // Use the shared bus if provided
    this.pluginEvents = pluginEvents || new EventEmitter();

    this.activePlugins = new Map();
    this.pluginsDir = path.join(app.getPath("userData"), "plugins");
  }

  // -------------------------------------------
  // Helpers
  // -------------------------------------------
  getWebContents() {
    if (!this.webContents) {
      this.webContents = this.windowManager?.getWebContents?.();
    }
    return this.webContents;
  }

  async ensurePluginDir() {
    await fs.mkdir(this.pluginsDir, { recursive: true });
  }

  sanitizeId(id) {
    return id.replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  async findPluginEntry(distPath) {
    const candidates = ["plugin.js", "index.js", "main.js"];
    for (const name of candidates) {
      const full = path.join(distPath, name);
      try { await fs.access(full); return name; } catch (_) { }
    }

    const files = await fs.readdir(distPath);
    const js = files.find(f => f.endsWith(".js"));
    if (js) return js;

    throw new Error(`No JS entrypoint found inside ${distPath}`);
  }

  async hydrateInstalledPluginContexts() {
    if (this._contextsHydrated) return;
    this._contextsHydrated = true;

    await this.ensurePluginDir();
    let dirs = [];
    try {
      dirs = await fs.readdir(this.pluginsDir);
    } catch {
      return;
    }

    for (const d of dirs) {
      const pluginFolder = path.join(this.pluginsDir, d);
      const contextPath = path.join(pluginFolder, "context.json");

      try {
        const ctx = JSON.parse(await fs.readFile(contextPath, "utf8"));
        if (ctx?.id) {
          this.installedPluginContexts.set(ctx.id, ctx);
        }
      } catch {
        // ignore missing/invalid context.json
      }
    }
  }

  async readPluginContextFromDisk(pluginId) {
    const safeId = this.sanitizeId(pluginId);
    const pluginFolder = path.join(this.pluginsDir, safeId);
    const contextPath = path.join(pluginFolder, "context.json");
    const ctx = JSON.parse(await fs.readFile(contextPath, "utf8"));
    return ctx;
  }

  // -------------------------------------------
  // Installation
  // -------------------------------------------
  async installPlugin({ id, name, version, sha256, bytes, permissions = [], resources = [] }) {
    await this.ensurePluginDir();

    const safeId = this.sanitizeId(id);
    const pluginFolder = path.join(this.pluginsDir, safeId);
    await fs.mkdir(pluginFolder, { recursive: true });

    const artifactPath = path.join(pluginFolder, "artifact.tgz");
    await fs.writeFile(artifactPath, Buffer.from(bytes));

    const distPath = path.join(pluginFolder, "dist");
    await fs.mkdir(distPath, { recursive: true });

    await tar.x({
      file: artifactPath,
      cwd: pluginFolder,
      strict: true,
      strip: 1
    });

    const entry = await this.findPluginEntry(distPath);

    const metadata = {
      id,
      name,
      version,
      sha256,
      installedAt: new Date().toISOString(),
      entry
    };

    await fs.writeFile(
      path.join(pluginFolder, "metadata.json"),
      JSON.stringify(metadata, null, 2)
    );

    const context = {
      id,
      permissions,
      resources: Object.fromEntries(resources.map(r => [r.id, r]))
    };

    await fs.writeFile(
      path.join(pluginFolder, "context.json"),
      JSON.stringify(context, null, 2)
    );

    // keep in-memory map hot for current session
    this.installedPluginContexts.set(id, context);

    log.info(`Plugin ${id} installed at ${pluginFolder}`);

    // IMPORTANT: match preload listener (see section 4)
    this.getWebContents()?.send("plugins-installed", metadata);

    return { ok: true, path: pluginFolder };
  }

  async getInstalledPluginContext(pluginId) {
    // Ensure contexts loaded after restart
    await this.hydrateInstalledPluginContexts();

    // If still missing, attempt direct disk read (covers edge cases)
    if (!this.installedPluginContexts.has(pluginId)) {
      try {
        const ctx = await this.readPluginContextFromDisk(pluginId);
        this.installedPluginContexts.set(pluginId, ctx);
      } catch { }
    }

    return this.installedPluginContexts.get(pluginId);
  }

  // -------------------------------------------
  // Listing installed plugins
  // -------------------------------------------
  async listInstalledPlugins() {
    await this.ensurePluginDir();

    const dirs = await fs.readdir(this.pluginsDir);
    const plugins = [];

    for (const d of dirs) {
      const metaPath = path.join(this.pluginsDir, d, "metadata.json");
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
        plugins.push(meta);
      } catch {
        // ignore partial/invalid plugin folders
      }
    }

    return plugins;
  }

  // -------------------------------------------
  // Uninstall
  // -------------------------------------------
  async uninstallPlugin(pluginId) {
    await this.ensurePluginDir();

    // dispose if active
    const active = this.activePlugins.get(pluginId);
    if (active && typeof active.onDispose === "function") {
      try { await active.onDispose(); } catch (e) {
        log.warn(`Plugin ${pluginId} onDispose failed`, e);
      }
    }
    this.activePlugins.delete(pluginId);

    // remove on-disk folder
    const safeId = this.sanitizeId(pluginId);
    const pluginFolder = path.join(this.pluginsDir, safeId);

    await fs.rm(pluginFolder, { recursive: true, force: true });

    // remove in-memory context
    this.installedPluginContexts.delete(pluginId);

    log.info(`Plugin ${pluginId} uninstalled`);

    this.getWebContents()?.send("plugins-uninstalled", { id: pluginId });

    return { ok: true };
  }

  // -------------------------------------------
  // Run installed plugins
  // -------------------------------------------
  async runInstalledPlugin(pluginId) {
    const safeId = this.sanitizeId(pluginId);
    const pluginFolder = path.join(this.pluginsDir, safeId);
    const metadataPath = path.join(pluginFolder, "metadata.json");

    let metadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    } catch {
      throw new Error(`Plugin ${pluginId} is not installed.`);
    }

    const entryPath = path.join(pluginFolder, "dist", metadata.entry);
    const code = await fs.readFile(entryPath, "utf8");

    return this.loadAndRunPlugin(pluginId, code, metadata);
  }

  // ... loadAndRunPlugin unchanged ...
  // -------------------------------------------
  // Sandbox Execution
  // -------------------------------------------
  loadAndRunPlugin(pluginId, pluginCode, metadata = null) {
    log.info(`Activating plugin: ${pluginId}`);

    if (!metadata) {
      metadata = { id: pluginId, name: pluginId };
    }

    // Ensure debuggability in DevTools
    if (!/\/\/#\s*sourceURL=/.test(pluginCode)) {
      pluginCode += `\n//# sourceURL=${pluginId}.js\n`;
    }

    const wc = this.getWebContents();
    if (!wc) {
      throw new Error("Renderer not ready");
    }

    // ----------------------------
    // Safe API exposed to plugin
    // ----------------------------
    const sandboxApi = {
      log: (...args) => log.info(`[plugin:${pluginId}]`, ...args),

      sendEvent: (event, payload) => {
        this.pluginEvents.emit(event, payload);
      },

      on: (event, handler) => {
        const listener = (payload) => handler(payload);
        this.pluginEvents.on(event, listener);
        return () => this.pluginEvents.off(event, listener);
      },
      host: {
        file: {
          readText: (resourceId) =>
            wc.executeJavaScript(
              `window.salt.host.file.readText(${JSON.stringify(resourceId)}, ${JSON.stringify(pluginId)})`
            ),

          readJson: (resourceId) =>
            wc.executeJavaScript(
              `window.salt.host.file.readJson(${JSON.stringify(resourceId)}, ${JSON.stringify(pluginId)})`
            )
        },

        dolphin: {
          subscribe: (options) =>
            wc.executeJavaScript(
              `window.salt.host.dolphin.subscribe(${JSON.stringify(pluginId)}, ${JSON.stringify(options)})`
            )
        }
      }
    };

    // ----------------------------
    // VM sandbox
    // ----------------------------
    const context = {
      module: { exports: {} },
      exports: {},
      api: sandboxApi,
      plugin: metadata
    };

    context.global = context;

    const vmContext = vm.createContext(context);

    const script = new vm.Script(pluginCode, {
      filename: `${pluginId}.js`,
      displayErrors: true
    });

    try {
      script.runInContext(vmContext, { displayErrors: true });

      const pluginExport = context.module.exports;
      if (pluginExport && typeof pluginExport.onInit === "function") {
        this.activePlugins.set(pluginId, pluginExport);
        pluginExport.onInit(sandboxApi);
      }

      log.info(`Plugin ${pluginId} activated`);
    } catch (err) {
      log.error(`Plugin ${pluginId} failed to activate`, err);
    }
  }
}

module.exports = PluginManager;
