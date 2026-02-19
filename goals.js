/* ==========================================================================
   Goal Tracker — Weekly / Monthly goals with milestones & progress tracking
   ==========================================================================
   Self-contained vanilla JS module (IIFE).
   Exposes window.GoalTracker.
   Persists goals in localStorage.
   ========================================================================== */

var GoalTracker = (function () {
  "use strict";

  /* ---------- Constants ---------- */

  var STORAGE_KEY = "goal_tracker";

  var CATEGORIES = {
    school:   { label: "School",   color: "#3B82F6" },
    home:     { label: "Home",     color: "#10B981" },
    personal: { label: "Personal", color: "#8B5CF6" },
    work:     { label: "Work",     color: "#F59E0B" }
  };

  var CELEBRATION_EMOJI = "\uD83C\uDF89";

  /* ---------- State ---------- */

  var goals = [];
  var containerEl = null;
  var activeType = "weekly";   // "weekly" | "monthly"
  var showForm = false;

  /* ---------- Persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
      if (typeof CloudSync !== "undefined") {
        CloudSync.syncToCloud("goals", goals);
      }
    } catch (e) {
      console.error("Failed to save goals:", e);
    }
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      var parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to load goals:", e);
      return [];
    }
  }

  /* ---------- Helpers ---------- */

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "goal-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  function computeProgress(goal) {
    if (!goal.milestones || goal.milestones.length === 0) return goal.progress;
    var done = 0;
    for (var i = 0; i < goal.milestones.length; i++) {
      if (goal.milestones[i].completed) done++;
    }
    return Math.round((done / goal.milestones.length) * 100);
  }

  function formatDisplayDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

  /* ---------- Styles (injected once) ---------- */

  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css = [
      ".gt-container { font-family: var(--font, 'Inter', system-ui, sans-serif); max-width: 800px; margin: 0 auto; }",

      /* Toggle */
      ".gt-toggle { display: flex; gap: 4px; background: var(--border, #e5e5e5); border-radius: 8px; padding: 3px; width: fit-content; margin-bottom: 16px; }",
      ".gt-toggle-btn { border: none; background: transparent; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-secondary, #6e6e73); transition: all 0.15s; }",
      ".gt-toggle-btn.active { background: var(--surface, #fff); color: var(--text, #1d1d1f); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }",

      /* Add Goal button */
      ".gt-add-btn { border: none; background: var(--accent, #0071e3); color: #fff; padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; margin-bottom: 16px; transition: opacity 0.15s; }",
      ".gt-add-btn:hover { opacity: 0.85; }",

      /* Form */
      ".gt-form { background: var(--surface, #fff); border: 1px solid var(--border, #e5e5e5); border-radius: 12px; padding: 16px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 10px; }",
      ".gt-form input, .gt-form textarea, .gt-form select { border: 1px solid var(--border, #e5e5e5); border-radius: 8px; padding: 8px 12px; font-size: 14px; font-family: inherit; background: var(--bg, #fafafa); color: var(--text, #1d1d1f); }",
      ".gt-form textarea { resize: vertical; min-height: 60px; }",
      ".gt-form-row { display: flex; gap: 10px; }",
      ".gt-form-row > * { flex: 1; }",
      ".gt-form-actions { display: flex; gap: 8px; justify-content: flex-end; }",

      /* Cards */
      ".gt-cards { display: flex; flex-direction: column; gap: 12px; }",
      ".gt-card { background: var(--surface, #fff); border: 1px solid var(--border, #e5e5e5); border-radius: 12px; overflow: hidden; display: flex; transition: box-shadow 0.15s; }",
      ".gt-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }",
      ".gt-color-strip { width: 5px; flex-shrink: 0; }",
      ".gt-card-body { flex: 1; padding: 16px; }",

      /* Header */
      ".gt-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }",
      ".gt-card-title { font-size: 16px; font-weight: 600; color: var(--text, #1d1d1f); margin: 0; }",
      ".gt-card-desc { font-size: 13px; color: var(--text-secondary, #6e6e73); margin: 0 0 12px; }",
      ".gt-delete-btn { border: none; background: transparent; color: var(--text-secondary, #6e6e73); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 4px; transition: color 0.15s, background 0.15s; }",
      ".gt-delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.08); }",

      /* Progress */
      ".gt-progress-wrap { margin-bottom: 12px; }",
      ".gt-progress-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 13px; color: var(--text-secondary, #6e6e73); }",
      ".gt-progress-bar { height: 8px; background: var(--border, #e5e5e5); border-radius: 4px; overflow: hidden; }",
      ".gt-progress-fill { height: 100%; border-radius: 4px; transition: width 0.4s ease; }",

      /* Milestones */
      ".gt-milestones { margin-bottom: 10px; }",
      ".gt-milestone { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: var(--text, #1d1d1f); }",
      ".gt-milestone input[type='checkbox'] { accent-color: var(--accent, #0071e3); cursor: pointer; width: 16px; height: 16px; }",
      ".gt-milestone.done span { text-decoration: line-through; color: var(--text-secondary, #6e6e73); }",

      /* Add Milestone input */
      ".gt-add-ms { display: flex; gap: 6px; margin-top: 6px; }",
      ".gt-add-ms input { flex: 1; border: 1px solid var(--border, #e5e5e5); border-radius: 6px; padding: 5px 10px; font-size: 13px; font-family: inherit; background: var(--bg, #fafafa); color: var(--text, #1d1d1f); }",
      ".gt-add-ms button { border: none; background: var(--accent, #0071e3); color: #fff; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; transition: opacity 0.15s; }",
      ".gt-add-ms button:hover { opacity: 0.85; }",

      /* Meta */
      ".gt-card-meta { font-size: 12px; color: var(--text-secondary, #6e6e73); display: flex; gap: 12px; margin-top: 8px; }",

      /* Section headers */
      ".gt-section-title { font-size: 14px; font-weight: 600; color: var(--text-secondary, #6e6e73); margin: 24px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }",

      /* Completed card */
      ".gt-card.completed { opacity: 0.75; }",
      ".gt-confetti { display: inline-block; animation: gt-pop 0.4s ease; }",
      "@keyframes gt-pop { 0% { transform: scale(0); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }",

      /* Empty state */
      ".gt-empty { text-align: center; padding: 40px 16px; color: var(--text-secondary, #6e6e73); font-size: 14px; }"
    ].join("\n");

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- Core API ---------- */

  function addGoal(title, description, category, type, targetDate) {
    if (!title || !title.trim()) return null;
    var goal = {
      id: generateId(),
      title: title.trim(),
      description: (description || "").trim(),
      category: CATEGORIES[category] ? category : "personal",
      type: type === "monthly" ? "monthly" : "weekly",
      milestones: [],
      progress: 0,
      createdAt: new Date().toISOString(),
      targetDate: targetDate || null,
      completedAt: null
    };
    goals.push(goal);
    save();
    render();
    return goal;
  }

  function updateGoal(id, updates) {
    var goal = findGoal(id);
    if (!goal) return null;
    var allowed = ["title", "description", "category", "type", "targetDate", "progress"];
    for (var i = 0; i < allowed.length; i++) {
      var key = allowed[i];
      if (updates.hasOwnProperty(key)) {
        goal[key] = updates[key];
      }
    }
    refreshCompletion(goal);
    save();
    render();
    return goal;
  }

  function deleteGoal(id) {
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].id === id) {
        goals.splice(i, 1);
        save();
        render();
        return true;
      }
    }
    return false;
  }

  function addMilestone(goalId, title) {
    if (!title || !title.trim()) return null;
    var goal = findGoal(goalId);
    if (!goal) return null;
    var ms = { id: generateId(), title: title.trim(), completed: false };
    goal.milestones.push(ms);
    goal.progress = computeProgress(goal);
    refreshCompletion(goal);
    save();
    render();
    return ms;
  }

  function toggleMilestone(goalId, milestoneId) {
    var goal = findGoal(goalId);
    if (!goal) return false;
    for (var i = 0; i < goal.milestones.length; i++) {
      if (goal.milestones[i].id === milestoneId) {
        goal.milestones[i].completed = !goal.milestones[i].completed;
        goal.progress = computeProgress(goal);
        refreshCompletion(goal);
        save();
        render();
        return true;
      }
    }
    return false;
  }

  function getStats() {
    var stats = { total: goals.length, completed: 0, inProgress: 0, byCategory: {} };
    for (var cat in CATEGORIES) {
      if (CATEGORIES.hasOwnProperty(cat)) {
        stats.byCategory[cat] = { total: 0, completed: 0 };
      }
    }
    for (var i = 0; i < goals.length; i++) {
      var g = goals[i];
      var catKey = g.category;
      if (stats.byCategory[catKey]) {
        stats.byCategory[catKey].total++;
      }
      if (g.completedAt) {
        stats.completed++;
        if (stats.byCategory[catKey]) stats.byCategory[catKey].completed++;
      } else {
        stats.inProgress++;
      }
    }
    return stats;
  }

  /* ---------- Internal helpers ---------- */

  function findGoal(id) {
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].id === id) return goals[i];
    }
    return null;
  }

  function refreshCompletion(goal) {
    if (goal.progress >= 100 && !goal.completedAt) {
      goal.completedAt = new Date().toISOString();
    } else if (goal.progress < 100 && goal.completedAt) {
      goal.completedAt = null;
    }
  }

  /* ---------- Render ---------- */

  function render() {
    if (!containerEl) return;
    injectStyles();
    containerEl.innerHTML = "";

    var wrapper = el("div", "gt-container");

    // Type toggle
    wrapper.appendChild(buildToggle());

    // Add Goal button / form
    if (showForm) {
      wrapper.appendChild(buildAddForm());
    } else {
      var addButton = btn("+ Add Goal", "gt-add-btn", function () {
        showForm = true;
        render();
      });
      wrapper.appendChild(addButton);
    }

    // Separate active and completed goals for current type
    var active = [];
    var completed = [];
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].type !== activeType) continue;
      if (goals[i].completedAt) {
        completed.push(goals[i]);
      } else {
        active.push(goals[i]);
      }
    }

    // Active goals
    if (active.length === 0 && completed.length === 0) {
      var empty = el("div", "gt-empty");
      empty.textContent = "No " + activeType + " goals yet. Add one to get started!";
      wrapper.appendChild(empty);
    } else {
      var activeCards = el("div", "gt-cards");
      for (var j = 0; j < active.length; j++) {
        activeCards.appendChild(buildCard(active[j], false));
      }
      wrapper.appendChild(activeCards);
    }

    // Completed goals
    if (completed.length > 0) {
      var heading = el("div", "gt-section-title");
      heading.textContent = "Completed";
      wrapper.appendChild(heading);

      var completedCards = el("div", "gt-cards");
      for (var k = 0; k < completed.length; k++) {
        completedCards.appendChild(buildCard(completed[k], true));
      }
      wrapper.appendChild(completedCards);
    }

    containerEl.appendChild(wrapper);
  }

  /* ---------- Build: Toggle ---------- */

  function buildToggle() {
    var wrap = el("div", "gt-toggle");

    var weekBtn = btn("Weekly Goals", "gt-toggle-btn" + (activeType === "weekly" ? " active" : ""), function () {
      activeType = "weekly";
      render();
    });

    var monthBtn = btn("Monthly Goals", "gt-toggle-btn" + (activeType === "monthly" ? " active" : ""), function () {
      activeType = "monthly";
      render();
    });

    wrap.appendChild(weekBtn);
    wrap.appendChild(monthBtn);
    return wrap;
  }

  /* ---------- Build: Add Form ---------- */

  function buildAddForm() {
    var form = el("div", "gt-form");

    var titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.placeholder = "Goal title";

    var descInput = document.createElement("textarea");
    descInput.placeholder = "Description (optional)";

    var row = el("div", "gt-form-row");

    var catSelect = document.createElement("select");
    for (var cat in CATEGORIES) {
      if (CATEGORIES.hasOwnProperty(cat)) {
        var opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = CATEGORIES[cat].label;
        catSelect.appendChild(opt);
      }
    }

    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.title = "Target date";

    row.appendChild(catSelect);
    row.appendChild(dateInput);

    var actions = el("div", "gt-form-actions");
    var addBtn = btn("Add", "gt-add-btn", function () {
      if (!titleInput.value.trim()) return;
      addGoal(titleInput.value, descInput.value, catSelect.value, activeType, dateInput.value || null);
      showForm = false;
    });
    var cancelBtn = btn("Cancel", "gt-delete-btn", function () {
      showForm = false;
      render();
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(addBtn);

    form.appendChild(titleInput);
    form.appendChild(descInput);
    form.appendChild(row);
    form.appendChild(actions);

    return form;
  }

  /* ---------- Build: Goal Card ---------- */

  function buildCard(goal, isCompleted) {
    var card = el("div", "gt-card" + (isCompleted ? " completed" : ""));

    // Color strip
    var strip = el("div", "gt-color-strip");
    var catColor = CATEGORIES[goal.category] ? CATEGORIES[goal.category].color : "#999";
    strip.style.backgroundColor = catColor;
    card.appendChild(strip);

    var body = el("div", "gt-card-body");

    // Header: title + delete
    var header = el("div", "gt-card-header");
    var titleEl = el("h3", "gt-card-title");
    titleEl.textContent = goal.title + (goal.progress >= 100 ? " " + CELEBRATION_EMOJI : "");
    header.appendChild(titleEl);

    var delBtn = btn("\u00D7", "gt-delete-btn", (function (id) {
      return function () { deleteGoal(id); };
    })(goal.id));
    header.appendChild(delBtn);
    body.appendChild(header);

    // Description
    if (goal.description) {
      var desc = el("p", "gt-card-desc");
      desc.textContent = goal.description;
      body.appendChild(desc);
    }

    // Progress bar
    var progressWrap = el("div", "gt-progress-wrap");
    var progressInfo = el("div", "gt-progress-info");
    var progressLabel = el("span");
    progressLabel.textContent = "Progress";
    var progressPct = el("span");
    progressPct.textContent = goal.progress + "%";
    if (goal.progress >= 100) {
      var confettiSpan = el("span", "gt-confetti");
      confettiSpan.textContent = " " + CELEBRATION_EMOJI;
      progressPct.appendChild(confettiSpan);
    }
    progressInfo.appendChild(progressLabel);
    progressInfo.appendChild(progressPct);

    var bar = el("div", "gt-progress-bar");
    var fill = el("div", "gt-progress-fill");
    fill.style.backgroundColor = catColor;
    fill.style.width = "0%"; // start at 0 so the CSS transition animates the fill
    bar.appendChild(fill);

    progressWrap.appendChild(progressInfo);
    progressWrap.appendChild(bar);
    body.appendChild(progressWrap);

    // Animate progress fill after paint
    requestAnimationFrame(function () {
      fill.style.width = Math.min(goal.progress, 100) + "%";
    });

    // Milestones
    if (goal.milestones.length > 0) {
      var msWrap = el("div", "gt-milestones");
      for (var m = 0; m < goal.milestones.length; m++) {
        msWrap.appendChild(buildMilestoneRow(goal.id, goal.milestones[m]));
      }
      body.appendChild(msWrap);
    }

    // Add milestone input
    if (!isCompleted) {
      var addMs = el("div", "gt-add-ms");
      var msInput = document.createElement("input");
      msInput.type = "text";
      msInput.placeholder = "Add milestone…";
      var msBtn = btn("+", "", (function (gId, inp) {
        return function () {
          if (!inp.value.trim()) return;
          addMilestone(gId, inp.value);
        };
      })(goal.id, msInput));
      msInput.addEventListener("keydown", (function (gId, inp) {
        return function (e) {
          if (e.key === "Enter" && inp.value.trim()) {
            addMilestone(gId, inp.value);
          }
        };
      })(goal.id, msInput));
      addMs.appendChild(msInput);
      addMs.appendChild(msBtn);
      body.appendChild(addMs);
    }

    // Meta: target date, category
    var meta = el("div", "gt-card-meta");
    if (goal.targetDate) {
      var dateMeta = el("span");
      dateMeta.textContent = "\uD83C\uDFAF " + formatDisplayDate(goal.targetDate);
      meta.appendChild(dateMeta);
    }
    var catMeta = el("span");
    catMeta.style.color = catColor;
    catMeta.textContent = CATEGORIES[goal.category] ? CATEGORIES[goal.category].label : goal.category;
    meta.appendChild(catMeta);

    if (goal.completedAt) {
      var doneMeta = el("span");
      doneMeta.textContent = "\u2705 " + formatDisplayDate(goal.completedAt);
      meta.appendChild(doneMeta);
    }
    body.appendChild(meta);

    card.appendChild(body);
    return card;
  }

  /* ---------- Build: Milestone Row ---------- */

  function buildMilestoneRow(goalId, ms) {
    var row = el("div", "gt-milestone" + (ms.completed ? " done" : ""));

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = ms.completed;
    cb.addEventListener("change", (function (gId, mId) {
      return function () { toggleMilestone(gId, mId); };
    })(goalId, ms.id));

    var label = el("span");
    label.textContent = ms.title;

    row.appendChild(cb);
    row.appendChild(label);
    return row;
  }

  /* ---------- Init ---------- */

  function init(el) {
    containerEl = el;
    goals = load();
    render();
  }

  /* ---------- Public API ---------- */

  return {
    init: init,
    addGoal: addGoal,
    updateGoal: updateGoal,
    deleteGoal: deleteGoal,
    addMilestone: addMilestone,
    toggleMilestone: toggleMilestone,
    getStats: getStats,
    render: render
  };
})();
