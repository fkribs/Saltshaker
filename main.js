const { app, ipcMain, session } = require('electron');
const WindowManager = require('./WindowManager');
const UpdateManager = require('./UpdateManager');
const PluginManager = require('./PluginManager');

const { EventEmitter } = require('events');


let windowManager = new WindowManager();
let updateManager = new UpdateManager();
let userManager, dolphinManager, slippiManager, pluginManager;
const pluginEvents = new EventEmitter();

function setupManagers() {
    //userManager = new UserManager(windowManager);
    //slippiManager = new SlippiManager(windowManager);
    //dolphinManager = new DolphinManager(windowManager, slippiManager);
    pluginManager = new PluginManager(windowManager);

    //setTimeout(() => userManager.readUserInfo(), 1000);
}

// Function to set up ipcMain listeners
function setupIpcMainListeners() {
    ipcMain.on('load-plugin', (event, { pluginId, pluginCode }) => {
        console.log(`Loading plugin: ${pluginId}`);
        try {
            pluginManager.loadAndRunPlugin(pluginId, pluginCode);
        } catch (error) {
            console.error(`Failed to load plugin ${pluginId}:`, error);
        }
    });
}

app.on('ready', () => {
    windowManager.createWindow();
    setupManagers(); // Setup managers after the window is created
    setupIpcMainListeners(); // Setup ipcMain listeners
    updateManager.checkForUpdates();
    // dolphinManager.connect(); // Uncomment if needed
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
