/* ==========================================================================
   Cloud Sync — Firebase Firestore cross-device data synchronisation
   ==========================================================================
   Depends on: Firebase SDK (firestore), AuthManager
   Works alongside SyncManager (localStorage) for offline-first approach.

   Data flow:
     User action → localStorage (instant) → Firestore (async)
     Page load   → Firestore pull → merge with localStorage → render
   ========================================================================== */

var CloudSync = (function () {
  "use strict";

  /* ---------- Constants ---------- */

  /** All localStorage keys that should be synced to the cloud. */
  var SYNC_KEYS = [
    "calendar_events",
    "todo_items",
    "pomodoro_sessions",
    "pomodoro_settings",
    "assignments",
    "quick_notes",
    "habit_tracker",
    "goal_tracker",
    "bookmarks"
  ];

  var PENDING_QUEUE_KEY = "cloud_sync_pending";
  var DEBOUNCE_MS = 2000; // auto-save delay

  /* ---------- State ---------- */

  var db = null;
  var debounceTimers = {};
  var statusCallback = null;
  var isOnline = navigator.onLine;
  var initialized = false;

  /* ---------- Initialisation ---------- */

  /**
   * Initialize Firestore and set up listeners.
   * Call after firebase.initializeApp() and AuthManager.init().
   */
  function init() {
    if (typeof firebase === "undefined" || !firebase.firestore) {
      console.warn("CloudSync: Firestore SDK not loaded.");
      return;
    }

    db = firebase.firestore();

    /* Enable offline persistence */
    db.enablePersistence({ synchronizeTabs: true }).catch(function (err) {
      if (err.code === "failed-precondition") {
        console.warn("CloudSync: Multiple tabs open; persistence available in one tab only.");
      } else if (err.code === "unimplemented") {
        console.warn("CloudSync: Browser does not support offline persistence.");
      }
    });

    /* Online / offline detection */
    window.addEventListener("online", function () {
      isOnline = true;
      updateSyncIndicator("syncing");
      flushPendingQueue();
    });
    window.addEventListener("offline", function () {
      isOnline = false;
      updateSyncIndicator("offline");
    });

    /* Auth state — pull data when user signs in */
    if (window.AuthManager) {
      AuthManager.onAuthStateChanged(function (user) {
        if (user) {
          pullAllFromCloud();
        }
      });
    }

    initialized = true;
    updateSyncIndicator(isOnline ? "synced" : "offline");
  }

  /* ---------- Push to Cloud ---------- */

  /**
   * Save a specific localStorage key's data to Firestore.
   * @param {string} key - The localStorage key name.
   */
  function pushToCloud(key) {
    var uid = getUID();
    if (!uid || !db) {
      queuePending(key);
      return Promise.resolve();
    }

    var raw = localStorage.getItem(key);
    if (raw === null) return Promise.resolve();

    var payload = {
      data: raw,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      localTimestamp: new Date().toISOString()
    };

    updateSyncIndicator("syncing");

    return db
      .collection("users")
      .doc(uid)
      .collection("data")
      .doc(key)
      .set(payload, { merge: true })
      .then(function () {
        removePending(key);
        updateSyncIndicator("synced");
      })
      .catch(function (err) {
        console.error("CloudSync push error (" + key + "):", err);
        queuePending(key);
        updateSyncIndicator("error");
      });
  }

  /**
   * Push ALL syncable keys to Firestore.
   * @returns {Promise}
   */
  function pushAllToCloud() {
    var uid = getUID();
    if (!uid || !db) return Promise.resolve();

    updateSyncIndicator("syncing");
    var promises = SYNC_KEYS.map(function (key) {
      return pushToCloud(key);
    });
    return Promise.all(promises)
      .then(function () {
        updateSyncIndicator("synced");
      })
      .catch(function () {
        updateSyncIndicator("error");
      });
  }

  /* ---------- Pull from Cloud ---------- */

  /**
   * Pull a specific key's data from Firestore and merge with localStorage.
   * Uses timestamp-based conflict resolution: newest wins per key.
   * @param {string} key
   * @returns {Promise}
   */
  function pullFromCloud(key) {
    var uid = getUID();
    if (!uid || !db) return Promise.resolve();

    return db
      .collection("users")
      .doc(uid)
      .collection("data")
      .doc(key)
      .get()
      .then(function (doc) {
        if (!doc.exists) return;

        var cloudData = doc.data();
        var cloudTimestamp = cloudData.localTimestamp || "";
        var localRaw = localStorage.getItem(key);

        /* Timestamp-based conflict resolution */
        if (localRaw !== null) {
          var localMeta = getLocalMeta(key);
          if (localMeta && localMeta.timestamp && cloudTimestamp) {
            if (new Date(localMeta.timestamp) > new Date(cloudTimestamp)) {
              /* Local is newer — push local to cloud instead */
              pushToCloud(key);
              return;
            }
          }
        }

        /* Cloud is newer (or local has no timestamp) — use cloud data */
        if (cloudData.data !== undefined && cloudData.data !== null) {
          localStorage.setItem(key, cloudData.data);
          setLocalMeta(key, cloudTimestamp || new Date().toISOString());
        }
      })
      .catch(function (err) {
        console.error("CloudSync pull error (" + key + "):", err);
      });
  }

  /**
   * Pull ALL syncable keys from Firestore.
   * @returns {Promise}
   */
  function pullAllFromCloud() {
    var uid = getUID();
    if (!uid || !db) return Promise.resolve();

    updateSyncIndicator("syncing");
    var promises = SYNC_KEYS.map(function (key) {
      return pullFromCloud(key);
    });
    return Promise.all(promises)
      .then(function () {
        updateSyncIndicator("synced");
        /* Notify modules to reload from localStorage */
        reloadModules();
      })
      .catch(function () {
        updateSyncIndicator("error");
      });
  }

  /* ---------- Debounced Auto-Sync ---------- */

  /**
   * Schedule a debounced push for a specific key.
   * Call this after every localStorage write.
   * @param {string} key
   */
  function schedulePush(key) {
    if (!initialized) return;

    /* Update local metadata timestamp */
    setLocalMeta(key, new Date().toISOString());

    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(function () {
      pushToCloud(key);
    }, DEBOUNCE_MS);
  }

  /* ---------- Offline Queue ---------- */

  /**
   * Queue a key for syncing when back online.
   */
  function queuePending(key) {
    var pending = getPendingQueue();
    if (pending.indexOf(key) === -1) {
      pending.push(key);
    }
    try {
      localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pending));
    } catch (e) { /* ignore */ }
  }

  function removePending(key) {
    var pending = getPendingQueue();
    var idx = pending.indexOf(key);
    if (idx !== -1) {
      pending.splice(idx, 1);
      try {
        localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(pending));
      } catch (e) { /* ignore */ }
    }
  }

  function getPendingQueue() {
    try {
      var raw = localStorage.getItem(PENDING_QUEUE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Flush all queued changes to cloud.
   */
  function flushPendingQueue() {
    var pending = getPendingQueue();
    if (!pending.length) return;

    pending.forEach(function (key) {
      pushToCloud(key);
    });
  }

  /* ---------- Local Metadata ---------- */

  var META_KEY = "cloud_sync_meta";

  function getLocalMeta(key) {
    try {
      var raw = localStorage.getItem(META_KEY);
      if (!raw) return null;
      var meta = JSON.parse(raw);
      return meta[key] || null;
    } catch (e) {
      return null;
    }
  }

  function setLocalMeta(key, timestamp) {
    try {
      var raw = localStorage.getItem(META_KEY);
      var meta = raw ? JSON.parse(raw) : {};
      meta[key] = { timestamp: timestamp };
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) { /* ignore */ }
  }

  /* ---------- Sync Status Indicator ---------- */

  /**
   * Register callback for cloud sync status.
   * @param {Function} cb - Called with "synced"|"syncing"|"error"|"offline"
   */
  function onStatusChange(cb) {
    statusCallback = cb;
  }

  function updateSyncIndicator(status) {
    /* Update the DOM sync status badge */
    var el = document.getElementById("sync-status");
    if (el) {
      el.className = "sync-status " + status;
      if (status === "synced") {
        el.innerHTML = "&#10003;";
        el.title = "Synced to cloud";
      } else if (status === "syncing") {
        el.innerHTML = "&#10227;";
        el.title = "Syncing\u2026";
      } else if (status === "offline") {
        el.innerHTML = "&#9888;";
        el.title = "Offline \u2014 changes saved locally";
      } else if (status === "error") {
        el.innerHTML = "&#9888;";
        el.title = "Sync error";
      }
    }
    if (statusCallback) statusCallback(status);
  }

  /* ---------- Reload Modules ---------- */

  /**
   * After pulling cloud data, tell each module to reload from localStorage.
   */
  function reloadModules() {
    /* Calendar events */
    if (window.SyncManager && typeof SyncManager.loadEvents === "function") {
      var events = SyncManager.loadEvents();
      if (window.state && Array.isArray(events)) {
        window.state.events = events;
        if (typeof window.renderCurrentView === "function") {
          window.renderCurrentView();
        }
      }
    }

    /* Feature modules — re-init if they have already been initialized */
    var modules = [
      { key: "todo_items",        global: "TodoManager" },
      { key: "pomodoro_sessions", global: "PomodoroTimer" },
      { key: "assignments",       global: "AssignmentTracker" },
      { key: "quick_notes",       global: "NotesManager" },
      { key: "habit_tracker",     global: "HabitTracker" },
      { key: "goal_tracker",      global: "GoalTracker" },
      { key: "bookmarks",         global: "BookmarkManager" }
    ];

    modules.forEach(function (m) {
      var mod = window[m.global];
      if (mod && typeof mod.render === "function") {
        mod.render();
      }
    });
  }

  /* ---------- Helpers ---------- */

  function getUID() {
    if (window.AuthManager) return AuthManager.getUID();
    return null;
  }

  return {
    init: init,
    pushToCloud: pushToCloud,
    pushAllToCloud: pushAllToCloud,
    pullFromCloud: pullFromCloud,
    pullAllFromCloud: pullAllFromCloud,
    schedulePush: schedulePush,
    flushPendingQueue: flushPendingQueue,
    onStatusChange: onStatusChange,
    SYNC_KEYS: SYNC_KEYS
  };
})();
