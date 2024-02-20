const { app, BrowserWindow, Notification} = require('electron');
const {autoUpdater} = require('electron-updater');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const {
	SlpParser,
	DolphinConnection,
	Ports,
	ConnectionEvent,
	ConnectionStatus,
	DolphinMessageType,
	Command,
	SlpCommandEventPayload,
	SlpParserEvent,
	FrameEntryType,
	SlpStream,
	SlpStreamEvent,
	SlippiGame,
	GameMode
} = require('@slippi/slippi-js');

const log = require('electron-log');
console.log = log.log;

    var dolphinConnection = new DolphinConnection();
	var parser = new SlpParser();
	var slpStream = new SlpStream();

	let gameDirectory = '';

	slpStream.on(SlpStreamEvent.COMMAND, (event) => {
		parser.handleCommand(event.command, event.payload);
		if (event.command == 54) {
			win.webContents.send(
				'game-start',
				parser.getSettings()
			);
		}
		if (event.command == 57){
			win.webContents.send(
				'game-end'
			);
		}
	});

	dolphinConnection.on(ConnectionEvent.STATUS_CHANGE, (status) => {
		// Disconnect from Slippi server when we disconnect from Dolphin
		if (status === ConnectionStatus.DISCONNECTED) {
			win.webContents.send('disconnected-event', 'disconnected');
			dolphinConnection.connect('127.0.0.1', Ports.DEFAULT);
		}
		if (status === ConnectionStatus.CONNECTED) {
			win.webContents.send('connected-event', 'connected');
		}
		if (status === ConnectionStatus.CONNECTING) {
			win.webContents.send('connecting-event', 'connecting');
		}
	});

	dolphinConnection.on(ConnectionEvent.MESSAGE, (message) => {
		switch (message.type) {
			case DolphinMessageType.CONNECT_REPLY:
				console.log('Connected: ' + message);
				break;
			case DolphinMessageType.GAME_EVENT:
				var decoded = Buffer.from(message.payload, 'base64');
				slpStream.write(decoded);
				break;
		}
	});

	dolphinConnection.on(ConnectionEvent.ERROR, (err) => {
		// Log the error messages we get from Dolphin
		console.log('Dolphin connection error', err);
	});

	dolphinConnection.on(ConnectionEvent.ERROR, (err) => {
		// Log the error messages we get from Dolphin
		console.log('Dolphin connection error', err);
	});

const showNotification = (title, body, duration) => {
	const notification = new Notification({
		title: title || 'Notification',
		body: body || '',
	});
	
	notification.show();

	setTimeout(() => {
		notification.close();
		}, duration || 5000);
	};

let win;

function createWindow () {
  // Set the application name (visible in the menu bar)
  app.name = 'Salt Shaker';

  // Create the browser window.
  win = new BrowserWindow({
    width: 800, 
    height: 800,
	show: true,
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
	title: app.name,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: true,
        contextIsolation: true 
    }
  });

  win.webContents.once('dom-ready', () => {
			// Make the disconnected label appear first
			win.webContents.send('disconnected-event', 'disconnected');
			if (dolphinConnection.getStatus() === ConnectionStatus.DISCONNECTED) {
				// Now try connect to our local Dolphin instance
				dolphinConnection.connect('127.0.0.1', Ports.DEFAULT);
			}
		});
  //win.loadURL(`https://localhost:44389/`)
  win.loadURL(`https://signalrcorewebrtc20240210154024.azurewebsites.net/`);
  
  // Event when the window is closed.
  win.on('closed', function () {
    win = null;
  });
}

// Create window on electron initialization
app.on('ready', function() {
	createWindow();
	setTimeout(() => {
		readUserInfo();
	}, 3000);
	autoUpdater.checkForUpdatesAndNotify();
});

const readUserInfo = async () => {
	const homeDir = os.homedir();
	const userJsonPath = path.join(homeDir, 'AppData', 'Roaming', 'Slippi Launcher', 'netplay', 'User', 'Slippi', 'user.json');
	
	var userInfo = null;
	try {
		const data = await fs.readFile(userJsonPath, 'utf-8');
		userInfo = JSON.parse(data);
		console.log(userInfo);
	}catch (error){
		console.error('Error reading user info:', error);
	}
	win.webContents.send('user-retrieved', userInfo);
}


autoUpdater.on('update-available', () => {
	console.log('Update available!');
});

autoUpdater.on('update-not-available', () => {
	console.log('Application up to date!');
});

autoUpdater.on('update-downloaded', () => {
	console.log('Update downloaded; will install now');
	autoUpdater.quitAndInstall();
});

autoUpdater.on('error', (error) => {
	showNotification('Failed to download update', error.message, 10_000);
});

// Quit when all windows are closed.
app.on('window-all-closed', function () {

  // On macOS specific close process
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // macOS specific close process
  if (win === null) {
    createWindow();
  }
});