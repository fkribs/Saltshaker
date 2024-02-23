const { BrowserWindow } = require('electron');
const path = require('path');

class WindowManager {
    constructor() {
        this.window = null;
    }

    createWindow() {
        this.window = new BrowserWindow({
            width: 800,
            height: 800,
            show: true,
            alwaysOnTop: true,
            transparent: false,
            backgroundColor: '#ffffff',
            icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
            title: 'Salt Shaker',
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: true,
                contextIsolation: true,
            },
        });

        this.window.loadURL(`https://signalrcorewebrtc20240210154024.azurewebsites.net/`);

        this.window.on('closed', () => {
            this.window = null;
        });
    }

    getWebContents() {
        return this.window ? this.window.webContents : null;
    }
}

module.exports = WindowManager;
