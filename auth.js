/* ==========================================================================
   Auth — Firebase Authentication with username/password
   ==========================================================================
   Converts a username to a fake email (username@cooperapp.local) so that
   Firebase Email/Password auth works without real email addresses.
   ========================================================================== */

var Auth = (function () {
  "use strict";

  var FAKE_EMAIL_DOMAIN = "@cooperapp.local";

  var currentUser = null;
  var authStateCallbacks = [];

  /** Convert a username string to a fake email address. */
  function usernameToEmail(username) {
    return username.trim().toLowerCase() + FAKE_EMAIL_DOMAIN;
  }

  /** Extract the username from a fake email address. */
  function emailToUsername(email) {
    if (!email) return "";
    return email.replace(FAKE_EMAIL_DOMAIN, "");
  }

  /**
   * Return a user-friendly message for a Firebase Auth error code.
   * @param {Error} err - Firebase Auth error.
   * @returns {string}
   */
  function friendlyError(err) {
    var code = err && err.code ? err.code : "";
    var messages = {
      "auth/user-not-found":       "No account found with that username.",
      "auth/wrong-password":       "Incorrect password. Please try again.",
      "auth/email-already-in-use": "That username is already taken.",
      "auth/weak-password":        "Password must be at least 6 characters.",
      "auth/invalid-email":        "Invalid username format.",
      "auth/too-many-requests":    "Too many attempts. Please wait a moment and try again.",
      "auth/network-request-failed": "Network error. Check your internet connection.",
      "auth/user-disabled":        "This account has been disabled.",
      "auth/invalid-credential":   "Incorrect username or password."
    };
    return messages[code] || (err && err.message) || "An unexpected error occurred.";
  }

  /**
   * Sign up a new user with a username and password.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<firebase.User>}
   */
  function signUp(username, password) {
    if (!username || !username.trim()) {
      return Promise.reject(new Error("Username is required."));
    }
    if (!password) {
      return Promise.reject(new Error("Password is required."));
    }
    var email = usernameToEmail(username);
    return firebase.auth().createUserWithEmailAndPassword(email, password)
      .then(function (cred) {
        return cred.user;
      });
  }

  /**
   * Sign in an existing user with username and password.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<firebase.User>}
   */
  function signIn(username, password) {
    if (!username || !username.trim()) {
      return Promise.reject(new Error("Username is required."));
    }
    if (!password) {
      return Promise.reject(new Error("Password is required."));
    }
    var email = usernameToEmail(username);
    return firebase.auth().signInWithEmailAndPassword(email, password)
      .then(function (cred) {
        return cred.user;
      });
  }

  /**
   * Sign out the current user.
   * @returns {Promise<void>}
   */
  function signOut() {
    return firebase.auth().signOut();
  }

  /**
   * Get the currently signed-in user object, or null.
   * @returns {firebase.User|null}
   */
  function getUser() {
    return currentUser;
  }

  /**
   * Get the username of the currently signed-in user.
   * @returns {string}
   */
  function getUsername() {
    if (!currentUser || !currentUser.email) return "";
    return emailToUsername(currentUser.email);
  }

  /**
   * Register a callback to be invoked when auth state changes.
   * @param {Function} callback - Receives the Firebase user (or null).
   */
  function onAuthStateChanged(callback) {
    authStateCallbacks.push(callback);
  }

  /** Initialize the Firebase Auth listener. Called once on page load. */
  function init() {
    if (typeof firebase === "undefined" || !firebase.auth) {
      console.warn("Auth: Firebase not available.");
      return;
    }
    firebase.auth().onAuthStateChanged(function (user) {
      currentUser = user;
      for (var i = 0; i < authStateCallbacks.length; i++) {
        try {
          authStateCallbacks[i](user);
        } catch (e) {
          console.error("Auth state callback error:", e);
        }
      }
    });
  }

  return {
    init: init,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    getUser: getUser,
    getUsername: getUsername,
    friendlyError: friendlyError,
    onAuthStateChanged: onAuthStateChanged
  };
})();
