const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const log = require('electron-log');

class UserManager {
    constructor(windowManager) {
        this.windowManager = windowManager; 
    }

    async readUserInfo() {
        const homeDir = os.homedir();
        const userJsonPath = path.join(homeDir, 'AppData', 'Roaming', 'Slippi Launcher', 'netplay', 'User', 'Slippi', 'user.json');
        
        try {
            const data = await fs.readFile(userJsonPath, 'utf-8');
            const userInfo = JSON.parse(data);
            log.info('User Info:', userInfo);

            // Send the user info to the renderer process
            if (this.windowManager.getWebContents()) {
                this.windowManager.getWebContents().send('user-retrieved', userInfo);
            }
        } catch (error) {
            log.error('Error reading user info:', error);
            // Optionally, you can send the error to the renderer process
            if (this.windowManager.getWebContents()) {
                this.windowManager.getWebContents().send('user-retrieved-error', error.message);
            }
        }
    }
}

module.exports = UserManager;
