/* ==========================================================================
   Reminder / Notification Manager — Browser Notifications API
   ========================================================================== */

var ReminderManager = (function () {
  "use strict";

  var scheduledTimers = {};  // { eventId-minutes: timerId }
  var permissionGranted = false;
  var MAX_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  /**
   * Request notification permission from the user.
   * @returns {Promise<boolean>} Whether permission was granted.
   */
  function requestPermission() {
    if (!("Notification" in window)) {
      console.warn("Browser does not support notifications.");
      return Promise.resolve(false);
    }

    if (Notification.permission === "granted") {
      permissionGranted = true;
      return Promise.resolve(true);
    }

    if (Notification.permission === "denied") {
      return Promise.resolve(false);
    }

    return Notification.requestPermission().then(function (perm) {
      permissionGranted = perm === "granted";
      return permissionGranted;
    });
  }

  /**
   * Check if notifications are supported and permitted.
   */
  function isEnabled() {
    return "Notification" in window && Notification.permission === "granted";
  }

  /**
   * Schedule reminders for an event.
   * @param {Object} event - Event object with id, title, start, reminders[].
   */
  function scheduleReminders(event) {
    if (!event.reminders || event.reminders.length === 0) return;
    if (!isEnabled()) return;

    var eventStart = new Date(event.start).getTime();
    var now = Date.now();

    event.reminders.forEach(function (minutesBefore) {
      var reminderTime = eventStart - (minutesBefore * 60000);
      var delay = reminderTime - now;
      var key = event.id + "-" + minutesBefore;

      // Clear any existing timer for this reminder
      if (scheduledTimers[key]) {
        clearTimeout(scheduledTimers[key]);
        delete scheduledTimers[key];
      }

      if (delay > 0 && delay < MAX_SCHEDULE_MS) {
        scheduledTimers[key] = setTimeout(function () {
          showNotification(event, minutesBefore);
          delete scheduledTimers[key];
        }, delay);
      }
    });
  }

  /**
   * Show a browser notification for an event.
   */
  function showNotification(event, minutesBefore) {
    if (!isEnabled()) return;

    var body = formatReminderText(minutesBefore);
    if (event.location) {
      body += "\n📍 " + event.location;
    }

    try {
      var notification = new Notification(event.title, {
        body: body,
        tag: event.id + "-" + minutesBefore,
        requireInteraction: false,
      });

      // Auto-close after 10 seconds
      setTimeout(function () {
        notification.close();
      }, 10000);
    } catch (e) {
      console.warn("Failed to show notification:", e);
    }
  }

  /**
   * Format reminder time text.
   */
  function formatReminderText(minutes) {
    if (minutes === 0) return "Starting now";
    if (minutes < 60) return "Starts in " + minutes + " minute" + (minutes !== 1 ? "s" : "");
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return "Starts in " + hours + " hour" + (hours !== 1 ? "s" : "");
    var days = Math.floor(hours / 24);
    return "Starts in " + days + " day" + (days !== 1 ? "s" : "");
  }

  /**
   * Format reminder option for display.
   */
  function formatReminderOption(minutes) {
    if (minutes === 0) return "At time of event";
    if (minutes === 5) return "5 minutes before";
    if (minutes === 10) return "10 minutes before";
    if (minutes === 15) return "15 minutes before";
    if (minutes === 30) return "30 minutes before";
    if (minutes === 60) return "1 hour before";
    if (minutes === 120) return "2 hours before";
    if (minutes === 1440) return "1 day before";
    if (minutes === 2880) return "2 days before";
    return minutes + " minutes before";
  }

  /**
   * Cancel all reminders for a specific event.
   */
  function cancelReminders(eventId) {
    Object.keys(scheduledTimers).forEach(function (key) {
      if (key.indexOf(eventId) === 0) {
        clearTimeout(scheduledTimers[key]);
        delete scheduledTimers[key];
      }
    });
  }

  /**
   * Schedule reminders for all upcoming events.
   * Call this on page load to re-schedule.
   */
  function scheduleAll(events) {
    // Clear all existing timers
    Object.keys(scheduledTimers).forEach(function (key) {
      clearTimeout(scheduledTimers[key]);
    });
    scheduledTimers = {};

    if (!isEnabled()) return;

    var now = Date.now();
    events.forEach(function (event) {
      if (!event.reminders || event.reminders.length === 0) return;
      var eventStart = new Date(event.start).getTime();
      // Only schedule for future events
      if (eventStart > now) {
        scheduleReminders(event);
      }
    });
  }

  /** Available reminder options (in minutes). */
  var REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880];

  return {
    requestPermission: requestPermission,
    isEnabled: isEnabled,
    scheduleReminders: scheduleReminders,
    cancelReminders: cancelReminders,
    scheduleAll: scheduleAll,
    showNotification: showNotification,
    formatReminderOption: formatReminderOption,
    REMINDER_OPTIONS: REMINDER_OPTIONS,
  };
})();
