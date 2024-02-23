const { Notification } = require('electron');

class NotificationManager {
    static showNotification(title, body, duration = 5000) {
        // Ensure notifications are supported on the platform
        if (Notification.isSupported()) {
            const notification = new Notification({
                title: title || 'Notification',
                body: body || '',
                silent: false // Change to true if you don't want the notification sound
            });

            notification.show();

            // Close the notification after 'duration' milliseconds
            setTimeout(() => {
                notification.close();
            }, duration);
        } else {
            console.log('Notifications are not supported on this platform.');
        }
    }
}

module.exports = NotificationManager;