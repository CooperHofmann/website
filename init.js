/* ==========================================================================
   Productivity Hub — Tab Navigation & Module Initialization
   ========================================================================== */

(function () {
  "use strict";

  var sectionMap = {
    calendar: { el: "calendar", calendarControls: true },
    tasks: { el: "section-tasks", container: "tasks-container", module: "TodoManager" },
    timer: { el: "section-timer", container: "timer-container", module: "PomodoroTimer" },
    assignments: { el: "section-assignments", container: "assignments-container", module: "AssignmentTracker" },
    notes: { el: "section-notes", container: "notes-container", module: "NotesManager" },
    dashboard: { el: "section-dashboard", container: "dashboard-container", module: "Dashboard" },
    habits: { el: "section-habits", container: "habits-container", module: "HabitTracker" },
    goals: { el: "section-goals", container: "goals-container", module: "GoalTracker" },
    bookmarks: { el: "section-bookmarks", container: "bookmarks-container", module: "BookmarkManager" }
  };

  var initialized = {};
  var activeSection = "calendar";

  function switchSection(sectionKey) {
    if (sectionKey === "focus") {
      if (window.FocusMode) {
        window.FocusMode.init();
        window.FocusMode.enter("", "personal");
      }
      return;
    }

    var navBtns = document.querySelectorAll(".main-nav-btn");
    for (var i = 0; i < navBtns.length; i++) {
      var btn = navBtns[i];
      var isActive = btn.getAttribute("data-section") === sectionKey;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    }

    /* Hide all sections */
    var keys = Object.keys(sectionMap);
    for (var j = 0; j < keys.length; j++) {
      var sec = sectionMap[keys[j]];
      var secEl = document.getElementById(sec.el);
      if (secEl) secEl.style.display = "none";
    }

    /* Show selected section */
    var cfg = sectionMap[sectionKey];
    if (!cfg) return;
    var target = document.getElementById(cfg.el);
    if (target) target.style.display = "";

    /* Show/hide calendar-specific topbar controls */
    var topbarCenter = document.querySelector(".topbar-center");
    var topbarCalendarBtns = document.querySelector(".topbar-right .view-switcher");
    var addEventBtn = document.getElementById("add-event-btn");
    if (topbarCenter) topbarCenter.style.display = cfg.calendarControls ? "" : "none";
    if (topbarCalendarBtns) topbarCalendarBtns.style.display = cfg.calendarControls ? "" : "none";
    if (addEventBtn) addEventBtn.style.display = cfg.calendarControls ? "" : "none";

    /* Initialize module on first visit */
    if (cfg.module && !initialized[sectionKey]) {
      var mod = window[cfg.module];
      var container = document.getElementById(cfg.container);
      if (mod && container && typeof mod.init === "function") {
        mod.init(container);
        initialized[sectionKey] = true;
      }
    }

    /* Re-render dashboard each time it's shown (aggregates data) */
    if (sectionKey === "dashboard" && window.Dashboard && typeof window.Dashboard.render === "function") {
      window.Dashboard.render();
    }

    activeSection = sectionKey;
  }

  /* Bind nav buttons */
  document.addEventListener("DOMContentLoaded", function () {
    var navBtns = document.querySelectorAll(".main-nav-btn");
    for (var i = 0; i < navBtns.length; i++) {
      navBtns[i].addEventListener("click", function () {
        switchSection(this.getAttribute("data-section"));
      });
    }

    /* Initialize FocusMode (it creates its own overlay) */
    if (window.FocusMode) {
      window.FocusMode.init();
    }

    /* Initialize Firebase Auth + Cloud Sync */
    if (window.AuthManager) {
      AuthManager.init();
      AuthManager.bindUI();
    }
    if (window.CloudSync) {
      CloudSync.init();
    }

    /* Keyboard shortcuts: Alt+1..9 for sections, Alt+0 for focus */
    document.addEventListener("keydown", function (e) {
      if (!e.altKey) return;
      var shortcuts = {
        "1": "calendar",
        "2": "tasks",
        "3": "timer",
        "4": "assignments",
        "5": "notes",
        "6": "dashboard",
        "7": "habits",
        "8": "goals",
        "9": "bookmarks",
        "0": "focus"
      };
      if (shortcuts[e.key]) {
        e.preventDefault();
        switchSection(shortcuts[e.key]);
      }
    });
  });

})();
