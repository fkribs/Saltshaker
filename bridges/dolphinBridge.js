// bridges/dolphinBridge.js
const {
  SlpStream,
  SlpStreamEvent,
  SlpParser,
  DolphinConnection,
  Ports,
  ConnectionEvent,
  ConnectionStatus,
  DolphinMessageType
} = require("@slippi/slippi-js");

/**
 * Dolphin bridge that can be called directly from main-process code (PluginManager),
 * while optionally still supporting renderer IPC callers for backwards compatibility.
 *
 * Contract:
 * - subscribe(pluginId, { events: string[] }) -> "ok"
 * - unsubscribe(pluginId, { events?: string[] }) -> "ok"
 *
 * Emits onto pluginEvents as: `dolphin:<EventName>` with a payload (same as today).
 */
module.exports = function registerDolphinBridge({ ipcMain, pluginEvents }) {
  // --------------------
  // Connection state (singleton Dolphin connection for the app)
  // --------------------
  let slpStream = null;
  let parser = null;
  let dolphinConnection = null;

  let reconnectTimer = null;
  let desired = false; // any plugin is subscribed, so we want to stay connected
  let wired = false;

  // --------------------
  // Subscription state (per-plugin)
  // --------------------
  const requestedEventsByPlugin = new Map(); // pluginId -> Set<string>

  function getOrCreateEventSet(pluginId) {
    let set = requestedEventsByPlugin.get(pluginId);
    if (!set) {
      set = new Set();
      requestedEventsByPlugin.set(pluginId, set);
    }
    return set;
  }

  function anySubscriberWants(eventName) {
    for (const set of requestedEventsByPlugin.values()) {
      if (set.has(eventName)) return true;
    }
    return false;
  }

  function emitIfRequested(name, payload) {
    // Emit globally on the shared bus if ANY plugin wants it.
    // (Plugins filter by subscribing; PluginManager already forwards by name.)
    if (anySubscriberWants(name)) {
      pluginEvents.emit(`dolphin:${name}`, payload);
    }
  }

  // --------------------
  // Reconnect helpers
  // --------------------
  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    clearReconnect();
    if (!desired) return;

    reconnectTimer = setTimeout(() => {
      connect();
    }, 1000);
  }

  // --------------------
  // Object lifecycle
  // --------------------
  function ensureObjects() {
    if (!slpStream) slpStream = new SlpStream();
    if (!parser) parser = new SlpParser();
    if (!dolphinConnection) dolphinConnection = new DolphinConnection();
  }

  function connect() {
    ensureObjects();

    // Mirror old behavior
    emitIfRequested("Disconnected", null);

    const status = dolphinConnection.getStatus?.();
    if (status === ConnectionStatus.DISCONNECTED) {
      dolphinConnection.connect("127.0.0.1", Ports.DEFAULT);
    }
  }

  function disconnect() {
    // Best-effort: slippi-js DolphinConnection may have disconnect/close depending on version.
    // If it doesn't, the desired=false flag will at least stop reconnect attempts.
    try {
      if (dolphinConnection?.disconnect) dolphinConnection.disconnect();
      else if (dolphinConnection?.close) dolphinConnection.close();
    } catch (_) {
      // ignore
    }
  }

  function wireOnce() {
    if (wired) return;
    wired = true;

    ensureObjects();

    dolphinConnection.on(ConnectionEvent.STATUS_CHANGE, (status) => {
      switch (status) {
        case ConnectionStatus.DISCONNECTED:
          emitIfRequested("Disconnected", null);
          scheduleReconnect();
          break;

        case ConnectionStatus.CONNECTED:
          emitIfRequested("Connected", { host: "127.0.0.1", port: Ports.DEFAULT });
          clearReconnect();
          break;

        case ConnectionStatus.CONNECTING:
          emitIfRequested("Connecting", null);
          break;
      }
    });

    dolphinConnection.on(ConnectionEvent.MESSAGE, (message) => {
      switch (message.type) {
        case DolphinMessageType.CONNECT_REPLY:
          break;

        case DolphinMessageType.GAME_EVENT: {
          const decoded = Buffer.from(message.payload, "base64");
          slpStream.write(decoded);
          break;
        }
      }
    });

    dolphinConnection.on(ConnectionEvent.ERROR, (err) => {
      emitIfRequested("Error", { message: err?.message ?? String(err) });
      scheduleReconnect();
    });

    slpStream.on(SlpStreamEvent.COMMAND, (event) => {
      try {
        parser.handleCommand(event.command, event.payload);

        if (event.command === 54) emitIfRequested("GameStart", parser.getSettings());
        if (event.command === 57) emitIfRequested("GameEnd", null);
      } catch (err) {
        emitIfRequested("Error", { message: err?.message ?? String(err) });
      }
    });
  }

  function recomputeDesiredAndMaybeStop() {
    // If any plugin has any requested events, we are "desired".
    desired = false;
    for (const set of requestedEventsByPlugin.values()) {
      if (set.size > 0) {
        desired = true;
        break;
      }
    }

    if (!desired) {
      clearReconnect();
      disconnect();
    }
  }

  // --------------------
  // Public API (direct main-process calls)
  // --------------------
  async function subscribe(pluginId, options) {
    const events = options?.events || [];
    if (!pluginId) throw new Error("subscribe requires pluginId");

    const set = getOrCreateEventSet(pluginId);
    for (const e of events) set.add(e);

    desired = true;
    wireOnce();
    connect();

    return "ok";
  }

  async function unsubscribe(pluginId, options = {}) {
    const events = options?.events || null;
    if (!pluginId) throw new Error("unsubscribe requires pluginId");

    const set = requestedEventsByPlugin.get(pluginId);
    if (!set) return "ok";

    if (Array.isArray(events)) {
      for (const e of events) set.delete(e);
    } else {
      // If no events specified, unsubscribe plugin from everything
      set.clear();
    }

    if (set.size === 0) {
      requestedEventsByPlugin.delete(pluginId);
    }

    recomputeDesiredAndMaybeStop();
    return "ok";
  }

  // --------------------
  // Optional: IPC compatibility for renderer callers
  // --------------------
  if (ipcMain) {
    ipcMain.handle("bridge:dolphin.subscribe", async (_evt, args) => {
      const pluginId = args?.pluginId;
      const events = args?.events;
      return subscribe(pluginId, { events });
    });

    ipcMain.handle("bridge:dolphin.unsubscribe", async (_evt, args) => {
      const pluginId = args?.pluginId;
      const events = args?.events;
      return unsubscribe(pluginId, { events });
    });
  }

  // Return the direct-call surface for PluginManager
  return {
    subscribe,
    unsubscribe
  };
};
