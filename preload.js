const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    loadPlugin: (pluginId, pluginCode) => {
        ipcRenderer.send('load-plugin', {pluginId, pluginCode});
    },
    onConnect: (callback) => {
        ipcRenderer.on('connect', callback);
    },
    onDisconnect: (callback) => {
        ipcRenderer.on('disconnect', callback);
    },
    onSetSession: (callback) => {
        ipcRenderer.on('setSession', callback);
    }
});