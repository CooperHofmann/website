/* ==========================================================================
   Cloud Sync — Firestore synchronization manager
   ==========================================================================
   Syncs all data types to Firebase Firestore using the user's UID as the
   document path. Supports real-time listeners, offline queueing, and a
   last-write-wins conflict resolution strategy.

   Data structure in Firestore:
     /userData/{userId}/events/{eventId}
     /userData/{userId}/todos/{todoId}
     /userData/{userId}/notes/{noteId}
     /userData/{userId}/goals/{goalId}
     /userData/{userId}/habits/{habitId}
     /userData/{userId}/bookmarks/{bookmarkId}
     /userData/{userId}/assignments/{assignmentId}
     /userData/{userId}/sessions/{sessionId}
   ========================================================================== */

var CloudSync = (function () {
  "use strict";

  /* ---------- Constants ---------- */

  var DATA_TYPES = ["events", "todos", "notes", "goals", "habits", "bookmarks", "assignments", "sessions"];
  var DEBOUNCE_MS = 2000;

  /* ---------- State ---------- */

  var db = null;
  var currentUserId = null;
  var syncStatus = "offline"; // "offline" | "syncing" | "synced" | "error"
  var statusCallbacks = [];
  var activeListeners = []; // Firestore unsubscribe functions
  var debounceTimers = {};
  var offlineQueue = []; // {type, data} queued while offline
  var isOnline = navigator.onLine !== false;

  /* ---------- Status helpers ---------- */

  function setStatus(status) {
    syncStatus = status;
    for (var i = 0; i < statusCallbacks.length; i++) {
      try { statusCallbacks[i](status); } catch (e) { /* noop */ }
    }
  }

  /**
   * Register a callback for sync status changes.
   * @param {Function} cb - Called with status string.
   */
  function onStatusChange(cb) {
    statusCallbacks.push(cb);
  }

  /* ---------- Firestore helpers ---------- */

  function userCollection(type) {
    return db.collection("userData").doc(currentUserId).collection(type);
  }

  /* ---------- Save / Load ---------- */

  /**
   * Save a single item to Firestore.
   * @param {string} type - Data type key (e.g. "todos").
   * @param {Object} item - Item with an `id` property.
   * @returns {Promise<void>}
   */
  function saveItem(type, item) {
    if (!db || !currentUserId || !item || !item.id) return Promise.resolve();
    var doc = Object.assign({}, item, { lastModified: Date.now() });
    return userCollection(type).doc(String(item.id)).set(doc);
  }

  /**
   * Delete a single item from Firestore.
   * @param {string} type - Data type key.
   * @param {string} id - Item ID.
   * @returns {Promise<void>}
   */
  function deleteItem(type, id) {
    if (!db || !currentUserId || !id) return Promise.resolve();
    return userCollection(type).doc(String(id)).delete();
  }

  /**
   * Save an entire collection to Firestore (batch write).
   * @param {string} type - Data type key.
   * @param {Array} items - Array of items, each with an `id` property.
   * @returns {Promise<void>}
   */
  function saveCollection(type, items) {
    if (!db || !currentUserId) return Promise.resolve();
    if (!Array.isArray(items) || items.length === 0) return Promise.resolve();

    var ts = Date.now();
    var batch = db.batch();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || !item.id) continue;
      var ref = userCollection(type).doc(String(item.id));
      batch.set(ref, Object.assign({}, item, { lastModified: ts }));
    }
    return batch.commit();
  }

  /**
   * Load all items of a type from Firestore.
   * @param {string} type - Data type key.
   * @returns {Promise<Array>}
   */
  function loadCollection(type) {
    if (!db || !currentUserId) return Promise.resolve([]);
    return userCollection(type).get().then(function (snapshot) {
      var items = [];
      snapshot.forEach(function (doc) {
        items.push(doc.data());
      });
      return items;
    });
  }

  /* ---------- Sync to cloud (debounced) ---------- */

  /**
   * Trigger a debounced sync of a specific data type to the cloud.
   * @param {string} type - Data type key.
   * @param {Array} items - Current in-memory array.
   */
  function syncToCloud(type, items) {
    if (!type || !Array.isArray(items)) return;

    if (!isOnline || !db || !currentUserId) {
      offlineQueue.push({ type: type, data: items });
      setStatus("offline");
      return;
    }

    if (debounceTimers[type]) clearTimeout(debounceTimers[type]);
    debounceTimers[type] = setTimeout(function () {
      setStatus("syncing");
      saveCollection(type, items).then(function () {
        setStatus("synced");
      }).catch(function (err) {
        console.error("CloudSync: failed to sync " + type + ":", err);
        setStatus("error");
      });
    }, DEBOUNCE_MS);
  }

  /* ---------- Real-time listeners ---------- */

  /**
   * Start a real-time listener for a data type.
   * @param {string} type - Data type key.
   * @param {Function} onUpdate - Called with the updated Array of items.
   */
  function listenCollection(type, onUpdate) {
    if (!db || !currentUserId || typeof onUpdate !== "function") return;
    var unsubscribe = userCollection(type).onSnapshot(function (snapshot) {
      var items = [];
      snapshot.forEach(function (doc) {
        items.push(doc.data());
      });
      try { onUpdate(items); } catch (e) { console.error("CloudSync listener error:", e); }
    }, function (err) {
      console.error("CloudSync: listener error for " + type + ":", err);
      setStatus("error");
    });
    activeListeners.push(unsubscribe);
  }

  /* ---------- Load all data on sign-in ---------- */

  /**
   * Load all data types from Firestore and deliver them via callbacks.
   * @param {Object} callbacks - Map of type → function(items).
   * @returns {Promise<void>}
   */
  function loadAllData(callbacks) {
    if (!db || !currentUserId) return Promise.resolve();
    callbacks = callbacks || {};
    setStatus("syncing");

    var promises = DATA_TYPES.map(function (type) {
      return loadCollection(type).then(function (items) {
        if (typeof callbacks[type] === "function" && items.length > 0) {
          try { callbacks[type](items); } catch (e) { console.error("CloudSync load callback error:", e); }
        }
      });
    });

    return Promise.all(promises).then(function () {
      setStatus("synced");
    }).catch(function (err) {
      console.error("CloudSync: loadAllData error:", err);
      setStatus("error");
    });
  }

  /* ---------- Offline queue flush ---------- */

  function flushOfflineQueue() {
    if (!isOnline || !db || !currentUserId || offlineQueue.length === 0) return;
    var queue = offlineQueue.slice();
    offlineQueue = [];
    setStatus("syncing");

    // Coalesce: keep only last write per type
    var latest = {};
    for (var i = 0; i < queue.length; i++) {
      latest[queue[i].type] = queue[i].data;
    }

    var types = Object.keys(latest);
    var promises = types.map(function (type) {
      return saveCollection(type, latest[type]);
    });

    Promise.all(promises).then(function () {
      setStatus("synced");
    }).catch(function (err) {
      console.error("CloudSync: offline queue flush error:", err);
      setStatus("error");
    });
  }

  /* ---------- Detach all listeners ---------- */

  function detachListeners() {
    for (var i = 0; i < activeListeners.length; i++) {
      try { activeListeners[i](); } catch (e) { /* noop */ }
    }
    activeListeners = [];
  }

  /* ---------- Session lifecycle ---------- */

  /**
   * Called when a user signs in. Initializes Firestore and loads data.
   * @param {string} userId - Firebase UID.
   * @param {Object} [loadCallbacks] - Map of type → function(items).
   */
  function onSignIn(userId, loadCallbacks) {
    if (typeof firebase === "undefined" || !firebase.firestore) return;
    db = firebase.firestore();
    currentUserId = userId;
    setStatus("syncing");
    loadAllData(loadCallbacks).then(function () {
      flushOfflineQueue();
    });
  }

  /**
   * Called when the user signs out. Clears Firestore state and listeners.
   */
  function onSignOut() {
    detachListeners();
    db = null;
    currentUserId = null;
    setStatus("offline");
  }

  /* ---------- Online / offline events ---------- */

  window.addEventListener("online", function () {
    isOnline = true;
    flushOfflineQueue();
  });

  window.addEventListener("offline", function () {
    isOnline = false;
    setStatus("offline");
  });

  /* ---------- Public API ---------- */

  return {
    onSignIn: onSignIn,
    onSignOut: onSignOut,
    syncToCloud: syncToCloud,
    saveItem: saveItem,
    deleteItem: deleteItem,
    loadAllData: loadAllData,
    listenCollection: listenCollection,
    detachListeners: detachListeners,
    onStatusChange: onStatusChange,
    getStatus: function () { return syncStatus; }
  };
})();
