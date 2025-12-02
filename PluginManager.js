// PluginManager.js
const fs = require("fs/promises");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");
const tar = require("tar");
const log = require("electron-log");
const { app } = require("electron");

class PluginManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.webContents = null;

    this.pluginEvents = new EventEmitter();
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
    // Most common entry names
    const candidates = ["plugin.js", "index.js", "main.js"];

    for (const name of candidates) {
      const full = path.join(distPath, name);
      try {
        await fs.access(full);
        return name;
      } catch (_) { }
    }

    // Next, pick the first JS file
    const files = await fs.readdir(distPath);
    const js = files.find(f => f.endsWith(".js"));
    if (js) return js;

    throw new Error(`No JS entrypoint found inside ${distPath}`);
  }

  // -------------------------------------------
  // Installation
  // -------------------------------------------
  async installPlugin({ id, name, version, sha256, bytes }) {
    await this.ensurePluginDir();

    const safeId = this.sanitizeId(id);
    const pluginFolder = path.join(this.pluginsDir, safeId);
    await fs.mkdir(pluginFolder, { recursive: true });

    const artifactPath = path.join(pluginFolder, "artifact.tgz");
    await fs.writeFile(artifactPath, Buffer.from(bytes));

    // We want pluginFolder/dist/index.js
    const distPath = path.join(pluginFolder, "dist");
    await fs.mkdir(distPath, { recursive: true });

    // Your .tgz currently has: package/dist/index.js
    // So: cwd = pluginFolder, strip = 1  => dist/index.js
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

    log.info(`Plugin ${id} installed at ${pluginFolder}`);
    this.getWebContents()?.send("plugins:installed", metadata);
    return { ok: true, path: pluginFolder };
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
  // Run installed plugins (UI "Run" button)
  // -------------------------------------------
  async runInstalledPlugin(pluginId) {
    debugger;
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

  // -------------------------------------------
  // Sandbox Execution
  // -------------------------------------------
  loadAndRunPlugin(pluginId, pluginCode, metadata = null) {
    log.info(`Activating plugin: ${pluginId}`);

    if (!metadata) {
      metadata = { id: pluginId, name: pluginId };
    }

    // ensure debuggability
    if (!/\/\/#\s*sourceURL=/.test(pluginCode)) {
      pluginCode += `\n//# sourceURL=${pluginId}.js\n`;
    }

    // Safe API exposed to plugin
    const sandboxApi = {
      log: (...args) => log.info(`[plugin:${pluginId}]`, ...args),
      sendEvent: (event, payload) => this.emitPluginEvent(event, payload),

      // Bridge to host APIs (permission-gated)
      host: {
        async get(resourceId) {
          // Verify plugin has the permission (resource:slippi:user.read)
          if (resourceId === "slippi:user") {
            return await hostApi.getSlippiUser(); // safe host method
          }
          throw new Error(`Access denied to ${resourceId}`);
        },
        async invoke(method, args) {
          if (method === "dolphin.subscribe") {
            return await hostApi.subscribeToDolphin(args);
          }
          throw new Error(`Unknown method: ${method}`);
        },
      },
    };


    const context = {
      exports: {},
      module: { exports: {} },
      plugin: metadata,
      api: sandboxApi
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

  // -------------------------------------------
  // Event forwarding to renderer
  // -------------------------------------------
  emitPluginEvent(event, payload) {
    const wc = this.getWebContents();
    if (!wc) return;

    log.info(`[plugin->renderer] ${event}`, payload);
    wc.send(event, payload);
  }
}

module.exports = PluginManager;
