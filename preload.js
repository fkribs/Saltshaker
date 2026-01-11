// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Only allow renderer to listen to these channels.
// (These are forwarded from main via pluginEvents -> wc.send(...).)
const ALLOWED_CHANNELS = new Set([
  "connect",
  "disconnect",
  "dolphin:Connected",
  "dolphin:Connecting",
  "dolphin:Disconnected",
  "dolphin:Error",
  "dolphin:GameStart",
  "dolphin:GameEnd",
  "plugins-installed",
  "plugins-uninstalled"
]);

function onAllowed(channel, callback) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Denied: cannot listen on channel '${channel}'`);
  }

  const handler = (_evt, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const salt = {
  // -------- Plugin lifecycle (UI) --------
  runInstalledPlugin(pluginId) {
    return ipcRenderer.invoke("run-plugin", pluginId);
  },

  getInstalledPlugins() {
    return ipcRenderer.invoke("list-installed-plugins");
  },

  installPlugin(payload) {
    return ipcRenderer.invoke("install-plugin", payload);
  },

  uninstallPlugin(pluginId) {
    return ipcRenderer.invoke("uninstall-plugin", pluginId);
  },

  onPluginInstalled(callback) {
    return onAllowed("plugins-installed", callback);
  },

  onPluginUninstalled(callback) {
    return onAllowed("plugins-uninstalled", callback);
  },

  // -------- Event fanout (UI) --------
  // This is for renderer UI to react to plugin/bridge events.
  on(event, callback) {
    return onAllowed(event, callback);
  }
};

contextBridge.exposeInMainWorld("salt", salt);
