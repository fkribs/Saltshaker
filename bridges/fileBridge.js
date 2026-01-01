// bridges/fileBridge.js
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

/**
 * Resolve a manifest-declared resource path safely.
 */
function resolveResourcePath(resource) {
  if (!resource?.path) throw new Error("Resource missing path");

  const vars = {
    "{home}": os.homedir(),
    "{appData}": path.join(os.homedir(), "AppData", "Roaming")
  };

  let resolved = resource.path;
  for (const [key, value] of Object.entries(vars)) {
    resolved = resolved.replaceAll(key, value);
  }

  resolved = path.resolve(resolved);

  // Hard safety: only allow reads inside user home
  const home = path.resolve(os.homedir());
  if (!resolved.startsWith(home)) {
    throw new Error("Denied: path outside allowed directory");
  }

  return resolved;
}

async function readFileLimited(fullPath, maxBytes = 64 * 1024) {
  const buf = await fs.readFile(fullPath);
  if (buf.length > maxBytes) {
    throw new Error("Denied: file exceeds size limit");
  }
  return buf.toString("utf8");
}

/**
 * Registers file bridge handlers.
 *
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {function} deps.getPluginContext
 */
function registerFileBridge({ ipcMain, getPluginContext }) {
  ipcMain.handle("bridge:file.readText", async (_evt, { pluginId, resourceId }) => {
    const ctx = await getPluginContext(pluginId);
    if (!ctx) throw new Error(`Unknown plugin: ${pluginId}`);

    if (!ctx.permissions?.includes("file.read")) {
      throw new Error("Denied: missing permission file.read");
    }

    const resource = ctx.resources?.[resourceId];
    if (!resource) throw new Error(`Unknown resource: ${resourceId}`);

    const fullPath = resolveResourcePath(resource);
    return await readFileLimited(fullPath);
  });

  ipcMain.handle("bridge:file.readJson", async (_evt, { pluginId, resourceId }) => {
    const ctx = await getPluginContext(pluginId);
    if (!ctx) throw new Error(`Unknown plugin: ${pluginId}`);

    if (!ctx.permissions?.includes("file.read")) {
      throw new Error("Denied: missing permission file.read");
    }

    const resource = ctx.resources?.[resourceId];
    if (!resource) throw new Error(`Unknown resource: ${resourceId}`);
    if (resource.type !== "json") {
      throw new Error("Denied: resource is not json");
    }

    const fullPath = resolveResourcePath(resource);
    const text = await readFileLimited(fullPath);
    return JSON.parse(text);
  });
}

module.exports = registerFileBridge;
