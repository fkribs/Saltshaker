// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose a read-only username once (don’t redefine this elsewhere)
const username =
  process.env.SS_USERNAME ||
  process.env.USERNAME ||
  process.env.USER ||
  'anonymous';
contextBridge.exposeInMainWorld('username', username);

// Core API used by your page
const api = {
  loadPlugin(pluginId, pluginCode) {
    ipcRenderer.send('load-plugin', { pluginId, pluginCode });
  },

  runInstalledPlugin: (pluginId) => ipcRenderer.invoke("run-plugin", pluginId),

  async getInstalledPlugins() {
    return ipcRenderer.invoke("list-installed-plugins");
  },

  async installPlugin(payload) {
    // payload: { id, name, version, sha256, bytes }
    return ipcRenderer.invoke('install-plugin', payload);
  },

  onPluginInstalled(callback) {
    const handler = (_e, info) => callback(info);
    ipcRenderer.on("plugins-installed", handler);
    return () => ipcRenderer.off("plugins-installed", handler);
  },

  // Return an unsubscribe to avoid leaks
  onConnect(callback) {
    const handler = (_evt, payload) => callback?.(payload);
    ipcRenderer.on('connect', handler);
    return () => ipcRenderer.off('connect', handler);
  },

  onDisconnect(callback) {
    const handler = (_evt, payload) => callback?.(payload);
    ipcRenderer.on('disconnect', handler);
    return () => ipcRenderer.off('disconnect', handler);
  },

  onSetSession(callback) {
    const handler = (_evt, sessionId) => callback?.(sessionId);
    ipcRenderer.on('setSession', handler);
    return () => ipcRenderer.off('setSession', handler);
  }
};

// Preferred namespace
contextBridge.exposeInMainWorld('salt', api);

// Back-compat for existing code that calls window.electronAPI.*
contextBridge.exposeInMainWorld('electronAPI', api);
