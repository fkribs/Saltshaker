const PluginInterface = {
    /**
     * Initializes the plugin.
     * Should be called when the plugin is loaded.
     */
    onInit() {},

    /**
     * Sets the session ID for the plugin instance.
     * @param {string} sessionId - Unique identifier for the session.
     */
    setSessionId(sessionId) {},

    /**
     * Connects to the session.
     * Returns a promise or logs the action if successful.
     */
    connect() {},

    /**
     * Disconnects from the session.
     * Returns a promise or logs the action if successful.
     */
    disconnect() {},

    /**
     * Cleans up resources when the plugin is disposed of.
     */
    onDispose() {}
};
