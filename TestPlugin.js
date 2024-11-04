const TestPlugin = {
    sessionId: null,

    onInit() {
        console.log("TestPlugin initialized.");
        this.setSessionId("test");  // Setting default session ID to "test" for demonstration
        this.connect();  // Automatically connecting on init for testing
    },

    setSessionId(sessionId) {
        this.sessionId = sessionId;
        console.log(`Session ID set to: ${sessionId}`);
        pluginEvents.emit('setSession', sessionId); // Emit event to notify main process
    },

    connect() {
        if (this.sessionId) {
            console.log(`Connecting to session ${this.sessionId}...`);
            setTimeout(() => {
                console.log(`Connected to session ${this.sessionId}`);
                pluginEvents.emit('connect', this.sessionId); // Emit event on connect
            }, 500);
        } else {
            console.error("Session ID is not set. Cannot connect.");
        }
    },

    disconnect() {
        if (this.sessionId) {
            console.log(`Disconnecting from session ${this.sessionId}...`);
            setTimeout(() => {
                console.log(`Disconnected from session ${this.sessionId}`);
                pluginEvents.emit('disconnect', this.sessionId); // Emit event on disconnect
                this.sessionId = null;
            }, 500);
        } else {
            console.error("Session ID is not set. Nothing to disconnect.");
        }
    },

    onDispose() {
        console.log("TestPlugin disposed.");
        this.disconnect();
    }
};

module.exports = TestPlugin;
