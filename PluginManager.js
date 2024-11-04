const { EventEmitter } = require('events');
const vm = require('vm');

class PluginManager {
    constructor(windowManager) {
        this.webContents = windowManager.getWebContents(); // Renderer communication interface
        this.pluginEvents = new EventEmitter(); // EventEmitter for plugin events

        // Bind event handlers
        this.pluginEvents.on('setSession', this.handleSetSession.bind(this));
        this.pluginEvents.on('connect', this.handleConnect.bind(this));
        this.pluginEvents.on('disconnect', this.handleDisconnect.bind(this));
    }

    loadAndRunPlugin(pluginId, pluginCode) {
        console.log(`Loading plugin: ${pluginId}`);
        const context = {
            console,
            module: { exports: {} },
            require,
            setTimeout,
            setInterval,
            pluginEvents: this.pluginEvents // Expose the EventEmitter to the plugin
        };

        const vmContext = vm.createContext(context);
        const pluginScript = new vm.Script(pluginCode);

        try {
            // Execute the plugin code
            pluginScript.runInContext(vmContext);
            console.log(`Plugin ${pluginId} loaded successfully.`);
            const plugin = context.module.exports;
            plugin.onInit();
        } catch (error) {
            console.error(`Failed to load plugin ${pluginId}:`, error);
        }
    }

    // Event handler for setSession
    handleSetSession(sessionId) {
        console.log(`Plugin set session ID: ${sessionId}`);
        if (this.webContents) {
            this.webContents.send('setSession', sessionId);
        }
    }

    // Event handler for connect
    handleConnect() {
        console.log("Plugin connected to session");
        if (this.webContents) {
            this.webContents.send('connect');
        }
    }

    // Event handler for disconnect
    handleDisconnect() {
        console.log("Plugin disconnected from session");
        if (this.webContents) {
            this.webContents.send('disconnect');
        }
    }
}

module.exports = PluginManager;
