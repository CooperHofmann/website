/* ==========================================================================
   Auth UI — Authentication modal and user info bar controller
   ========================================================================== */

(function () {
  "use strict";

  var modal = null;
  var overlay = null;
  var formTitle = null;
  var usernameInput = null;
  var passwordInput = null;
  var errorMsg = null;
  var submitBtn = null;
  var toggleLink = null;
  var userInfoBar = null;
  var userDisplayName = null;
  var signOutBtn = null;

  var isSignUpMode = false;

  /* ---------- DOM helpers ---------- */

  function $(id) {
    return document.getElementById(id);
  }

  /* ---------- Cloud data loading ---------- */

  /**
   * Map of data type → { storageKey, moduleGlobal, containerElId }
   * Used to reload module state after cloud data arrives.
   */
  var MODULE_MAP = {
    todos:       { storageKey: "todo_items",        moduleGlobal: "TodoManager",       containerId: "tasks-container" },
    notes:       { storageKey: "quick_notes",       moduleGlobal: "NotesManager",      containerId: "notes-container" },
    goals:       { storageKey: "goal_tracker",      moduleGlobal: "GoalTracker",       containerId: "goals-container" },
    bookmarks:   { storageKey: "bookmarks",         moduleGlobal: "BookmarkManager",   containerId: "bookmarks-container" },
    assignments: { storageKey: "assignments",       moduleGlobal: "AssignmentTracker", containerId: "assignments-container" },
    sessions:    { storageKey: "pomodoro_sessions", moduleGlobal: "PomodoroTimer",     containerId: "timer-container" }
  };

  /**
   * Build load callbacks for CloudSync.onSignIn.
   * Each callback writes Firestore data to localStorage and re-initializes
   * the corresponding module if it has already been mounted.
   */
  function buildLoadCallbacks() {
    var callbacks = {};

    // Standard array-based modules
    Object.keys(MODULE_MAP).forEach(function (type) {
      callbacks[type] = (function (cfg) {
        return function (items) {
          if (!Array.isArray(items) || items.length === 0) return;
          try {
            localStorage.setItem(cfg.storageKey, JSON.stringify(items));
          } catch (e) { /* noop */ }
          // Re-init if module is already mounted
          var mod = window[cfg.moduleGlobal];
          var container = document.getElementById(cfg.containerId);
          if (mod && container && typeof mod.init === "function") {
            mod.init(container);
          }
        };
      })(MODULE_MAP[type]);
    });

    // Habits uses a special single-document format
    callbacks["habits"] = function (items) {
      if (!Array.isArray(items) || items.length === 0) return;
      var doc = items[0]; // { id: "habits_data", habits: [], completions: {} }
      if (!doc || !doc.habits) return;
      var habitData = { habits: doc.habits, completions: doc.completions || {} };
      try {
        localStorage.setItem("habit_tracker", JSON.stringify(habitData));
      } catch (e) { /* noop */ }
      var mod = window.HabitTracker;
      var container = document.getElementById("habits-container");
      if (mod && container && typeof mod.init === "function") {
        mod.init(container);
      }
    };

    // Events are handled by SyncManager / app.js; update localStorage only
    callbacks["events"] = function (items) {
      if (!Array.isArray(items) || items.length === 0) return;
      try {
        localStorage.setItem("calendar_events", JSON.stringify(items));
      } catch (e) { /* noop */ }
    };

    return callbacks;
  }

  /* ---------- Real-time listeners ---------- */

  /**
   * Start Firestore real-time listeners for cross-device sync.
   * When data changes on another device, the local module is updated.
   * Detaches any existing listeners first to prevent duplicates.
   */
  function startRealtimeListeners() {
    if (typeof CloudSync === "undefined") return;
    CloudSync.detachListeners();
    var callbacks = buildLoadCallbacks();
    Object.keys(callbacks).forEach(function (type) {
      CloudSync.listenCollection(type, callbacks[type]);
    });
  }

  /* ---------- Show / Hide ---------- */

  function showModal() {
    if (overlay) {
      overlay.classList.remove("auth-hidden");
      if (usernameInput) usernameInput.focus();
    }
  }

  function hideModal() {
    if (overlay) {
      overlay.classList.add("auth-hidden");
    }
    clearError();
    clearForm();
  }

  function clearError() {
    if (errorMsg) errorMsg.textContent = "";
  }

  function clearForm() {
    if (usernameInput) usernameInput.value = "";
    if (passwordInput) passwordInput.value = "";
  }

  function showError(msg) {
    if (errorMsg) errorMsg.textContent = msg;
  }

  function setLoading(loading) {
    if (submitBtn) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading
        ? (isSignUpMode ? "Creating account…" : "Signing in…")
        : (isSignUpMode ? "Create Account" : "Sign In");
    }
  }

  /* ---------- Mode toggle ---------- */

  function setSignUpMode(signUp) {
    isSignUpMode = signUp;
    if (formTitle) formTitle.textContent = signUp ? "Create Account" : "Sign In";
    if (submitBtn) submitBtn.textContent = signUp ? "Create Account" : "Sign In";
    if (toggleLink) {
      var text = signUp ? "Already have an account? " : "Don't have an account? ";
      var linkText = signUp ? "Sign in" : "Sign up";
      var a = document.createElement("a");
      a.href = "#";
      a.id = "auth-toggle-link";
      a.textContent = linkText;
      toggleLink.textContent = text;
      toggleLink.appendChild(a);
      bindToggleLink();
    }
    clearError();
  }

  function bindToggleLink() {
    var link = document.getElementById("auth-toggle-link");
    if (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        setSignUpMode(!isSignUpMode);
      });
    }
  }

  /* ---------- User info bar ---------- */

  function showUserInfo(username) {
    if (userInfoBar) userInfoBar.classList.remove("auth-hidden");
    if (userDisplayName) userDisplayName.textContent = username;
    var avatarEl = document.getElementById("user-avatar-initials");
    if (avatarEl && username) avatarEl.textContent = username.charAt(0).toUpperCase();
  }

  function hideUserInfo() {
    if (userInfoBar) userInfoBar.classList.add("auth-hidden");
  }

  /* ---------- Form submission ---------- */

  function handleSubmit(e) {
    e.preventDefault();
    clearError();

    var username = usernameInput ? usernameInput.value.trim() : "";
    var password = passwordInput ? passwordInput.value : "";

    if (!username) { showError("Please enter a username."); return; }
    if (!password) { showError("Please enter a password."); return; }

    setLoading(true);

    var promise = isSignUpMode
      ? Auth.signUp(username, password)
      : Auth.signIn(username, password);

    promise.then(function () {
      hideModal();
      setLoading(false);
    }).catch(function (err) {
      showError(Auth.friendlyError(err));
      setLoading(false);
    });
  }

  /* ---------- Init ---------- */

  function init() {
    modal         = $("auth-modal");
    overlay       = $("auth-overlay");
    formTitle     = $("auth-form-title");
    usernameInput = $("auth-username");
    passwordInput = $("auth-password");
    errorMsg      = $("auth-error");
    submitBtn     = $("auth-submit");
    toggleLink    = $("auth-toggle");
    userInfoBar   = $("user-info-bar");
    userDisplayName = $("user-display-name");
    signOutBtn    = $("sign-out-btn");

    if (!modal) return; // Auth HTML not present

    // Bind toggle link
    bindToggleLink();

    // Form submit
    var form = $("auth-form");
    if (form) form.addEventListener("submit", handleSubmit);

    // Close on overlay click
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) hideModal();
      });
    }

    // Sign out button
    if (signOutBtn) {
      signOutBtn.addEventListener("click", function () {
        Auth.signOut().catch(function (err) {
          console.error("Sign out error:", err);
        });
      });
    }

    // Keyboard: Escape to close
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && !overlay.classList.contains("auth-hidden")) {
        hideModal();
      }
    });

    // Listen for auth state changes
    Auth.onAuthStateChanged(function (user) {
      if (user) {
        showUserInfo(Auth.getUsername());
        hideModal();
        // Initialize cloud sync and load data from Firestore
        if (typeof CloudSync !== "undefined") {
          CloudSync.onSignIn(user.uid, buildLoadCallbacks()).then(function () {
            // Start real-time listeners after initial data load completes
            startRealtimeListeners();
          });
        }
      } else {
        hideUserInfo();
        if (typeof CloudSync !== "undefined") {
          CloudSync.onSignOut();
        }
        // Show modal only if Firebase is configured (not using placeholders)
        if (isFirebaseConfigured()) {
          setSignUpMode(false);
          showModal();
        }
      }
    });

    // Initialize Firebase Auth listener
    Auth.init();
  }

  /** Returns true if firebase-config.js has real (non-placeholder) credentials. */
  function isFirebaseConfigured() {
    if (typeof firebaseConfig === "undefined") return false;
    return firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
  }

  // Init when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
