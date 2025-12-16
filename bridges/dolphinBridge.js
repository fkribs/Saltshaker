// dolphinBridge.js
const {
  SlpStream,
  SlpParser,
  DolphinConnection,
  SlpStreamEvent,
  ConnectionEvent,
  Ports
} = require('@slippi/slippi-js');

module.exports = function registerDolphinBridge({ ipcMain, pluginEvents }) {
  let conn = null;
  let stream = null;
  let parser = null;

  ipcMain.handle("bridge:dolphin.subscribe", async (_evt, { events }) => {
    if (!conn) {
      stream = new SlpStream();
      parser = new SlpParser();
      conn = new DolphinConnection();

      conn.connect('127.0.0.1', Ports.DEFAULT);

      conn.on(ConnectionEvent.MESSAGE, (msg) => {
        if (msg.type === "game_event" && msg.payload) {
          const decoded = Buffer.from(msg.payload, 'base64');
          stream.write(decoded);
        }
      });

      stream.on(SlpStreamEvent.COMMAND, (event) => {
        parser.handleCommand(event.command, event.payload);

        if (event.command === 54 && events.includes("GameStart")) {
          pluginEvents.emit("dolphin:GameStart", parser.getSettings());
        }

        if (event.command === 57 && events.includes("GameEnd")) {
          pluginEvents.emit("dolphin:GameEnd", null);
        }
      });
    }
    return "ok";
  });
};
