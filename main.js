const { app } = require('electron');
const WindowManager = require('./WindowManager');
const DolphinManager = require('./DolphinManager');
const SlippiManager = require('./SlippiManager');
const UpdateManager = require('./UpdateManager');
const UserManager = require('./UserManager');

let windowManager = new WindowManager();
let updateManager = new UpdateManager();
let userManager, dolphinManager, slippiManager;

function setupManagers() {
    // Initialize managers that depend on the window being created
    userManager = new UserManager(windowManager);
    slippiManager = new SlippiManager(windowManager);
    dolphinManager = new DolphinManager(windowManager, slippiManager);

    // Perform initial setup tasks for each manager
	setTimeout(() => userManager.readUserInfo(), 1000);
    // Add any other setup tasks for DolphinManager and SlippiManager if necessary
}

app.on('ready', () => {
    windowManager.createWindow();
    setupManagers(); // Setup managers after the window is created
    updateManager.checkForUpdates();
    dolphinManager.connect();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (windowManager.window === null) {
        windowManager.createWindow();
        setupManagers(); // Ensure managers are setup correctly when window is recreated
    }
});
