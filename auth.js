/* ==========================================================================
   Auth Manager — Firebase Authentication (email/password + Google sign-in)
   ========================================================================== */

var AuthManager = (function () {
  "use strict";

  var currentUser = null;
  var authStateCallbacks = [];
  var auth = null;
  var googleProvider = null;

  /**
   * Initialize Firebase Auth.
   * Must be called after Firebase SDK is loaded and firebase.initializeApp() done.
   */
  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) {
      console.warn("AuthManager: Firebase Auth SDK not loaded.");
      return;
    }
    auth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();

    /* Enable persistence so auth state survives page refresh */
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    /* Listen for auth state changes */
    auth.onAuthStateChanged(function (user) {
      currentUser = user;
      notifyListeners(user);
      updateAuthUI(user);
    });
  }

  /* ---------- Email / Password ---------- */

  /**
   * Sign up with email and password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise}
   */
  function signUp(email, password) {
    if (!auth) return Promise.reject(new Error("Auth not initialized"));
    return auth.createUserWithEmailAndPassword(email, password);
  }

  /**
   * Sign in with email and password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise}
   */
  function signIn(email, password) {
    if (!auth) return Promise.reject(new Error("Auth not initialized"));
    return auth.signInWithEmailAndPassword(email, password);
  }

  /* ---------- Google Sign-In ---------- */

  /**
   * Sign in with Google popup.
   * @returns {Promise}
   */
  function signInWithGoogle() {
    if (!auth) return Promise.reject(new Error("Auth not initialized"));
    return auth.signInWithPopup(googleProvider);
  }

  /* ---------- Sign Out ---------- */

  /**
   * Sign out the current user.
   * @returns {Promise}
   */
  function signOut() {
    if (!auth) return Promise.reject(new Error("Auth not initialized"));
    return auth.signOut();
  }

  /* ---------- State ---------- */

  /**
   * Get the current authenticated user (or null).
   * @returns {object|null}
   */
  function getUser() {
    return currentUser;
  }

  /**
   * Get the current user's UID, or null if not logged in.
   * @returns {string|null}
   */
  function getUID() {
    return currentUser ? currentUser.uid : null;
  }

  /**
   * Register a callback for auth state changes.
   * @param {Function} callback - Called with (user|null).
   */
  function onAuthStateChanged(callback) {
    authStateCallbacks.push(callback);
    /* Fire immediately with current state */
    if (auth) callback(currentUser);
  }

  /* ---------- Internal ---------- */

  function notifyListeners(user) {
    for (var i = 0; i < authStateCallbacks.length; i++) {
      try {
        authStateCallbacks[i](user);
      } catch (e) {
        console.error("Auth listener error:", e);
      }
    }
  }

  /**
   * Update auth-related UI elements.
   */
  function updateAuthUI(user) {
    var authBtn = document.getElementById("auth-btn");
    var authLabel = document.getElementById("auth-label");
    if (!authBtn) return;

    if (user) {
      authBtn.title = "Signed in as " + (user.email || user.displayName || "User");
      if (authLabel) authLabel.textContent = user.displayName || user.email || "Account";
      authBtn.classList.add("signed-in");
    } else {
      authBtn.title = "Sign in to sync across devices";
      if (authLabel) authLabel.textContent = "Sign In";
      authBtn.classList.remove("signed-in");
    }
  }

  /* ---------- Auth Modal UI ---------- */

  /**
   * Show the auth modal for login / signup.
   */
  function showAuthModal() {
    var modal = document.getElementById("auth-modal");
    if (modal) modal.classList.remove("hidden");
    var emailField = document.getElementById("auth-email");
    if (emailField) emailField.focus();
  }

  /**
   * Hide the auth modal.
   */
  function hideAuthModal() {
    var modal = document.getElementById("auth-modal");
    if (modal) modal.classList.add("hidden");
    clearAuthError();
  }

  /**
   * Display an error in the auth modal.
   */
  function showAuthError(msg) {
    var el = document.getElementById("auth-error");
    if (el) el.textContent = msg;
  }

  function clearAuthError() {
    var el = document.getElementById("auth-error");
    if (el) el.textContent = "";
  }

  /**
   * Bind all auth modal event listeners.
   * Call once after DOM is ready.
   */
  function bindUI() {
    /* Auth button in topbar */
    var authBtn = document.getElementById("auth-btn");
    if (authBtn) {
      authBtn.addEventListener("click", function () {
        if (currentUser) {
          /* Already signed in — show sign-out option */
          if (confirm("Signed in as " + (currentUser.email || currentUser.displayName) + ".\n\nSign out?")) {
            signOut();
          }
        } else {
          showAuthModal();
        }
      });
    }

    /* Close modal */
    var closeBtn = document.getElementById("auth-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", hideAuthModal);

    /* Click backdrop to close */
    var modal = document.getElementById("auth-modal");
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) hideAuthModal();
      });
    }

    /* Toggle between Sign In and Sign Up */
    var toggleLink = document.getElementById("auth-toggle");
    var formTitle = document.getElementById("auth-form-title");
    var submitBtn = document.getElementById("auth-submit-btn");
    var isSignUp = false;

    if (toggleLink) {
      toggleLink.addEventListener("click", function (e) {
        e.preventDefault();
        isSignUp = !isSignUp;
        if (formTitle) formTitle.textContent = isSignUp ? "Create Account" : "Sign In";
        if (submitBtn) submitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
        toggleLink.textContent = isSignUp ? "Already have an account? Sign in" : "Don\u2019t have an account? Sign up";
        clearAuthError();
      });
    }

    /* Submit (sign in or sign up) */
    if (submitBtn) {
      submitBtn.addEventListener("click", function () {
        var email = (document.getElementById("auth-email").value || "").trim();
        var password = document.getElementById("auth-password").value || "";
        clearAuthError();

        if (!email || !password) {
          showAuthError("Please enter both email and password.");
          return;
        }
        if (password.length < 6) {
          showAuthError("Password must be at least 6 characters.");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Please wait\u2026";

        var promise = isSignUp ? signUp(email, password) : signIn(email, password);
        promise
          .then(function () {
            hideAuthModal();
          })
          .catch(function (err) {
            showAuthError(friendlyError(err.code));
          })
          .finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = isSignUp ? "Sign Up" : "Sign In";
          });
      });
    }

    /* Google sign-in */
    var googleBtn = document.getElementById("auth-google-btn");
    if (googleBtn) {
      googleBtn.addEventListener("click", function () {
        clearAuthError();
        signInWithGoogle()
          .then(function () {
            hideAuthModal();
          })
          .catch(function (err) {
            showAuthError(friendlyError(err.code));
          });
      });
    }

    /* Allow Enter key in password field */
    var pwField = document.getElementById("auth-password");
    if (pwField) {
      pwField.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && submitBtn) submitBtn.click();
      });
    }
  }

  /**
   * Convert Firebase error codes to user-friendly messages.
   */
  function friendlyError(code) {
    var msgs = {
      "auth/email-already-in-use": "This email is already registered. Try signing in.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password. Please try again.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/too-many-requests": "Too many attempts. Please try again later.",
      "auth/popup-closed-by-user": "Sign-in popup was closed.",
      "auth/network-request-failed": "Network error. Check your connection.",
      "auth/invalid-credential": "Invalid credentials. Please try again."
    };
    return msgs[code] || "Authentication failed. Please try again.";
  }

  return {
    init: init,
    signUp: signUp,
    signIn: signIn,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getUser: getUser,
    getUID: getUID,
    onAuthStateChanged: onAuthStateChanged,
    showAuthModal: showAuthModal,
    hideAuthModal: hideAuthModal,
    bindUI: bindUI
  };
})();
