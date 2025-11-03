const { BrowserWindow, app } = require('electron');
const path = require('path');

class WindowManager {
  constructor() {
    this.window = null;
  }

  createWindow() {
    const isDev = !app.isPackaged;

    // Prefer a .ico on Windows; fallback to your png for dev
    const iconPath = process.platform === 'win32'
      ? path.join(__dirname, 'build', 'icon.ico')
      : path.join(__dirname, 'src', 'assets', 'icon.png');

    this.window = new BrowserWindow({
      width: 800,
      height: 800,
      show: false,                  // show after ready-to-show (prevents white flash)
      backgroundColor: '#ffffff',
      icon: iconPath,
      title: 'Salt Shaker',
      autoHideMenuBar: true,        // cleaner UI
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    // Only show once it’s fully ready
    this.window.once('ready-to-show', () => {
      this.window.show();
    });

    // Load your hosted page
    this.window.loadURL(
      'https://signalrcorewebrtc20240210154024-cbhbe3c2c7a0a4hr.canadacentral-01.azurewebsites.net/'
    );

    // 🔧 Only open DevTools when in development
    if (isDev) {
      this.window.webContents.openDevTools({ mode: 'detach' });
    }

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  getWebContents() {
    return this.window ? this.window.webContents : null;
  }
}

module.exports = WindowManager;
