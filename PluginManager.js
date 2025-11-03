const { EventEmitter } = require('events');
const vm = require('vm');

class PluginManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.webContents = this.windowManager?.getWebContents?.() || null;

    this.pluginEvents = new EventEmitter();
    // Use arrow wrappers instead of bind (avoids undefined method edge cases)
     this.pluginEvents.on('setSession', (sessionId) => this.handleSetSession?.(sessionId));
+   this.pluginEvents.on('connect',   (payload)   => this.handleConnect?.(payload));
+   this.pluginEvents.on('disconnect',(payload)   => this.handleDisconnect?.(payload));
    

    this.activePlugins = {};
  }

  getWebContents() {
    // refresh lazily in case window was created after PM init
    this.webContents ||= this.windowManager?.getWebContents?.();
    return this.webContents;
  }

  loadAndRunPlugin(pluginId, pluginCode) {
    console.log(`Loading plugin: ${pluginId}`);

    // make plugin debuggable in DevTools
    if (!/\/\/#\s*sourceURL=/.test(pluginCode)) {
      pluginCode += `\n//# sourceURL=plugin-${pluginId}.js\n`;
    }

    const context = {
      console,
      module: { exports: {} },
      require,
      setTimeout, setInterval, clearTimeout, clearInterval,
      Buffer,
      pluginEvents: this.pluginEvents,
    };
    context.global = context;

    const vmContext = vm.createContext(context);
    const script = new vm.Script(pluginCode, { filename: `plugin-${pluginId}.js`, displayErrors: true });
    try {
      script.runInContext(vmContext, { displayErrors: true });
      const plugin = context.module.exports;
      if (plugin && typeof plugin.onInit === 'function') {
        this.activePlugins[pluginId] = plugin;
        plugin.onInit();
      }
      console.log(`Plugin ${pluginId} loaded and initialized.`);
    } catch (err) {
      console.error(`Failed to load plugin ${pluginId}:`, err);
    }
  }

  // --- handlers ---
  handleSetSession(sessionId) {
    console.log(`Plugin set session ID: ${sessionId}`);
    this.getWebContents()?.send('setSession', sessionId);
  }

  handleConnect(payload) {
    console.log('Plugin connected to session');
    console.log('Payload: ' + payload);
    this.getWebContents()?.send('connect', payload);
  }

  handleDisconnect(payload) {
    console.log('Plugin disconnected from session');
    this.getWebContents()?.send('disconnect', payload);
  }
}

module.exports = PluginManager;
