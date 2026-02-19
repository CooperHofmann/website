/* ==========================================================================
   Habit Tracker — Weekly habit grid with streaks & completion tracking
   ==========================================================================
   Self-contained vanilla JS module (IIFE).
   Exposes window.HabitTracker.
   Persists habits and completions in localStorage.
   ========================================================================== */

var HabitTracker = (function () {
  "use strict";

  /* ---------- Constants ---------- */

  var STORAGE_KEY = "habit_tracker";

  var CATEGORIES = {
    school:   { label: "School",   color: "#3B82F6" },
    home:     { label: "Home",     color: "#10B981" },
    personal: { label: "Personal", color: "#8B5CF6" },
    work:     { label: "Work",     color: "#F59E0B" }
  };

  var DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /* ---------- State ---------- */

  var data = { habits: [], completions: {} };
  var containerEl = null;
  var weekOffset = 0; // 0 = current week, -1 = last week, etc.

  /* ---------- Persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (window.CloudSync) CloudSync.schedulePush(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to save habit data:", e);
    }
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return { habits: [], completions: {} };
      var parsed = JSON.parse(stored);
      if (!parsed || !Array.isArray(parsed.habits)) {
        return { habits: [], completions: {} };
      }
      if (typeof parsed.completions !== "object" || parsed.completions === null) {
        parsed.completions = {};
      }
      return parsed;
    } catch (e) {
      console.error("Failed to load habit data:", e);
      return { habits: [], completions: {} };
    }
  }

  /* ---------- Helpers ---------- */

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "habit-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  function formatDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseDate(str) {
    var parts = str.split("-");
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  /** Return Monday of the week containing `date`. */
  function getMonday(date) {
    var d = new Date(date);
    var day = d.getDay(); // 0=Sun, 1=Mon...6=Sat
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /** Return array of 7 Date objects (Mon-Sun) for the displayed week. */
  function getWeekDates() {
    var today = new Date();
    var monday = getMonday(today);
    monday.setDate(monday.getDate() + weekOffset * 7);
    var dates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  function completionKey(habitId, dateStr) {
    return habitId + "_" + dateStr;
  }

  function activeHabits() {
    return data.habits.filter(function (h) { return !h.archived; });
  }

  /* ---------- DOM Helpers ---------- */

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function btn(text, cls, handler) {
    var b = document.createElement("button");
    if (cls) b.className = cls;
    b.textContent = text;
    b.addEventListener("click", handler);
    return b;
  }

  /* ---------- Public API ---------- */

  function init(elContainer) {
    containerEl = elContainer;
    data = load();
    render();
  }

  function addHabit(name, category) {
    var trimmed = (name || "").trim();
    if (!trimmed) return;
    if (!CATEGORIES[category]) category = "personal";
    data.habits.push({
      id: generateId(),
      name: trimmed,
      category: category,
      createdAt: new Date().toISOString(),
      archived: false
    });
    save();
    render();
  }

  function deleteHabit(id) {
    for (var i = 0; i < data.habits.length; i++) {
      if (data.habits[i].id === id) {
        data.habits[i].archived = true;
        break;
      }
    }
    save();
    render();
  }

  function toggleDay(habitId, dateStr) {
    var key = completionKey(habitId, dateStr);
    data.completions[key] = !data.completions[key];
    save();
    render();
  }

  function getStreak(habitId) {
    var streak = 0;
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    // Check today first; if not completed today, start from yesterday
    var key = completionKey(habitId, formatDate(d));
    if (!data.completions[key]) {
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      key = completionKey(habitId, formatDate(d));
      if (data.completions[key]) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function getStats() {
    var habits = activeHabits();
    var totalHabits = habits.length;
    var streaks = habits.map(function (h) { return getStreak(h.id); });
    var activeStreaks = streaks.filter(function (s) { return s > 0; }).length;
    var longestStreak = streaks.length ? Math.max.apply(null, streaks) : 0;

    // Completion rate: completions in last 7 days / (habits × 7)
    var total = 0;
    var completed = 0;
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    for (var i = 0; i < 7; i++) {
      var dateStr = formatDate(d);
      for (var j = 0; j < habits.length; j++) {
        total++;
        if (data.completions[completionKey(habits[j].id, dateStr)]) {
          completed++;
        }
      }
      d.setDate(d.getDate() - 1);
    }
    var completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      totalHabits: totalHabits,
      activeStreaks: activeStreaks,
      longestStreak: longestStreak,
      completionRate: completionRate
    };
  }

  /* ---------- Render ---------- */

  function render() {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    var wrapper = el("div", "habit-tracker");
    wrapper.style.cssText = "font-family:var(--font,Inter,system-ui,sans-serif);" +
      "max-width:720px;margin:0 auto;";

    wrapper.appendChild(buildAddForm());
    wrapper.appendChild(buildWeekNav());
    wrapper.appendChild(buildGrid());
    wrapper.appendChild(buildSummary());

    containerEl.appendChild(wrapper);
  }

  /* --- Add Habit Form --- */

  function buildAddForm() {
    var form = el("div", "habit-add-form");
    form.style.cssText = "display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "New habit\u2026";
    input.style.cssText = "flex:1;min-width:140px;padding:8px 12px;border:1px solid var(--border,#e5e5e5);" +
      "border-radius:var(--radius-sm,8px);font-size:14px;background:var(--surface,#fff);" +
      "color:var(--text,#1d1d1f);outline:none;";

    var select = document.createElement("select");
    select.style.cssText = "padding:8px 12px;border:1px solid var(--border,#e5e5e5);" +
      "border-radius:var(--radius-sm,8px);font-size:14px;background:var(--surface,#fff);" +
      "color:var(--text,#1d1d1f);cursor:pointer;";
    var catKeys = Object.keys(CATEGORIES);
    for (var i = 0; i < catKeys.length; i++) {
      var opt = document.createElement("option");
      opt.value = catKeys[i];
      opt.textContent = CATEGORIES[catKeys[i]].label;
      select.appendChild(opt);
    }

    var addBtn = btn("Add", "", function () {
      addHabit(input.value, select.value);
      input.value = "";
    });
    addBtn.style.cssText = "padding:8px 20px;border:none;border-radius:var(--radius-sm,8px);" +
      "background:var(--accent,#0071e3);color:#fff;font-size:14px;font-weight:600;" +
      "cursor:pointer;";

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        addHabit(input.value, select.value);
        input.value = "";
      }
    });

    form.appendChild(input);
    form.appendChild(select);
    form.appendChild(addBtn);
    return form;
  }

  /* --- Week Navigation --- */

  function buildWeekNav() {
    var dates = getWeekDates();
    var nav = el("div", "habit-week-nav");
    nav.style.cssText = "display:flex;align-items:center;justify-content:space-between;" +
      "margin-bottom:12px;";

    var prevBtn = btn("\u2190", "", function () { weekOffset--; render(); });
    prevBtn.style.cssText = "background:none;border:1px solid var(--border,#e5e5e5);" +
      "border-radius:var(--radius-sm,8px);padding:4px 10px;cursor:pointer;" +
      "font-size:16px;color:var(--text,#1d1d1f);";

    var label = el("span");
    var startStr = dates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" });
    var endStr = dates[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    label.textContent = startStr + " \u2013 " + endStr;
    label.style.cssText = "font-size:14px;font-weight:600;color:var(--text,#1d1d1f);";

    var todayBtn = btn("Today", "", function () { weekOffset = 0; render(); });
    todayBtn.style.cssText = "background:none;border:1px solid var(--border,#e5e5e5);" +
      "border-radius:var(--radius-sm,8px);padding:4px 10px;cursor:pointer;" +
      "font-size:12px;color:var(--text-secondary,#6e6e73);margin:0 8px;";
    if (weekOffset === 0) todayBtn.style.opacity = "0.4";

    var nextBtn = btn("\u2192", "", function () { weekOffset++; render(); });
    nextBtn.style.cssText = prevBtn.style.cssText;

    var leftGroup = el("div");
    leftGroup.style.cssText = "display:flex;align-items:center;gap:4px;";
    leftGroup.appendChild(prevBtn);
    leftGroup.appendChild(todayBtn);
    leftGroup.appendChild(nextBtn);

    nav.appendChild(leftGroup);
    nav.appendChild(label);
    return nav;
  }

  /* --- Habit Grid --- */

  function buildGrid() {
    var dates = getWeekDates();
    var habits = activeHabits();
    var today = formatDate(new Date());

    var grid = el("div", "habit-grid");
    // columns: habit label + 7 day columns
    grid.style.cssText = "display:grid;grid-template-columns:1fr repeat(7,40px);" +
      "gap:4px 6px;align-items:center;margin-bottom:16px;";

    // Header row — empty corner + day labels
    var corner = el("div");
    grid.appendChild(corner);
    for (var d = 0; d < 7; d++) {
      var dayHeader = el("div");
      var dateNum = dates[d].getDate();
      var isToday = formatDate(dates[d]) === today;
      dayHeader.innerHTML = "<div style='font-size:11px;color:var(--text-secondary,#6e6e73);" +
        "text-align:center;line-height:1.2;'>" + DAY_LABELS[d] +
        "</div><div style='font-size:13px;font-weight:" + (isToday ? "700" : "500") +
        ";text-align:center;color:" + (isToday ? "var(--accent,#0071e3)" : "var(--text,#1d1d1f)") +
        ";'>" + dateNum + "</div>";
      grid.appendChild(dayHeader);
    }

    // Habit rows
    for (var h = 0; h < habits.length; h++) {
      var habit = habits[h];
      var catColor = CATEGORIES[habit.category] ? CATEGORIES[habit.category].color : "#999";
      var streak = getStreak(habit.id);

      // Label cell
      var labelCell = el("div", "habit-label");
      labelCell.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 0;" +
        "min-width:0;";

      var dot = el("span");
      dot.style.cssText = "width:8px;height:8px;border-radius:50%;flex-shrink:0;" +
        "background:" + catColor + ";";

      var nameSpan = el("span");
      nameSpan.textContent = habit.name;
      nameSpan.style.cssText = "font-size:13px;white-space:nowrap;overflow:hidden;" +
        "text-overflow:ellipsis;color:var(--text,#1d1d1f);";

      var streakBadge = el("span");
      if (streak > 0) {
        streakBadge.textContent = "\uD83D\uDD25" + streak;
        streakBadge.setAttribute("aria-label", "streak: " + streak + " days");
        streakBadge.style.cssText = "font-size:11px;color:var(--text-secondary,#6e6e73);" +
          "flex-shrink:0;margin-left:2px;";
      }

      var deleteBtn = btn("\u00D7", "", (function (id) {
        return function () { deleteHabit(id); };
      })(habit.id));
      deleteBtn.style.cssText = "background:none;border:none;color:var(--text-secondary,#6e6e73);" +
        "cursor:pointer;font-size:14px;padding:0 2px;margin-left:auto;opacity:0;" +
        "transition:opacity .15s;flex-shrink:0;";
      deleteBtn.title = "Archive habit";

      labelCell.appendChild(dot);
      labelCell.appendChild(nameSpan);
      labelCell.appendChild(streakBadge);
      labelCell.appendChild(deleteBtn);

      // Show delete button on hover
      labelCell.addEventListener("mouseenter", (function (b) {
        return function () { b.style.opacity = "1"; };
      })(deleteBtn));
      labelCell.addEventListener("mouseleave", (function (b) {
        return function () { b.style.opacity = "0"; };
      })(deleteBtn));

      grid.appendChild(labelCell);

      // Day cells
      for (var di = 0; di < 7; di++) {
        var dateStr = formatDate(dates[di]);
        var key = completionKey(habit.id, dateStr);
        var done = !!data.completions[key];

        var cell = el("div", "habit-cell");
        cell.style.cssText = "display:flex;align-items:center;justify-content:center;" +
          "height:36px;cursor:pointer;";

        var circle = el("div");
        if (done) {
          circle.style.cssText = "width:24px;height:24px;border-radius:6px;" +
            "background:" + catColor + ";transition:all .15s;";
        } else {
          circle.style.cssText = "width:24px;height:24px;border-radius:6px;" +
            "border:2px solid " + catColor + ";opacity:0.35;transition:all .15s;";
        }

        cell.appendChild(circle);
        cell.addEventListener("click", (function (hId, ds) {
          return function () { toggleDay(hId, ds); };
        })(habit.id, dateStr));

        grid.appendChild(cell);
      }
    }

    // Empty state
    if (habits.length === 0) {
      var empty = el("div");
      empty.style.cssText = "grid-column:1/-1;text-align:center;padding:32px 0;" +
        "color:var(--text-secondary,#6e6e73);font-size:14px;";
      empty.textContent = "No habits yet. Add one above to get started!";
      grid.appendChild(empty);
    }

    return grid;
  }

  /* --- Summary Bar --- */

  function buildSummary() {
    var habits = activeHabits();
    var today = formatDate(new Date());
    var completedToday = 0;
    for (var i = 0; i < habits.length; i++) {
      if (data.completions[completionKey(habits[i].id, today)]) {
        completedToday++;
      }
    }

    var stats = getStats();

    var bar = el("div", "habit-summary");
    bar.style.cssText = "display:flex;justify-content:space-between;align-items:center;" +
      "padding:12px 16px;background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5);" +
      "border-radius:var(--radius,12px);font-size:13px;color:var(--text-secondary,#6e6e73);" +
      "flex-wrap:wrap;gap:8px;";

    var todayStat = el("span");
    todayStat.textContent = completedToday + "/" + habits.length + " habits completed today";

    var rateStat = el("span");
    rateStat.textContent = "Completion rate (7d): " + stats.completionRate + "%";

    var streakStat = el("span");
    streakStat.textContent = "\uD83D\uDD25 Longest streak: " + stats.longestStreak + "d";
    streakStat.setAttribute("aria-label", "Longest streak: " + stats.longestStreak + " days");

    bar.appendChild(todayStat);
    bar.appendChild(rateStat);
    bar.appendChild(streakStat);
    return bar;
  }

  /* ---------- Expose Public API ---------- */

  window.HabitTracker = {
    init: init,
    addHabit: addHabit,
    deleteHabit: deleteHabit,
    toggleDay: toggleDay,
    getStreak: getStreak,
    getStats: getStats,
    render: render
  };

  return window.HabitTracker;
})();
