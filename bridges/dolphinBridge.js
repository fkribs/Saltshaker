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

module.exports = function registerDolphinBridge({ ipcMain, pluginEvents }) {
  let slpStream = null;
  let parser = null;
  let dolphinConnection = null;

  let reconnectTimer = null;
  let desired = false; // user has subscribed, so we want to stay connected

  // Track requested events (don’t capture a single events array forever)
  const requestedEvents = new Set();

  function emitIfRequested(name, payload) {
    if (requestedEvents.has(name)) {
      pluginEvents.emit(`dolphin:${name}`, payload);
    }
  }

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

  function ensureObjects() {
    if (!slpStream) slpStream = new SlpStream();
    if (!parser) parser = new SlpParser();
    if (!dolphinConnection) dolphinConnection = new DolphinConnection();
  }

  function connect() {
    ensureObjects();

    // Mirror your old logic
    emitIfRequested("Disconnected", null);

    const status = dolphinConnection.getStatus?.();
    if (status === ConnectionStatus.DISCONNECTED) {
      dolphinConnection.connect("127.0.0.1", Ports.DEFAULT);
    }
  }

  function wireOnce() {
    // Wire only once per created dolphinConnection
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
          // optional emit / log
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
        // Don’t throw; keep stream alive
      }
    });
  }

  function ensureWired() {
    // if we just created objects, wire them
    // simplest is: if dolphinConnection exists but we never wired, wire immediately after creation
    // Here, call wireOnce only once after first creation:
    if (!dolphinConnection) {
      ensureObjects();
      wireOnce();
    } else if (!slpStream || !parser) {
      ensureObjects();
    }
  }

  ipcMain.handle("bridge:dolphin.subscribe", async (_evt, { events }) => {
    desired = true;

    for (const e of (events || [])) requestedEvents.add(e);

    ensureWired();
    connect();
    return "ok";
  });

  ipcMain.handle("bridge:dolphin.unsubscribe", async () => {
    desired = false;
    clearReconnect();
    return "ok";
  });
};