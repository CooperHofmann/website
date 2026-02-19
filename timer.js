/* ==========================================================================
   Pomodoro Timer + Session Tracker
   ==========================================================================
   Self-contained vanilla JS module (IIFE).
   Exposes window.PomodoroTimer.
   Persists sessions and settings in localStorage.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Constants ---------- */

  var SESSIONS_KEY = "pomodoro_sessions";
  var SETTINGS_KEY = "pomodoro_settings";

  var DEFAULT_SETTINGS = {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakAfter: 4,
  };

  var CATEGORIES = [
    { name: "School", color: "#3B82F6" },
    { name: "Home", color: "#10B981" },
    { name: "Personal", color: "#8B5CF6" },
    { name: "Work", color: "#F59E0B" },
  ];

  var CATEGORY_MAP = {};
  CATEGORIES.forEach(function (c) { CATEGORY_MAP[c.name] = c.color; });

  /* ---------- State ---------- */

  var state = {
    mode: "focus",          // "focus" | "shortBreak" | "longBreak"
    status: "idle",         // "idle" | "running" | "paused"
    remainingSeconds: 0,
    totalSeconds: 0,
    sessionCount: 0,        // completed focus sessions in current cycle
    category: CATEGORIES[0].name,
    taskTitle: "",
    currentStart: null,     // Date ISO string when current timer started
    intervalId: null,
  };

  var settings = loadSettings();
  var container = null;
  var els = {};             // cached DOM references

  /* ---------- Persistence helpers ---------- */

  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY)) || []; }
    catch (_) { return []; }
  }

  function saveSessions(sessions) {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    if (typeof CloudSync !== "undefined") {
      CloudSync.syncToCloud("sessions", sessions);
    }
  }

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      return s ? mergeDefaults(s) : copy(DEFAULT_SETTINGS);
    } catch (_) {
      return copy(DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function mergeDefaults(obj) {
    var out = copy(DEFAULT_SETTINGS);
    Object.keys(out).forEach(function (k) {
      if (obj[k] !== undefined) out[k] = obj[k];
    });
    return out;
  }

  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Timer helpers ---------- */

  function durationForMode(mode) {
    if (mode === "shortBreak") return settings.shortBreakMinutes * 60;
    if (mode === "longBreak") return settings.longBreakMinutes * 60;
    return settings.focusMinutes * 60;
  }

  function modeLabel(mode) {
    if (mode === "shortBreak") return "Short Break";
    if (mode === "longBreak") return "Long Break";
    return "Focus";
  }

  function formatTime(totalSec) {
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function todayStart() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- Notification ---------- */

  function sendNotification(title, body) {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body: body });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(function (perm) {
        if (perm === "granted") new Notification(title, { body: body });
      });
    }
  }

  /* ---------- Core timer logic ---------- */

  function tick() {
    if (state.status !== "running") return;
    state.remainingSeconds--;
    if (state.remainingSeconds <= 0) {
      state.remainingSeconds = 0;
      onTimerComplete();
    }
    render();
  }

  function onTimerComplete() {
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.status = "idle";

    // Log the completed session
    var endTime = new Date().toISOString();
    var dur = state.totalSeconds;
    var entry = {
      id: generateId(),
      startTime: state.currentStart || endTime,
      endTime: endTime,
      duration: dur,
      category: state.category,
      taskTitle: state.taskTitle,
      type: state.mode === "focus" ? "focus" : "break",
    };
    var sessions = loadSessions();
    sessions.push(entry);
    saveSessions(sessions);

    // Advance mode
    if (state.mode === "focus") {
      state.sessionCount++;
      var isLong = state.sessionCount >= settings.longBreakAfter;
      if (isLong) {
        state.mode = "longBreak";
        state.sessionCount = 0;
      } else {
        state.mode = "shortBreak";
      }
      sendNotification("Focus complete!", "Time for a " + modeLabel(state.mode).toLowerCase() + ".");
    } else {
      state.mode = "focus";
      sendNotification("Break over!", "Ready to focus?");
    }

    state.totalSeconds = durationForMode(state.mode);
    state.remainingSeconds = state.totalSeconds;
    state.currentStart = null;
    render();
  }

  /* ---------- Public API ---------- */

  function start() {
    if (state.status === "running") return;
    if (state.status === "idle") {
      state.totalSeconds = durationForMode(state.mode);
      state.remainingSeconds = state.totalSeconds;
      state.currentStart = new Date().toISOString();
    }
    state.status = "running";
    state.intervalId = setInterval(tick, 1000);
    render();
  }

  function pause() {
    if (state.status !== "running") return;
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.status = "paused";
    render();
  }

  function reset() {
    clearInterval(state.intervalId);
    state.intervalId = null;
    state.status = "idle";
    state.totalSeconds = durationForMode(state.mode);
    state.remainingSeconds = state.totalSeconds;
    state.currentStart = null;
    render();
  }

  function getSessions() {
    return loadSessions();
  }

  function getStats() {
    var sessions = loadSessions();
    var totalFocusMinutes = 0;
    var totalSessions = 0;
    var todaySessions = 0;
    var todayMinutes = 0;
    var byCategory = {};
    var ts = todayStart();

    sessions.forEach(function (s) {
      if (s.type === "focus") {
        var mins = Math.round(s.duration / 60);
        totalFocusMinutes += mins;
        totalSessions++;
        if (!byCategory[s.category]) byCategory[s.category] = { sessions: 0, minutes: 0 };
        byCategory[s.category].sessions++;
        byCategory[s.category].minutes += mins;
        if (new Date(s.endTime).getTime() >= ts) {
          todaySessions++;
          todayMinutes += mins;
        }
      }
    });

    return {
      totalFocusMinutes: totalFocusMinutes,
      totalSessions: totalSessions,
      todaySessions: todaySessions,
      todayMinutes: todayMinutes,
      byCategory: byCategory,
    };
  }

  /* ---------- Render / DOM ---------- */

  var SVG_NS = "http://www.w3.org/2000/svg";
  var RING_RADIUS = 90;
  var RING_STROKE = 8;
  var RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

  function buildDOM() {
    container.innerHTML = "";

    var wrapper = el("div", "pomo-wrapper");

    // --- Timer area ---
    var timerArea = el("div", "pomo-timer-area");

    // SVG ring
    var svgSize = (RING_RADIUS + RING_STROKE) * 2;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", svgSize);
    svg.setAttribute("height", svgSize);
    svg.setAttribute("class", "pomo-ring-svg");

    var bgCircle = document.createElementNS(SVG_NS, "circle");
    bgCircle.setAttribute("cx", svgSize / 2);
    bgCircle.setAttribute("cy", svgSize / 2);
    bgCircle.setAttribute("r", RING_RADIUS);
    bgCircle.setAttribute("fill", "none");
    bgCircle.setAttribute("stroke", "#e5e5e5");
    bgCircle.setAttribute("stroke-width", RING_STROKE);

    var fgCircle = document.createElementNS(SVG_NS, "circle");
    fgCircle.setAttribute("cx", svgSize / 2);
    fgCircle.setAttribute("cy", svgSize / 2);
    fgCircle.setAttribute("r", RING_RADIUS);
    fgCircle.setAttribute("fill", "none");
    fgCircle.setAttribute("stroke", CATEGORY_MAP[state.category]);
    fgCircle.setAttribute("stroke-width", RING_STROKE);
    fgCircle.setAttribute("stroke-linecap", "round");
    fgCircle.setAttribute("stroke-dasharray", RING_CIRCUMFERENCE);
    fgCircle.setAttribute("stroke-dashoffset", "0");
    fgCircle.setAttribute("transform", "rotate(-90 " + svgSize / 2 + " " + svgSize / 2 + ")");

    svg.appendChild(bgCircle);
    svg.appendChild(fgCircle);
    els.fgCircle = fgCircle;

    // Center overlay (time + mode)
    var overlay = el("div", "pomo-overlay");
    var modeEl = el("div", "pomo-mode");
    var timeEl = el("div", "pomo-time");
    var sessionEl = el("div", "pomo-session-count");
    overlay.appendChild(modeEl);
    overlay.appendChild(timeEl);
    overlay.appendChild(sessionEl);
    els.modeEl = modeEl;
    els.timeEl = timeEl;
    els.sessionEl = sessionEl;

    var ringContainer = el("div", "pomo-ring-container");
    ringContainer.appendChild(svg);
    ringContainer.appendChild(overlay);
    timerArea.appendChild(ringContainer);

    // Category selector
    var catRow = el("div", "pomo-cat-row");
    var catSelect = document.createElement("select");
    catSelect.className = "pomo-cat-select";
    CATEGORIES.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      if (c.name === state.category) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catSelect.addEventListener("change", function () {
      state.category = catSelect.value;
      render();
    });
    var catDot = el("span", "pomo-cat-dot");
    catRow.appendChild(catDot);
    catRow.appendChild(catSelect);
    els.catDot = catDot;
    timerArea.appendChild(catRow);

    // Task title input
    var taskInput = document.createElement("input");
    taskInput.type = "text";
    taskInput.className = "pomo-task-input";
    taskInput.placeholder = "What are you working on?";
    taskInput.value = state.taskTitle;
    taskInput.addEventListener("input", function () {
      state.taskTitle = taskInput.value;
    });
    timerArea.appendChild(taskInput);
    els.taskInput = taskInput;

    // Controls
    var controls = el("div", "pomo-controls");
    var btnStart = btn("Start", "pomo-btn pomo-btn-start", start);
    var btnPause = btn("Pause", "pomo-btn pomo-btn-pause", pause);
    var btnReset = btn("Reset", "pomo-btn pomo-btn-reset", reset);
    controls.appendChild(btnStart);
    controls.appendChild(btnPause);
    controls.appendChild(btnReset);
    els.btnStart = btnStart;
    els.btnPause = btnPause;
    els.btnReset = btnReset;
    timerArea.appendChild(controls);

    wrapper.appendChild(timerArea);

    // --- Today's session log ---
    var logSection = el("div", "pomo-log-section");
    var logTitle = el("h3", "pomo-log-title");
    logTitle.textContent = "Today\u2019s Sessions";
    logSection.appendChild(logTitle);
    var logList = el("ul", "pomo-log-list");
    els.logList = logList;
    logSection.appendChild(logList);
    wrapper.appendChild(logSection);

    // --- Settings (collapsible) ---
    var settingsSection = el("div", "pomo-settings-section");
    var settingsToggle = btn("\u2699 Settings", "pomo-settings-toggle", function () {
      settingsBody.style.display = settingsBody.style.display === "none" ? "block" : "none";
    });
    var settingsBody = el("div", "pomo-settings-body");
    settingsBody.style.display = "none";

    var fields = [
      { key: "focusMinutes", label: "Focus (min)" },
      { key: "shortBreakMinutes", label: "Short break (min)" },
      { key: "longBreakMinutes", label: "Long break (min)" },
      { key: "longBreakAfter", label: "Long break after" },
    ];

    fields.forEach(function (f) {
      var row = el("div", "pomo-setting-row");
      var lbl = el("label", "pomo-setting-label");
      lbl.textContent = f.label;
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "1";
      inp.className = "pomo-setting-input";
      inp.value = settings[f.key];
      inp.addEventListener("change", function () {
        var v = parseInt(inp.value, 10);
        if (v > 0) {
          settings[f.key] = v;
          saveSettings();
          if (state.status === "idle") {
            state.totalSeconds = durationForMode(state.mode);
            state.remainingSeconds = state.totalSeconds;
          }
          render();
        }
      });
      row.appendChild(lbl);
      row.appendChild(inp);
      settingsBody.appendChild(row);
    });

    settingsSection.appendChild(settingsToggle);
    settingsSection.appendChild(settingsBody);
    wrapper.appendChild(settingsSection);

    // --- Inject styles ---
    injectStyles();

    container.appendChild(wrapper);
  }

  function render() {
    if (!container) return;
    if (!els.timeEl) { buildDOM(); }

    // Progress ring
    var progress = state.totalSeconds > 0
      ? state.remainingSeconds / state.totalSeconds
      : 1;
    var offset = RING_CIRCUMFERENCE * (1 - progress);
    els.fgCircle.setAttribute("stroke-dashoffset", offset);
    els.fgCircle.setAttribute("stroke", CATEGORY_MAP[state.category]);

    // Time & mode
    els.timeEl.textContent = formatTime(state.remainingSeconds);
    els.modeEl.textContent = modeLabel(state.mode);
    els.modeEl.style.color = state.mode === "focus"
      ? CATEGORY_MAP[state.category]
      : "#6e6e73";

    // Session counter
    var current = state.sessionCount + (state.mode === "focus" ? 1 : 0);
    els.sessionEl.textContent = "Session " + current + " of " + settings.longBreakAfter;

    // Category dot
    els.catDot.style.background = CATEGORY_MAP[state.category];

    // Button visibility
    els.btnStart.style.display = state.status === "running" ? "none" : "";
    els.btnPause.style.display = state.status === "running" ? "" : "none";
    els.btnReset.style.display = state.status === "idle" ? "none" : "";

    // Background hint
    var wrapper = container.querySelector(".pomo-wrapper");
    if (wrapper) {
      wrapper.style.backgroundColor = state.status === "running" && state.mode === "focus"
        ? CATEGORY_MAP[state.category] + "0A"
        : "";
    }

    // Today's log
    renderLog();
  }

  function renderLog() {
    var list = els.logList;
    if (!list) return;
    list.innerHTML = "";
    var sessions = loadSessions();
    var ts = todayStart();
    var today = sessions.filter(function (s) {
      return new Date(s.endTime).getTime() >= ts;
    });

    if (today.length === 0) {
      var empty = el("li", "pomo-log-empty");
      empty.textContent = "No sessions yet today.";
      list.appendChild(empty);
      return;
    }

    today.slice().reverse().forEach(function (s) {
      var li = el("li", "pomo-log-item");

      var dot = el("span", "pomo-log-dot");
      dot.style.background = CATEGORY_MAP[s.category] || "#999";

      var time = el("span", "pomo-log-time");
      var d = new Date(s.endTime);
      time.textContent = pad2(d.getHours()) + ":" + pad2(d.getMinutes());

      var dur = el("span", "pomo-log-dur");
      dur.textContent = Math.round(s.duration / 60) + " min";

      var cat = el("span", "pomo-log-cat");
      cat.textContent = s.category;

      var title = el("span", "pomo-log-task");
      title.textContent = s.taskTitle || "\u2014";

      var tag = el("span", "pomo-log-type");
      tag.textContent = s.type;
      tag.classList.add(s.type === "focus" ? "pomo-log-type-focus" : "pomo-log-type-break");

      li.appendChild(dot);
      li.appendChild(time);
      li.appendChild(dur);
      li.appendChild(cat);
      li.appendChild(title);
      li.appendChild(tag);
      list.appendChild(li);
    });
  }

  /* ---------- DOM helpers ---------- */

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function btn(text, cls, handler) {
    var b = document.createElement("button");
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", handler);
    return b;
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- Styles (injected once) ---------- */

  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css = [
      ".pomo-wrapper {",
      "  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
      "  max-width: 420px; margin: 0 auto; padding: 24px;",
      "  border-radius: 16px; transition: background-color 0.4s;",
      "}",

      ".pomo-timer-area { text-align: center; }",

      ".pomo-ring-container {",
      "  position: relative; display: inline-block; margin-bottom: 16px;",
      "}",
      ".pomo-ring-svg { display: block; }",

      ".pomo-overlay {",
      "  position: absolute; inset: 0;",
      "  display: flex; flex-direction: column;",
      "  align-items: center; justify-content: center;",
      "  pointer-events: none;",
      "}",
      ".pomo-mode {",
      "  font-size: 13px; font-weight: 600; text-transform: uppercase;",
      "  letter-spacing: 1px; margin-bottom: 2px;",
      "}",
      ".pomo-time {",
      "  font-size: 42px; font-weight: 700; letter-spacing: -1px;",
      "  color: #1d1d1f;",
      "}",
      ".pomo-session-count {",
      "  font-size: 12px; color: #6e6e73; margin-top: 2px;",
      "}",

      /* Category row */
      ".pomo-cat-row {",
      "  display: flex; align-items: center; justify-content: center;",
      "  gap: 8px; margin-bottom: 10px;",
      "}",
      ".pomo-cat-dot {",
      "  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;",
      "}",
      ".pomo-cat-select {",
      "  font-family: inherit; font-size: 14px; padding: 4px 8px;",
      "  border: 1px solid #e5e5e5; border-radius: 8px;",
      "  background: #fff; color: #1d1d1f; cursor: pointer;",
      "}",

      /* Task input */
      ".pomo-task-input {",
      "  display: block; width: 100%; margin: 0 auto 14px; max-width: 280px;",
      "  font-family: inherit; font-size: 14px; padding: 8px 12px;",
      "  border: 1px solid #e5e5e5; border-radius: 8px;",
      "  text-align: center; outline: none;",
      "}",
      ".pomo-task-input:focus { border-color: #0071e3; }",

      /* Buttons */
      ".pomo-controls { display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; }",
      ".pomo-btn {",
      "  font-family: inherit; font-size: 14px; font-weight: 600;",
      "  padding: 8px 24px; border: none; border-radius: 8px;",
      "  cursor: pointer; transition: opacity 0.2s;",
      "}",
      ".pomo-btn:hover { opacity: 0.85; }",
      ".pomo-btn-start { background: #0071e3; color: #fff; }",
      ".pomo-btn-pause { background: #ff9500; color: #fff; }",
      ".pomo-btn-reset { background: #e5e5e5; color: #1d1d1f; }",

      /* Log */
      ".pomo-log-section { margin-top: 8px; }",
      ".pomo-log-title {",
      "  font-size: 15px; font-weight: 600; margin: 0 0 8px; color: #1d1d1f;",
      "}",
      ".pomo-log-list {",
      "  list-style: none; padding: 0; margin: 0;",
      "  max-height: 220px; overflow-y: auto;",
      "}",
      ".pomo-log-item {",
      "  display: flex; align-items: center; gap: 8px;",
      "  padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;",
      "}",
      ".pomo-log-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }",
      ".pomo-log-time { color: #6e6e73; min-width: 42px; }",
      ".pomo-log-dur { color: #1d1d1f; font-weight: 500; min-width: 48px; }",
      ".pomo-log-cat { color: #6e6e73; min-width: 56px; }",
      ".pomo-log-task { flex: 1; color: #1d1d1f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".pomo-log-type {",
      "  font-size: 11px; font-weight: 600; padding: 2px 6px;",
      "  border-radius: 4px; text-transform: uppercase;",
      "}",
      ".pomo-log-type-focus { background: #dbeafe; color: #2563eb; }",
      ".pomo-log-type-break { background: #d1fae5; color: #059669; }",
      ".pomo-log-empty { color: #6e6e73; font-size: 13px; padding: 8px 0; }",

      /* Settings */
      ".pomo-settings-section { margin-top: 16px; }",
      ".pomo-settings-toggle {",
      "  font-family: inherit; font-size: 13px; font-weight: 500;",
      "  background: none; border: none; color: #6e6e73;",
      "  cursor: pointer; padding: 4px 0;",
      "}",
      ".pomo-settings-toggle:hover { color: #1d1d1f; }",
      ".pomo-settings-body { padding-top: 8px; }",
      ".pomo-setting-row {",
      "  display: flex; align-items: center; justify-content: space-between;",
      "  margin-bottom: 8px;",
      "}",
      ".pomo-setting-label { font-size: 13px; color: #1d1d1f; }",
      ".pomo-setting-input {",
      "  width: 64px; font-family: inherit; font-size: 13px;",
      "  padding: 4px 8px; border: 1px solid #e5e5e5; border-radius: 6px;",
      "  text-align: center;",
      "}",
    ].join("\n");

    var styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  /* ---------- Init ---------- */

  function init(containerEl) {
    container = typeof containerEl === "string"
      ? document.querySelector(containerEl)
      : containerEl;
    if (!container) throw new Error("PomodoroTimer: container element not found");

    settings = loadSettings();
    state.totalSeconds = durationForMode(state.mode);
    state.remainingSeconds = state.totalSeconds;

    // Request notification permission early
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }

    buildDOM();
    render();
  }

  /* ---------- Public interface ---------- */

  window.PomodoroTimer = {
    init: init,
    start: start,
    pause: pause,
    reset: reset,
    getSessions: getSessions,
    getStats: getStats,
    render: render,
  };
})();
