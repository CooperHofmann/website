/* ==========================================================================
   Focus Mode
   ==========================================================================
   Full-screen overlay that hides everything except the current task, timer,
   and a scratch-pad notes area.  Vanilla JS IIFE — no dependencies.
   Exposes window.FocusMode.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Constants ---------- */

  var CATEGORY_COLORS = {
    School:   "#3B82F6",
    Home:     "#10B981",
    Personal: "#8B5CF6",
    Work:     "#F59E0B",
  };

  var OVERLAY_ID = "focus-mode-overlay";
  var TRANSITION_MS = 300;
  var DEFAULT_COUNTDOWN_SECONDS = 25 * 60;

  var MOTIVATIONAL_TEXTS = [
    "Stay focused. You\u2019re doing great.",
    "One task at a time.",
    "Deep work leads to deep results.",
    "Keep going \u2014 progress compounds.",
    "Block out the noise.",
  ];

  /* ---------- State ---------- */

  var active = false;
  var overlay = null;
  var els = {};
  var countdownInterval = null;
  var countdownSeconds = DEFAULT_COUNTDOWN_SECONDS;
  var clockInterval = null;

  /* ---------- Helpers ---------- */

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function formatTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = totalSeconds % 60;
    return pad(m) + ":" + pad(s);
  }

  function currentTimeString() {
    var d = new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function randomMotivation() {
    return MOTIVATIONAL_TEXTS[Math.floor(Math.random() * MOTIVATIONAL_TEXTS.length)];
  }

  function categoryColor(cat) {
    return CATEGORY_COLORS[cat] || "#6B7280";
  }

  /* ---------- DOM construction ---------- */

  function buildOverlay() {
    var el = document.createElement("div");
    el.id = OVERLAY_ID;
    Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9999",
      background: "#F9FAFB",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      opacity: "0",
      transition: "opacity " + TRANSITION_MS + "ms ease",
      overflow: "auto",
    });
    return el;
  }

  function buildTopBar() {
    var bar = document.createElement("div");
    Object.assign(bar.style, {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "20px 32px",
      boxSizing: "border-box",
    });

    var clock = document.createElement("span");
    Object.assign(clock.style, {
      fontSize: "14px",
      color: "#6B7280",
      fontVariantNumeric: "tabular-nums",
    });
    clock.textContent = currentTimeString();
    els.clock = clock;

    var btn = document.createElement("button");
    btn.textContent = "Exit Focus Mode";
    Object.assign(btn.style, {
      padding: "8px 18px",
      border: "1px solid #D1D5DB",
      borderRadius: "8px",
      background: "#fff",
      color: "#374151",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background 0.15s",
    });
    btn.addEventListener("mouseenter", function () { btn.style.background = "#F3F4F6"; });
    btn.addEventListener("mouseleave", function () { btn.style.background = "#fff"; });
    btn.addEventListener("click", exit);

    bar.appendChild(clock);
    bar.appendChild(btn);
    return bar;
  }

  function buildCenter(taskTitle, category) {
    var wrap = document.createElement("div");
    Object.assign(wrap.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "24px",
      maxWidth: "560px",
      width: "100%",
      padding: "0 24px",
      boxSizing: "border-box",
    });

    /* Task title */
    var title = document.createElement("h1");
    title.textContent = taskTitle || "Focus Time";
    Object.assign(title.style, {
      margin: "0",
      fontSize: "36px",
      fontWeight: "700",
      color: "#111827",
      textAlign: "center",
      lineHeight: "1.25",
      letterSpacing: "-0.025em",
      wordBreak: "break-word",
    });
    els.title = title;
    wrap.appendChild(title);

    /* Category badge */
    if (category) {
      var badge = document.createElement("span");
      badge.textContent = category;
      var color = categoryColor(category);
      Object.assign(badge.style, {
        display: "inline-block",
        padding: "4px 14px",
        borderRadius: "9999px",
        fontSize: "13px",
        fontWeight: "600",
        color: "#fff",
        background: color,
      });
      wrap.appendChild(badge);
    }

    /* Timer display */
    var timerWrap = document.createElement("div");
    Object.assign(timerWrap.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "12px",
    });

    var timerText = document.createElement("div");
    timerText.textContent = formatTime(countdownSeconds);
    Object.assign(timerText.style, {
      fontSize: "64px",
      fontWeight: "300",
      color: "#1F2937",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.04em",
    });
    els.timerText = timerText;
    timerWrap.appendChild(timerText);

    var timerLabel = document.createElement("div");
    timerLabel.textContent = "";
    Object.assign(timerLabel.style, {
      fontSize: "13px",
      color: "#9CA3AF",
    });
    els.timerLabel = timerLabel;
    timerWrap.appendChild(timerLabel);

    /* Timer controls */
    var controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "flex",
      gap: "10px",
    });

    var startBtn = document.createElement("button");
    startBtn.textContent = "Start";
    styleTimerBtn(startBtn, "#10B981");
    els.startBtn = startBtn;

    var pauseBtn = document.createElement("button");
    pauseBtn.textContent = "Pause";
    styleTimerBtn(pauseBtn, "#F59E0B");
    pauseBtn.style.display = "none";
    els.pauseBtn = pauseBtn;

    var resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset";
    styleTimerBtn(resetBtn, "#6B7280");
    els.resetBtn = resetBtn;

    controls.appendChild(startBtn);
    controls.appendChild(pauseBtn);
    controls.appendChild(resetBtn);
    timerWrap.appendChild(controls);

    wrap.appendChild(timerWrap);

    /* Focus notes textarea */
    var notesLabel = document.createElement("label");
    notesLabel.textContent = "Focus Notes";
    Object.assign(notesLabel.style, {
      fontSize: "12px",
      fontWeight: "600",
      color: "#9CA3AF",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      alignSelf: "flex-start",
    });
    wrap.appendChild(notesLabel);

    var notes = document.createElement("textarea");
    notes.placeholder = "Jot down quick thoughts\u2026";
    Object.assign(notes.style, {
      width: "100%",
      minHeight: "100px",
      padding: "14px",
      border: "1px solid #E5E7EB",
      borderRadius: "10px",
      fontSize: "15px",
      fontFamily: "inherit",
      resize: "vertical",
      outline: "none",
      boxSizing: "border-box",
      color: "#374151",
      background: "#fff",
      transition: "border-color 0.15s",
    });
    notes.addEventListener("focus", function () { notes.style.borderColor = "#A5B4FC"; });
    notes.addEventListener("blur", function () { notes.style.borderColor = "#E5E7EB"; });
    // Don't let Escape propagate while typing
    notes.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        notes.blur();
      }
    });
    els.notes = notes;
    wrap.appendChild(notes);

    return wrap;
  }

  function buildBottom() {
    var footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "24px 32px",
      fontSize: "13px",
      color: "#D1D5DB",
      textAlign: "center",
      userSelect: "none",
    });
    footer.textContent = randomMotivation();
    return footer;
  }

  function styleTimerBtn(btn, color) {
    Object.assign(btn.style, {
      padding: "6px 16px",
      border: "none",
      borderRadius: "6px",
      background: color,
      color: "#fff",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "opacity 0.15s",
    });
    btn.addEventListener("mouseenter", function () { btn.style.opacity = "0.85"; });
    btn.addEventListener("mouseleave", function () { btn.style.opacity = "1"; });
  }

  /* ---------- Timer logic ---------- */

  function hasPomodoroTimer() {
    return typeof window.PomodoroTimer !== "undefined" &&
           typeof window.PomodoroTimer.start === "function";
  }

  function syncFromPomodoro() {
    if (!hasPomodoroTimer()) return false;
    var stats = window.PomodoroTimer.getStats();
    if (stats && typeof stats.todayMinutes === "number") {
      els.timerLabel.textContent = "Today: " + stats.todayMinutes + " min focused";
    }
    return true;
  }

  function startBuiltinCountdown() {
    if (countdownInterval) return;
    els.startBtn.style.display = "none";
    els.pauseBtn.style.display = "";
    countdownInterval = setInterval(function () {
      if (countdownSeconds <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        els.timerText.textContent = "00:00";
        els.timerLabel.textContent = "Session complete!";
        els.startBtn.textContent = "Restart";
        els.startBtn.style.display = "";
        els.pauseBtn.style.display = "none";
        return;
      }
      countdownSeconds--;
      els.timerText.textContent = formatTime(countdownSeconds);
    }, 1000);
  }

  function pauseBuiltinCountdown() {
    if (!countdownInterval) return;
    clearInterval(countdownInterval);
    countdownInterval = null;
    els.startBtn.textContent = "Resume";
    els.startBtn.style.display = "";
    els.pauseBtn.style.display = "none";
  }

  function resetBuiltinCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    countdownSeconds = DEFAULT_COUNTDOWN_SECONDS;
    els.timerText.textContent = formatTime(countdownSeconds);
    els.timerLabel.textContent = "";
    els.startBtn.textContent = "Start";
    els.startBtn.style.display = "";
    els.pauseBtn.style.display = "none";
  }

  function wireTimerControls() {
    if (hasPomodoroTimer()) {
      els.startBtn.addEventListener("click", function () {
        window.PomodoroTimer.start();
        els.startBtn.style.display = "none";
        els.pauseBtn.style.display = "";
      });
      els.pauseBtn.addEventListener("click", function () {
        window.PomodoroTimer.pause();
        els.startBtn.textContent = "Resume";
        els.startBtn.style.display = "";
        els.pauseBtn.style.display = "none";
      });
      els.resetBtn.addEventListener("click", function () {
        window.PomodoroTimer.reset();
        els.startBtn.textContent = "Start";
        els.startBtn.style.display = "";
        els.pauseBtn.style.display = "none";
        syncFromPomodoro();
      });
    } else {
      els.startBtn.addEventListener("click", startBuiltinCountdown);
      els.pauseBtn.addEventListener("click", pauseBuiltinCountdown);
      els.resetBtn.addEventListener("click", resetBuiltinCountdown);
    }
  }

  /* ---------- Keyboard handling ---------- */

  function onKeyDown(e) {
    if (e.key === "Escape" && active) {
      exit();
    }
  }

  /* ---------- Clock tick ---------- */

  function startClock() {
    clockInterval = setInterval(function () {
      if (els.clock) {
        els.clock.textContent = currentTimeString();
      }
      syncFromPomodoro();
    }, 10000);
  }

  function stopClock() {
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  /* ---------- Public API ---------- */

  function init() {
    document.addEventListener("keydown", onKeyDown);
  }

  function enter(taskTitle, category) {
    if (active) return;
    active = true;
    els = {};

    // Reset built-in countdown each session
    countdownSeconds = DEFAULT_COUNTDOWN_SECONDS;

    // Build DOM
    overlay = buildOverlay();
    overlay.appendChild(buildTopBar());
    overlay.appendChild(buildCenter(taskTitle, category));
    overlay.appendChild(buildBottom());

    wireTimerControls();
    syncFromPomodoro();

    document.body.appendChild(overlay);

    // Hide page scrollbar
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Fade in
    requestAnimationFrame(function () {
      overlay.style.opacity = "1";
    });

    startClock();
  }

  function exit() {
    if (!active) return;
    active = false;

    // Pause built-in timer if running
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    stopClock();

    // Restore page scrollbar
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";

    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(function () {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        overlay = null;
        els = {};
      }, TRANSITION_MS);
    }
  }

  function isActive() {
    return active;
  }

  function render() {
    // No-op — focus mode manages its own overlay
  }

  /* ---------- Expose module ---------- */

  window.FocusMode = {
    init: init,
    enter: enter,
    exit: exit,
    isActive: isActive,
    render: render,
  };
})();
