/* ==========================================================================
   Sync Manager — localStorage persistence + sync status
   ========================================================================== */

var SyncManager = (function () {
  "use strict";

  var STORAGE_KEY = "calendar_events";
  var LAST_SYNC_KEY = "calendar_last_sync";
  var statusCallback = null;

  /**
   * Save events to localStorage.
   * @param {Array} events - Array of event objects.
   */
  function saveEvents(events) {
    try {
      // Filter out recurring instances — only save parent events
      var toSave = events.filter(function (ev) {
        return !ev.isRecurringInstance;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      updateStatus("synced");
      // Cloud sync hook
      if (typeof CloudSync !== "undefined") {
        CloudSync.syncToCloud("events", toSave);
      }
      return true;
    } catch (e) {
      console.error("Failed to save events:", e);
      updateStatus("error");
      return false;
    }
  }

  /**
   * Load events from localStorage.
   * @returns {Array} Array of event objects, or empty array.
   */
  function loadEvents() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      var events = JSON.parse(stored);
      if (!Array.isArray(events)) return [];
      updateStatus("synced");
      return events;
    } catch (e) {
      console.error("Failed to load events:", e);
      updateStatus("error");
      return [];
    }
  }

  /**
   * Get the last sync timestamp.
   * @returns {string|null} ISO date string or null.
   */
  function getLastSync() {
    return localStorage.getItem(LAST_SYNC_KEY);
  }

  /**
   * Merge imported events with existing events.
   * @param {Array} existing - Current events array.
   * @param {Array} imported - New events to merge.
   * @returns {Array} Merged events array.
   */
  function mergeEvents(existing, imported) {
    var idMap = {};

    // Index existing events
    existing.forEach(function (ev) {
      idMap[ev.id] = ev;
    });

    // Merge imported (overwrite if same ID)
    imported.forEach(function (ev) {
      idMap[ev.id] = ev;
    });

    return Object.keys(idMap).map(function (id) {
      return idMap[id];
    });
  }

  /**
   * Register a callback for sync status updates.
   * @param {Function} callback - Called with status string ("synced"|"syncing"|"error").
   */
  function onStatusChange(callback) {
    statusCallback = callback;
  }

  /**
   * Update sync status.
   */
  function updateStatus(status) {
    if (statusCallback) {
      statusCallback(status);
    }
  }

  /**
   * Generate a unique ID for new events.
   * @returns {string} UUID-like string.
   */
  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return "evt-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Clear all stored events.
   */
  function clearEvents() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  }

  return {
    saveEvents: saveEvents,
    loadEvents: loadEvents,
    getLastSync: getLastSync,
    mergeEvents: mergeEvents,
    onStatusChange: onStatusChange,
    generateId: generateId,
    clearEvents: clearEvents,
  };
})();
