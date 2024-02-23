const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { showNotification } = require('./NotificationManager');

class UpdateManager {
    constructor() {
        // Configure logging
        autoUpdater.logger = log;
        autoUpdater.logger.transports.file.level = 'info';

        // Set up event listeners for the autoUpdater
        this.setupEventListeners();
    }

    setupEventListeners() {
        autoUpdater.on('checking-for-update', () => {
            log.info('Checking for update...');
        });

        autoUpdater.on('update-available', (info) => {
            log.info('Update available.', info);
            showNotification('Update Available', 'A new version is downloading...', 10000);
        });

        autoUpdater.on('update-not-available', (info) => {
            log.info('Update not available.', info);
        });

        autoUpdater.on('error', (err) => {
            log.error('Error in auto-updater. ' + err);
            showNotification('Update Error', `An error occurred: ${err.message}`, 10000);
        });

        autoUpdater.on('download-progress', (progressObj) => {
            let log_message = "Download speed: " + progressObj.bytesPerSecond;
            log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
            log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
            log.info(log_message);
        });

        autoUpdater.on('update-downloaded', (info) => {
            log.info('Update downloaded; will install now', info);
            autoUpdater.quitAndInstall(); // Install the update and restart the application
        });
    }

    checkForUpdates() {
        autoUpdater.checkForUpdatesAndNotify();
    }
}

module.exports = UpdateManager;
