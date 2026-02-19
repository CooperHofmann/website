/* ================================================================
   Dashboard – Weekly productivity overview
   Pure HTML/CSS data-viz, no external dependencies.
   Reads from TodoManager, PomodoroTimer, AssignmentTracker,
   HabitTracker via their public getStats / getSessions APIs.
   ================================================================ */
(function () {
  "use strict";

  /* ---------- Constants ---------- */

  var CATEGORIES = {
    school:   { label: "School",   color: "#3B82F6" },
    home:     { label: "Home",     color: "#10B981" },
    personal: { label: "Personal", color: "#8B5CF6" },
    work:     { label: "Work",     color: "#F59E0B" }
  };

  var DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var HEATMAP_WEEKS = 8;
  var HEAT_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

  /* ---------- Helpers ---------- */

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function getTodoStats() {
    return window.TodoManager ? safe(function () { return window.TodoManager.getStats(); }, null) : null;
  }

  function getTimerStats() {
    return window.PomodoroTimer ? safe(function () { return window.PomodoroTimer.getStats(); }, null) : null;
  }

  function getTimerSessions() {
    return window.PomodoroTimer && window.PomodoroTimer.getSessions
      ? safe(function () { return window.PomodoroTimer.getSessions(); }, [])
      : [];
  }

  function getAssignmentStats() {
    return window.AssignmentTracker ? safe(function () { return window.AssignmentTracker.getStats(); }, null) : null;
  }

  function getHabitStats() {
    return window.HabitTracker && window.HabitTracker.getStats
      ? safe(function () { return window.HabitTracker.getStats(); }, null)
      : null;
  }

  function dateKey(d) {
    var y = d.getFullYear();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + day;
  }

  function startOfWeek(d) {
    var copy = new Date(d);
    var day = copy.getDay();
    var diff = (day === 0 ? 6 : day - 1); // Monday = 0
    copy.setDate(copy.getDate() - diff);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  function addDays(d, n) {
    var copy = new Date(d);
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function weekRange(refDate) {
    var ws = startOfWeek(refDate);
    var we = addDays(ws, 6);
    we.setHours(23, 59, 59, 999);
    return { start: ws, end: we };
  }

  function fmtDate(d) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[d.getMonth()] + " " + d.getDate();
  }

  /* ---------- Data aggregation ---------- */

  function buildActivityMap() {
    var map = {};

    // Pomodoro sessions
    var sessions = getTimerSessions();
    sessions.forEach(function (s) {
      if (s.type !== "focus") return;
      var key = dateKey(new Date(s.endTime || s.startTime));
      if (!map[key]) map[key] = 0;
      map[key] += 1;
    });

    return map;
  }

  function categoryBreakdown() {
    var totals = {};
    Object.keys(CATEGORIES).forEach(function (c) { totals[c] = 0; });

    var todoStats = getTodoStats();
    if (todoStats && todoStats.byCategory) {
      Object.keys(todoStats.byCategory).forEach(function (c) {
        if (totals[c] !== undefined) totals[c] += todoStats.byCategory[c];
      });
    }

    var timerStats = getTimerStats();
    if (timerStats && timerStats.byCategory) {
      Object.keys(timerStats.byCategory).forEach(function (raw) {
        var key = raw.toLowerCase();
        if (totals[key] !== undefined) {
          totals[key] += timerStats.byCategory[raw].sessions || 0;
        }
      });
    }

    return totals;
  }

  function weeklyComparison() {
    var now = new Date();
    var thisW = weekRange(now);
    var lastW = weekRange(addDays(thisW.start, -1));

    var sessions = getTimerSessions();
    var result = { thisWeek: { tasks: 0, focusMin: 0 }, lastWeek: { tasks: 0, focusMin: 0 } };

    sessions.forEach(function (s) {
      if (s.type !== "focus") return;
      var t = new Date(s.endTime || s.startTime).getTime();
      var mins = Math.round((s.duration || 0) / 60);
      if (t >= thisW.start.getTime() && t <= thisW.end.getTime()) {
        result.thisWeek.tasks++;
        result.thisWeek.focusMin += mins;
      } else if (t >= lastW.start.getTime() && t <= lastW.end.getTime()) {
        result.lastWeek.tasks++;
        result.lastWeek.focusMin += mins;
      }
    });

    return result;
  }

  function upcomingDeadlines() {
    var aStats = getAssignmentStats();
    if (!aStats) return [];
    // We only have aggregate stats; build a synthetic list from urgency counts
    var items = [];
    if (aStats.byUrgency) {
      if (aStats.byUrgency.red > 0) {
        items.push({ label: aStats.byUrgency.red + " assignment(s) due within 2 days", urgency: "red" });
      }
      if (aStats.byUrgency.yellow > 0) {
        items.push({ label: aStats.byUrgency.yellow + " assignment(s) due within 7 days", urgency: "yellow" });
      }
      if (aStats.byUrgency.green > 0) {
        items.push({ label: aStats.byUrgency.green + " assignment(s) due later", urgency: "green" });
      }
    }
    return items;
  }

  /* ---------- DOM builders ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "style" && typeof attrs[k] === "object") {
          Object.keys(attrs[k]).forEach(function (p) { node.style[p] = attrs[k][p]; });
        } else if (k === "className") {
          node.className = attrs[k];
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    });
    return node;
  }

  /* ---------- Inject scoped styles ---------- */

  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    var css = [
      ".dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}",
      ".dash-card{background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:20px;box-shadow:var(--shadow,0 1px 3px rgba(0,0,0,.06))}",
      ".dash-card h3{margin:0 0 4px;font-size:13px;font-weight:500;color:var(--text-secondary,#6e6e73);text-transform:uppercase;letter-spacing:.04em}",
      ".dash-card .dash-big{font-size:36px;font-weight:700;color:var(--text,#1d1d1f);line-height:1.1}",
      ".dash-card .dash-sub{font-size:12px;color:var(--text-secondary,#6e6e73);margin-top:4px}",
      ".dash-section{margin-bottom:28px}",
      ".dash-section-title{font-size:16px;font-weight:600;color:var(--text,#1d1d1f);margin:0 0 12px}",
      /* bar chart */
      ".dash-bar-row{display:flex;align-items:center;margin-bottom:8px}",
      ".dash-bar-label{width:80px;font-size:13px;color:var(--text,#1d1d1f);flex-shrink:0}",
      ".dash-bar-track{flex:1;height:22px;background:var(--border,#e5e5e5);border-radius:6px;overflow:hidden;position:relative}",
      ".dash-bar-fill{height:100%;border-radius:6px;transition:width .4s ease}",
      ".dash-bar-pct{width:48px;text-align:right;font-size:12px;color:var(--text-secondary,#6e6e73);flex-shrink:0;padding-left:8px}",
      /* heatmap */
      ".dash-heatmap{display:grid;grid-template-columns:40px repeat(" + HEATMAP_WEEKS + ",1fr);gap:3px}",
      ".dash-hm-cell{aspect-ratio:1;border-radius:3px;min-width:0}",
      ".dash-hm-label{font-size:11px;color:var(--text-secondary,#6e6e73);display:flex;align-items:center}",
      ".dash-hm-header{font-size:11px;color:var(--text-secondary,#6e6e73);text-align:center;padding-bottom:2px}",
      /* deadlines */
      ".dash-dl-item{display:flex;align-items:center;padding:8px 12px;border-radius:var(--radius-sm,8px);margin-bottom:6px;background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5)}",
      ".dash-dl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-right:10px}",
      ".dash-dl-text{font-size:13px;color:var(--text,#1d1d1f)}",
      /* comparison */
      ".dash-cmp{display:grid;grid-template-columns:1fr 1fr;gap:16px}",
      ".dash-cmp-col{background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5);border-radius:var(--radius,12px);padding:16px}",
      ".dash-cmp-col h4{margin:0 0 8px;font-size:13px;font-weight:500;color:var(--text-secondary,#6e6e73)}",
      ".dash-cmp-row{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px;color:var(--text,#1d1d1f)}",
      ".dash-cmp-delta{font-size:12px;font-weight:600;margin-left:6px}",
      ".dash-cmp-up{color:#10B981}",
      ".dash-cmp-down{color:#EF4444}",
      ".dash-cmp-same{color:var(--text-secondary,#6e6e73)}",
      ".dash-empty{font-size:13px;color:var(--text-secondary,#6e6e73);font-style:italic}"
    ].join("\n");

    var style = document.createElement("style");
    style.setAttribute("data-dashboard", "");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- Section renderers ---------- */

  function renderHeroStats() {
    var todoStats = getTodoStats();
    var timerStats = getTimerStats();
    var assignStats = getAssignmentStats();
    var habitStats = getHabitStats();

    var completed = todoStats ? todoStats.completed : 0;
    var totalTodos = todoStats ? todoStats.total : 0;
    var focusMin = timerStats ? timerStats.totalFocusMinutes : 0;
    var focusHrs = (focusMin / 60).toFixed(1);
    var totalSessions = timerStats ? timerStats.totalSessions : 0;

    var dueCount = 0;
    if (assignStats && assignStats.byStatus) {
      dueCount = (assignStats.byStatus["not-started"] || 0) + (assignStats.byStatus["in-progress"] || 0);
    }

    var streaks = 0;
    if (habitStats && habitStats.activeStreaks !== undefined) {
      streaks = habitStats.activeStreaks;
    } else if (habitStats && habitStats.currentStreak !== undefined) {
      streaks = habitStats.currentStreak;
    }

    var cards = [
      { title: "Tasks Completed", big: completed, sub: "of " + totalTodos + " total" },
      { title: "Focus Hours", big: focusHrs, sub: totalSessions + " sessions" },
      { title: "Assignments Due", big: dueCount, sub: assignStats ? assignStats.total + " total" : "no data" },
      { title: "Current Streaks", big: streaks, sub: habitStats ? habitStats.longestStreak + " day longest" : "no habit data" }
    ];

    var grid = el("div", { className: "dash-grid" });
    cards.forEach(function (c) {
      grid.appendChild(
        el("div", { className: "dash-card" }, [
          el("h3", null, [c.title]),
          el("div", { className: "dash-big" }, [String(c.big)]),
          el("div", { className: "dash-sub" }, [c.sub])
        ])
      );
    });
    return grid;
  }

  function renderCategoryBars() {
    var totals = categoryBreakdown();
    var grand = 0;
    Object.keys(totals).forEach(function (c) { grand += totals[c]; });

    var section = el("div", { className: "dash-section" }, [
      el("h2", { className: "dash-section-title" }, ["Category Breakdown"])
    ]);

    if (grand === 0) {
      section.appendChild(el("div", { className: "dash-empty" }, ["No activity data yet."]));
      return section;
    }

    Object.keys(CATEGORIES).forEach(function (cat) {
      var pct = grand > 0 ? Math.round((totals[cat] / grand) * 100) : 0;
      var color = CATEGORIES[cat].color;

      section.appendChild(
        el("div", { className: "dash-bar-row" }, [
          el("span", { className: "dash-bar-label" }, [CATEGORIES[cat].label]),
          el("div", { className: "dash-bar-track" }, [
            el("div", { className: "dash-bar-fill", style: { width: pct + "%", background: color } })
          ]),
          el("span", { className: "dash-bar-pct" }, [pct + "%"])
        ])
      );
    });

    return section;
  }

  function renderHeatmap() {
    var activityMap = buildActivityMap();

    var section = el("div", { className: "dash-section" }, [
      el("h2", { className: "dash-section-title" }, ["Activity Heatmap"])
    ]);

    // Determine the grid start: go back HEATMAP_WEEKS full weeks from current week
    var now = new Date();
    var thisMonday = startOfWeek(now);
    var gridStart = addDays(thisMonday, -(HEATMAP_WEEKS - 1) * 7);

    // Find max for scaling
    var maxVal = 1;
    Object.keys(activityMap).forEach(function (k) {
      if (activityMap[k] > maxVal) maxVal = activityMap[k];
    });

    var grid = el("div", { className: "dash-heatmap" });

    // Header row: empty corner + week labels
    grid.appendChild(el("div")); // corner
    for (var w = 0; w < HEATMAP_WEEKS; w++) {
      var weekStart = addDays(gridStart, w * 7);
      grid.appendChild(el("div", { className: "dash-hm-header" }, [fmtDate(weekStart)]));
    }

    // 7 rows (Mon-Sun)
    for (var d = 0; d < 7; d++) {
      grid.appendChild(el("div", { className: "dash-hm-label" }, [DAY_LABELS[d]]));

      for (var wk = 0; wk < HEATMAP_WEEKS; wk++) {
        var cellDate = addDays(gridStart, wk * 7 + d);
        var key = dateKey(cellDate);
        var val = activityMap[key] || 0;
        var level = 0;
        if (val > 0) level = Math.min(4, Math.ceil((val / maxVal) * 4));

        var isFuture = cellDate.getTime() > now.getTime();
        var bg = isFuture ? "var(--surface,#fff)" : HEAT_COLORS[level];
        var border = isFuture ? "1px solid var(--border,#e5e5e5)" : "none";

        grid.appendChild(
          el("div", {
            className: "dash-hm-cell",
            title: key + ": " + val + " activities",
            style: { background: bg, border: border }
          })
        );
      }
    }

    section.appendChild(grid);
    return section;
  }

  function renderThisWeek() {
    var section = el("div", { className: "dash-section" }, [
      el("h2", { className: "dash-section-title" }, ["This Week"])
    ]);

    // Upcoming deadlines
    var deadlines = upcomingDeadlines();
    if (deadlines.length > 0) {
      var dlTitle = el("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--text,#1d1d1f)", marginBottom: "8px" } }, ["Upcoming Deadlines"]);
      section.appendChild(dlTitle);
      var urgencyColors = { red: "#EF4444", yellow: "#F59E0B", green: "#10B981" };
      deadlines.forEach(function (d) {
        section.appendChild(
          el("div", { className: "dash-dl-item" }, [
            el("span", { className: "dash-dl-dot", style: { background: urgencyColors[d.urgency] || "#6e6e73" } }),
            el("span", { className: "dash-dl-text" }, [d.label])
          ])
        );
      });
    } else {
      section.appendChild(el("div", { className: "dash-empty" }, ["No upcoming deadlines."]));
    }

    // Most urgent tasks (from todo stats)
    var todoStats = getTodoStats();
    if (todoStats) {
      var remaining = todoStats.total - todoStats.completed;
      var urgentNote = el("div", {
        style: { fontSize: "13px", color: "var(--text-secondary,#6e6e73)", marginTop: "12px" }
      }, [
        remaining > 0
          ? remaining + " task(s) remaining this week."
          : "All tasks completed! \uD83C\uDF89"
      ]);
      section.appendChild(urgentNote);
    }

    return section;
  }

  function renderComparison() {
    var cmp = weeklyComparison();

    var section = el("div", { className: "dash-section" }, [
      el("h2", { className: "dash-section-title" }, ["Last Week vs This Week"])
    ]);

    function deltaEl(curr, prev, unit) {
      var diff = curr - prev;
      var cls = "dash-cmp-delta ";
      var arrow = "";
      if (diff > 0) { cls += "dash-cmp-up"; arrow = "\u25B2 +"; }
      else if (diff < 0) { cls += "dash-cmp-down"; arrow = "\u25BC "; }
      else { cls += "dash-cmp-same"; arrow = "— "; }
      return el("span", { className: cls }, [arrow + Math.abs(diff) + (unit || "")]);
    }

    var grid = el("div", { className: "dash-cmp" }, [
      el("div", { className: "dash-cmp-col" }, [
        el("h4", null, ["Last Week"]),
        el("div", { className: "dash-cmp-row" }, [
          "Sessions: " + cmp.lastWeek.tasks
        ]),
        el("div", { className: "dash-cmp-row" }, [
          "Focus: " + cmp.lastWeek.focusMin + " min"
        ])
      ]),
      el("div", { className: "dash-cmp-col" }, [
        el("h4", null, ["This Week"]),
        el("div", { className: "dash-cmp-row" }, [
          "Sessions: " + cmp.thisWeek.tasks + " ",
          deltaEl(cmp.thisWeek.tasks, cmp.lastWeek.tasks)
        ]),
        el("div", { className: "dash-cmp-row" }, [
          "Focus: " + cmp.thisWeek.focusMin + " min ",
          deltaEl(cmp.thisWeek.focusMin, cmp.lastWeek.focusMin, " min")
        ])
      ])
    ]);

    section.appendChild(grid);
    return section;
  }

  /* ---------- Public API ---------- */

  var container = null;

  function render() {
    if (!container) return;
    container.innerHTML = "";

    var wrapper = el("div", { style: { fontFamily: "var(--font, 'Inter', sans-serif)" } });

    wrapper.appendChild(renderHeroStats());
    wrapper.appendChild(renderCategoryBars());
    wrapper.appendChild(renderHeatmap());
    wrapper.appendChild(renderThisWeek());
    wrapper.appendChild(renderComparison());

    container.appendChild(wrapper);
  }

  function init(containerEl) {
    injectStyles();
    container = containerEl;
    render();
  }

  window.Dashboard = {
    init: init,
    render: render
  };
})();
