// UpdateManager.js
const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

class UpdateManager {
  constructor() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('error', (err) => console.warn('[updater] error:', err));
    autoUpdater.on('update-available', () => console.log('[updater] update available'));
    autoUpdater.on('update-not-available', () => console.log('[updater] no update'));
    autoUpdater.on('download-progress', p => console.log('[updater] progress', Math.round(p.percent) + '%'));
    autoUpdater.on('update-downloaded', () => console.log('[updater] ready to install on quit'));
  }

  checkForUpdates() {
    if (!app.isPackaged) {
      console.log('[updater] skip: app not packaged');
      return;
    }
    autoUpdater.checkForUpdatesAndNotify();
  }
}

module.exports = UpdateManager;
