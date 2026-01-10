// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// -------------------- Identity --------------------
const username =
  process.env.SS_USERNAME ||
  process.env.USERNAME ||
  process.env.USER ||
  'anonymous';

contextBridge.exposeInMainWorld('username', username);

// -------------------- Salt API --------------------
const salt = {
  // -------- Plugin lifecycle --------
  loadPlugin(pluginId, pluginCode) {
    ipcRenderer.send('load-plugin', { pluginId, pluginCode });
  },

  runInstalledPlugin(pluginId) {
    return ipcRenderer.invoke('run-plugin', pluginId);
  },

  getInstalledPlugins() {
    return ipcRenderer.invoke('list-installed-plugins');
  },

  installPlugin(payload) {
    return ipcRenderer.invoke('install-plugin', payload);
  },

  uninstallPlugin(pluginId) {
    return ipcRenderer.invoke('uninstall-plugin', pluginId);
  },

  onPluginInstalled(callback) {
    const handler = (_e, info) => callback(info);
    ipcRenderer.on('plugins-installed', handler);
    return () => ipcRenderer.off('plugins-installed', handler);
  },

  onPluginUninstalled(callback) {
    const handler = (_e, info) => callback(info);
    ipcRenderer.on('plugins-uninstalled', handler);
    return () => ipcRenderer.off('plugins-uninstalled', handler);
  },

  // -------- Host bridge APIs (for plugin sandbox) --------
  host: {
    file: {
      readText(resourceId, pluginId) {
        return ipcRenderer.invoke('bridge:file.readText', {
          pluginId,
          resourceId
        });
      },
      readJson(resourceId, pluginId) {
        return ipcRenderer.invoke('bridge:file.readJson', {
          pluginId,
          resourceId
        });
      }
    },

    dolphin: {
      subscribe(pluginId, options) {
        return ipcRenderer.invoke('bridge:dolphin.subscribe', {
          pluginId,
          ...options
        });
      }
    }
  },

  // -------- Event fanout (connect / disconnect / set-session) --------
  on(event, callback) {
    const handler = (_evt, payload) => callback(payload);
    ipcRenderer.on(event, handler);
    return () => ipcRenderer.off(event, handler);
  }
};

// Preferred namespace
contextBridge.exposeInMainWorld('salt', salt);
