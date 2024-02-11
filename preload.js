const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onGameStart: (callback) => {
        ipcRenderer.on('game-start', callback);
    },
    onGameEnd: (callback) => {
        ipcRenderer.on('game-end', callback);
    }
});