/* ==========================================================================
   Assignment / Deadline Tracker
   ==========================================================================
   Self-contained vanilla JS module (IIFE).
   Exposes window.AssignmentTracker.
   Persists assignments in localStorage under key "assignments".
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Constants ---------- */

  var STORAGE_KEY = "assignments";

  var CATEGORIES = {
    school:   { label: "School",   color: "#3B82F6" },
    home:     { label: "Home",     color: "#10B981" },
    personal: { label: "Personal", color: "#8B5CF6" },
    work:     { label: "Work",     color: "#F59E0B" }
  };

  var PRIORITIES = ["high", "medium", "low"];
  var STATUSES   = ["not-started", "in-progress", "completed"];

  var PRIORITY_LABELS = { high: "High", medium: "Medium", low: "Low" };
  var STATUS_LABELS   = {
    "not-started": "Not Started",
    "in-progress": "In Progress",
    "completed":   "Completed"
  };

  var URGENCY_THRESHOLDS = {
    red:    { days: 2,  color: "#EF4444", label: "Urgent" },
    yellow: { days: 7,  color: "#F59E0B", label: "This Week" },
    green:  { days: Infinity, color: "#10B981", label: "Plenty of Time" }
  };

  var MS_PER_DAY = 86400000;

  /* ---------- State ---------- */

  var assignments = [];
  var containerEl = null;
  var viewMode    = "card";       // "card" | "table"
  var activeTab   = "active";     // "active" | "archive"
  var sortField   = "dueDate";
  var sortDir     = "asc";
  var filters     = { category: "all", status: "all", urgency: "all" };

  /* ---------- Persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
      if (typeof CloudSync !== "undefined") {
        CloudSync.syncToCloud("assignments", assignments);
      }
    } catch (e) {
      console.error("Failed to save assignments:", e);
    }
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      var parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to load assignments:", e);
      return [];
    }
  }

  /* ---------- Helpers ---------- */

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "asgn-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function btn(text, cls, handler) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls || "";
    b.textContent = text;
    if (handler) b.addEventListener("click", handler);
    return b;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return Infinity;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var due = new Date(dateStr + "T00:00:00");
    return Math.ceil((due - now) / MS_PER_DAY);
  }

  function getUrgency(dateStr) {
    var days = daysUntil(dateStr);
    if (days <= URGENCY_THRESHOLDS.red.days) return "red";
    if (days <= URGENCY_THRESHOLDS.yellow.days) return "yellow";
    return "green";
  }

  function urgencyColor(dateStr) {
    return URGENCY_THRESHOLDS[getUrgency(dateStr)].color;
  }

  function urgencyLabel(dateStr) {
    return URGENCY_THRESHOLDS[getUrgency(dateStr)].label;
  }

  function countdownText(dateStr) {
    if (!dateStr) return "";
    var days = daysUntil(dateStr);
    if (days < 0) return "Overdue by " + Math.abs(days) + " day" + (Math.abs(days) !== 1 ? "s" : "");
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return "Due in " + days + " days";
  }

  function findById(id) {
    for (var i = 0; i < assignments.length; i++) {
      if (assignments[i].id === id) return assignments[i];
    }
    return null;
  }

  function priorityWeight(p) {
    return p === "high" ? 0 : p === "medium" ? 1 : 2;
  }

  function statusWeight(s) {
    return s === "not-started" ? 0 : s === "in-progress" ? 1 : 2;
  }

  /* ---------- Public API ---------- */

  function init(elRef) {
    containerEl = typeof elRef === "string"
      ? document.querySelector(elRef)
      : elRef;
    if (!containerEl) throw new Error("AssignmentTracker: container element not found");
    assignments = load();
    injectStyles();
    render();
  }

  function addAssignment(data) {
    if (!data || !data.name || !data.name.trim()) return null;
    var assignment = {
      id:          generateId(),
      name:        data.name.trim(),
      course:      (data.course || "").trim(),
      dueDate:     data.dueDate || null,
      priority:    PRIORITIES.indexOf(data.priority) !== -1 ? data.priority : "medium",
      status:      STATUSES.indexOf(data.status) !== -1 ? data.status : "not-started",
      category:    CATEGORIES[data.category] ? data.category : "personal",
      notes:       (data.notes || "").trim(),
      createdAt:   new Date().toISOString(),
      completedAt: null,
      deleted:     false
    };
    assignments.push(assignment);
    save();
    render();
    return assignment;
  }

  function updateAssignment(id, updates) {
    var a = findById(id);
    if (!a || a.deleted) return null;
    var keys = Object.keys(updates);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === "id" || k === "createdAt" || k === "deleted") continue;
      a[k] = updates[k];
    }
    if (updates.status === "completed" && !a.completedAt) {
      a.completedAt = new Date().toISOString();
    } else if (updates.status && updates.status !== "completed") {
      a.completedAt = null;
    }
    save();
    render();
    return a;
  }

  function deleteAssignment(id) {
    var a = findById(id);
    if (!a) return false;
    a.deleted = true;
    save();
    render();
    return true;
  }

  function getStats() {
    var active = assignments.filter(function (a) { return !a.deleted; });
    var byStatus = { "not-started": 0, "in-progress": 0, "completed": 0 };
    var byUrgency = { red: 0, yellow: 0, green: 0 };

    for (var i = 0; i < active.length; i++) {
      var a = active[i];
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      if (a.status !== "completed" && a.dueDate) {
        var u = getUrgency(a.dueDate);
        byUrgency[u] = (byUrgency[u] || 0) + 1;
      }
    }
    return {
      total:     active.length,
      byStatus:  byStatus,
      byUrgency: byUrgency
    };
  }

  /* ---------- Filtering & Sorting ---------- */

  function getFilteredAssignments(completed) {
    return assignments.filter(function (a) {
      if (a.deleted) return false;
      if (completed && a.status !== "completed") return false;
      if (!completed && a.status === "completed") return false;
      if (filters.category !== "all" && a.category !== filters.category) return false;
      if (filters.status !== "all" && a.status !== filters.status) return false;
      if (filters.urgency !== "all" && a.dueDate) {
        if (getUrgency(a.dueDate) !== filters.urgency) return false;
      } else if (filters.urgency !== "all" && !a.dueDate) {
        return false;
      }
      return true;
    });
  }

  function sortAssignments(list) {
    var dir = sortDir === "asc" ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var va, vb;
      switch (sortField) {
        case "name":
          va = a.name.toLowerCase();
          vb = b.name.toLowerCase();
          return va < vb ? -dir : va > vb ? dir : 0;
        case "course":
          va = (a.course || "").toLowerCase();
          vb = (b.course || "").toLowerCase();
          return va < vb ? -dir : va > vb ? dir : 0;
        case "dueDate":
          va = a.dueDate || "9999-12-31";
          vb = b.dueDate || "9999-12-31";
          return va < vb ? -dir : va > vb ? dir : 0;
        case "priority":
          return (priorityWeight(a.priority) - priorityWeight(b.priority)) * dir;
        case "status":
          return (statusWeight(a.status) - statusWeight(b.status)) * dir;
        default:
          return 0;
      }
    });
  }

  /* ---------- Rendering ---------- */

  function render() {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    var wrapper = el("div", "at-wrapper");
    wrapper.appendChild(buildViewToggle());
    wrapper.appendChild(buildQuickAddForm());
    wrapper.appendChild(buildFilterBar());
    wrapper.appendChild(buildTabBar());

    var active = sortAssignments(getFilteredAssignments(false));
    var archived = sortAssignments(getFilteredAssignments(true));

    if (activeTab === "active") {
      wrapper.appendChild(
        viewMode === "table" ? buildTable(active) : buildCardGrid(active)
      );
      if (active.length === 0) {
        var empty = el("p", "at-empty");
        empty.textContent = "No active assignments. Add one above!";
        wrapper.appendChild(empty);
      }
    } else {
      wrapper.appendChild(
        viewMode === "table" ? buildTable(archived) : buildCardGrid(archived)
      );
      if (archived.length === 0) {
        var emptyArch = el("p", "at-empty");
        emptyArch.textContent = "No completed assignments yet.";
        wrapper.appendChild(emptyArch);
      }
    }

    containerEl.appendChild(wrapper);
  }

  /* --- View toggle --- */

  function buildViewToggle() {
    var bar = el("div", "at-view-toggle");

    var cardBtn = btn("Card View", "at-toggle-btn" + (viewMode === "card" ? " at-toggle-active" : ""), function () {
      viewMode = "card";
      render();
    });
    var tableBtn = btn("Table View", "at-toggle-btn" + (viewMode === "table" ? " at-toggle-active" : ""), function () {
      viewMode = "table";
      render();
    });

    bar.appendChild(cardBtn);
    bar.appendChild(tableBtn);
    return bar;
  }

  /* --- Quick-add form --- */

  function buildQuickAddForm() {
    var form = el("form", "at-add-form");

    var nameIn = document.createElement("input");
    nameIn.type = "text";
    nameIn.placeholder = "Assignment name\u2026";
    nameIn.required = true;
    nameIn.className = "at-input at-input-name";

    var courseIn = document.createElement("input");
    courseIn.type = "text";
    courseIn.placeholder = "Course";
    courseIn.className = "at-input at-input-course";

    var dateIn = document.createElement("input");
    dateIn.type = "date";
    dateIn.className = "at-input at-input-date";

    var prioritySel = document.createElement("select");
    prioritySel.className = "at-select";
    PRIORITIES.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p;
      opt.textContent = PRIORITY_LABELS[p];
      prioritySel.appendChild(opt);
    });
    prioritySel.value = "medium";

    var catSel = document.createElement("select");
    catSel.className = "at-select";
    Object.keys(CATEGORIES).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = CATEGORIES[key].label;
      catSel.appendChild(opt);
    });

    var addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "at-btn at-btn-add";
    addBtn.textContent = "Add";

    form.appendChild(nameIn);
    form.appendChild(courseIn);
    form.appendChild(dateIn);
    form.appendChild(prioritySel);
    form.appendChild(catSel);
    form.appendChild(addBtn);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      addAssignment({
        name:     nameIn.value,
        course:   courseIn.value,
        dueDate:  dateIn.value || null,
        priority: prioritySel.value,
        category: catSel.value
      });
      nameIn.value = "";
      courseIn.value = "";
      dateIn.value = "";
      prioritySel.value = "medium";
    });

    return form;
  }

  /* --- Filter bar --- */

  function buildFilterBar() {
    var bar = el("div", "at-filter-bar");

    var catLabel = el("span", "at-filter-label");
    catLabel.textContent = "Category:";
    bar.appendChild(catLabel);
    bar.appendChild(buildFilterSelect("category", [{ v: "all", l: "All" }].concat(
      Object.keys(CATEGORIES).map(function (k) { return { v: k, l: CATEGORIES[k].label }; })
    )));

    var statusLabel = el("span", "at-filter-label");
    statusLabel.textContent = "Status:";
    bar.appendChild(statusLabel);
    bar.appendChild(buildFilterSelect("status", [{ v: "all", l: "All" }].concat(
      STATUSES.map(function (s) { return { v: s, l: STATUS_LABELS[s] }; })
    )));

    var urgLabel = el("span", "at-filter-label");
    urgLabel.textContent = "Urgency:";
    bar.appendChild(urgLabel);
    bar.appendChild(buildFilterSelect("urgency", [
      { v: "all",    l: "All" },
      { v: "red",    l: "Urgent (< 2 days)" },
      { v: "yellow", l: "This Week" },
      { v: "green",  l: "Plenty of Time" }
    ]));

    return bar;
  }

  function buildFilterSelect(key, options) {
    var sel = document.createElement("select");
    sel.className = "at-select at-filter-select";
    options.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.v;
      opt.textContent = o.l;
      sel.appendChild(opt);
    });
    sel.value = filters[key];
    sel.addEventListener("change", function () {
      filters[key] = sel.value;
      render();
    });
    return sel;
  }

  /* --- Tab bar (Active / Archive) --- */

  function buildTabBar() {
    var bar = el("div", "at-tab-bar");

    var stats = getStats();
    var activeCount = stats.byStatus["not-started"] + stats.byStatus["in-progress"];
    var archiveCount = stats.byStatus["completed"];

    var activeBtn = btn("Active (" + activeCount + ")", "at-tab" + (activeTab === "active" ? " at-tab-active" : ""), function () {
      activeTab = "active";
      render();
    });
    var archiveBtn = btn("Archive (" + archiveCount + ")", "at-tab" + (activeTab === "archive" ? " at-tab-active" : ""), function () {
      activeTab = "archive";
      render();
    });

    bar.appendChild(activeBtn);
    bar.appendChild(archiveBtn);
    return bar;
  }

  /* --- Card view --- */

  function buildCardGrid(list) {
    var grid = el("div", "at-card-grid");
    list.forEach(function (a) {
      grid.appendChild(buildCard(a));
    });
    return grid;
  }

  function buildCard(a) {
    var card = el("div", "at-card");

    // Urgency color strip on left
    var strip = el("div", "at-card-strip");
    strip.style.backgroundColor = a.dueDate ? urgencyColor(a.dueDate) : "#D1D5DB";
    card.appendChild(strip);

    var body = el("div", "at-card-body");

    // Header: name + delete btn
    var header = el("div", "at-card-header");
    var nameEl = el("span", "at-card-name");
    nameEl.textContent = a.name;
    header.appendChild(nameEl);

    var delBtn = btn("\u00D7", "at-card-delete", function () {
      deleteAssignment(a.id);
    });
    delBtn.title = "Delete";
    header.appendChild(delBtn);
    body.appendChild(header);

    // Course
    if (a.course) {
      var courseEl = el("span", "at-card-course");
      courseEl.textContent = a.course;
      body.appendChild(courseEl);
    }

    // Meta row: due date countdown, priority badge, category badge
    var meta = el("div", "at-card-meta");

    if (a.dueDate) {
      var dueEl = el("span", "at-card-due");
      dueEl.textContent = countdownText(a.dueDate);
      dueEl.style.color = urgencyColor(a.dueDate);
      meta.appendChild(dueEl);
    }

    var priBadge = el("span", "at-badge at-badge-priority at-priority-" + a.priority);
    priBadge.textContent = PRIORITY_LABELS[a.priority];
    meta.appendChild(priBadge);

    var catBadge = el("span", "at-badge at-badge-category");
    catBadge.textContent = CATEGORIES[a.category] ? CATEGORIES[a.category].label : a.category;
    catBadge.style.backgroundColor = (CATEGORIES[a.category] ? CATEGORIES[a.category].color : "#6B7280") + "22";
    catBadge.style.color = CATEGORIES[a.category] ? CATEGORIES[a.category].color : "#6B7280";
    meta.appendChild(catBadge);

    body.appendChild(meta);

    // Notes
    if (a.notes) {
      var notesEl = el("p", "at-card-notes");
      notesEl.textContent = a.notes;
      body.appendChild(notesEl);
    }

    // Status dropdown
    var statusRow = el("div", "at-card-status-row");
    var statusSel = document.createElement("select");
    statusSel.className = "at-select at-status-select";
    STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s];
      statusSel.appendChild(opt);
    });
    statusSel.value = a.status;
    statusSel.addEventListener("change", function () {
      updateAssignment(a.id, { status: statusSel.value });
    });
    statusRow.appendChild(statusSel);
    body.appendChild(statusRow);

    card.appendChild(body);
    return card;
  }

  /* --- Table view --- */

  function buildTable(list) {
    var wrap = el("div", "at-table-wrap");
    var table = el("table", "at-table");

    // Header
    var thead = el("thead");
    var tr = el("tr");
    var columns = [
      { key: "name",     label: "Name" },
      { key: "course",   label: "Course" },
      { key: "dueDate",  label: "Due Date" },
      { key: "priority", label: "Priority" },
      { key: "status",   label: "Status" }
    ];

    columns.forEach(function (col) {
      var th = el("th", "at-th at-th-sortable");
      var sortIndicator = "";
      if (sortField === col.key) {
        sortIndicator = sortDir === "asc" ? " \u25B2" : " \u25BC";
      }
      th.textContent = col.label + sortIndicator;
      th.addEventListener("click", function () {
        if (sortField === col.key) {
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortField = col.key;
          sortDir = "asc";
        }
        render();
      });
      tr.appendChild(th);
    });

    // Actions column (not sortable)
    var thAct = el("th", "at-th");
    thAct.textContent = "";
    tr.appendChild(thAct);

    thead.appendChild(tr);
    table.appendChild(thead);

    // Body
    var tbody = el("tbody");
    list.forEach(function (a) {
      tbody.appendChild(buildTableRow(a));
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    return wrap;
  }

  function buildTableRow(a) {
    var tr = el("tr", "at-tr");

    // Name cell with urgency indicator
    var tdName = el("td", "at-td");
    var urgDot = el("span", "at-urgency-dot");
    urgDot.style.backgroundColor = a.dueDate ? urgencyColor(a.dueDate) : "#D1D5DB";
    tdName.appendChild(urgDot);
    var nameSpan = document.createTextNode(" " + a.name);
    tdName.appendChild(nameSpan);
    tr.appendChild(tdName);

    // Course
    var tdCourse = el("td", "at-td");
    tdCourse.textContent = a.course || "\u2014";
    tr.appendChild(tdCourse);

    // Due Date
    var tdDue = el("td", "at-td");
    if (a.dueDate) {
      var dateSpan = el("span");
      dateSpan.textContent = a.dueDate;
      tdDue.appendChild(dateSpan);
      var countdown = el("span", "at-table-countdown");
      countdown.textContent = " (" + countdownText(a.dueDate) + ")";
      countdown.style.color = urgencyColor(a.dueDate);
      tdDue.appendChild(countdown);
    } else {
      tdDue.textContent = "\u2014";
    }
    tr.appendChild(tdDue);

    // Priority badge
    var tdPri = el("td", "at-td");
    var priBadge = el("span", "at-badge at-badge-priority at-priority-" + a.priority);
    priBadge.textContent = PRIORITY_LABELS[a.priority];
    tdPri.appendChild(priBadge);
    tr.appendChild(tdPri);

    // Status badge
    var tdStatus = el("td", "at-td");
    var statusSel = document.createElement("select");
    statusSel.className = "at-select at-status-select";
    STATUSES.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABELS[s];
      statusSel.appendChild(opt);
    });
    statusSel.value = a.status;
    statusSel.addEventListener("change", function () {
      updateAssignment(a.id, { status: statusSel.value });
    });
    tdStatus.appendChild(statusSel);
    tr.appendChild(tdStatus);

    // Delete button
    var tdAct = el("td", "at-td at-td-actions");
    var delBtn = btn("\u00D7", "at-row-delete", function () {
      deleteAssignment(a.id);
    });
    delBtn.title = "Delete";
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);

    return tr;
  }

  /* ---------- Styles (injected once) ---------- */

  var stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;

    var css = [
      /* Wrapper */
      ".at-wrapper {",
      "  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;",
      "  max-width: 900px; margin: 0 auto; padding: 16px;",
      "}",

      /* View toggle */
      ".at-view-toggle {",
      "  display: flex; gap: 8px; margin-bottom: 12px;",
      "}",
      ".at-toggle-btn {",
      "  padding: 6px 16px; border: 1px solid #D1D5DB; border-radius: 6px;",
      "  background: #fff; color: #374151; font-size: 13px; font-weight: 500;",
      "  cursor: pointer; transition: all 0.15s;",
      "}",
      ".at-toggle-btn:hover { background: #F3F4F6; }",
      ".at-toggle-active {",
      "  background: #3B82F6; color: #fff; border-color: #3B82F6;",
      "}",
      ".at-toggle-active:hover { background: #2563EB; }",

      /* Quick-add form */
      ".at-add-form {",
      "  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: center;",
      "}",
      ".at-input {",
      "  padding: 6px 10px; border: 1px solid #D1D5DB; border-radius: 6px;",
      "  font-size: 14px; font-family: inherit;",
      "}",
      ".at-input-name { flex: 2; min-width: 160px; }",
      ".at-input-course { flex: 1; min-width: 100px; }",
      ".at-input-date { min-width: 130px; }",
      ".at-select {",
      "  padding: 6px 8px; border: 1px solid #D1D5DB; border-radius: 6px;",
      "  font-size: 13px; font-family: inherit; background: #fff; cursor: pointer;",
      "}",
      ".at-btn {",
      "  font-family: inherit; font-size: 14px; font-weight: 600;",
      "  padding: 6px 20px; border: none; border-radius: 6px;",
      "  cursor: pointer; transition: opacity 0.15s;",
      "}",
      ".at-btn:hover { opacity: 0.85; }",
      ".at-btn-add { background: #3B82F6; color: #fff; }",

      /* Filter bar */
      ".at-filter-bar {",
      "  display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px;",
      "}",
      ".at-filter-label {",
      "  font-size: 13px; font-weight: 500; color: #6B7280;",
      "}",
      ".at-filter-select { font-size: 12px; }",

      /* Tab bar */
      ".at-tab-bar {",
      "  display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 2px solid #E5E7EB;",
      "}",
      ".at-tab {",
      "  padding: 8px 16px; border: none; background: transparent;",
      "  font-size: 13px; font-weight: 500; color: #6B7280;",
      "  cursor: pointer; border-bottom: 2px solid transparent;",
      "  margin-bottom: -2px; transition: all 0.15s;",
      "}",
      ".at-tab:hover { color: #374151; }",
      ".at-tab-active {",
      "  color: #3B82F6; border-bottom-color: #3B82F6;",
      "}",

      /* Empty state */
      ".at-empty {",
      "  text-align: center; color: #9CA3AF; font-size: 14px; padding: 32px 0;",
      "}",

      /* Card grid */
      ".at-card-grid {",
      "  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));",
      "  gap: 12px;",
      "}",
      ".at-card {",
      "  display: flex; border: 1px solid #E5E7EB; border-radius: 8px;",
      "  background: #fff; overflow: hidden; transition: box-shadow 0.15s;",
      "}",
      ".at-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }",
      ".at-card-strip {",
      "  width: 5px; flex-shrink: 0;",
      "}",
      ".at-card-body {",
      "  flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 6px;",
      "}",
      ".at-card-header {",
      "  display: flex; justify-content: space-between; align-items: flex-start;",
      "}",
      ".at-card-name {",
      "  font-size: 15px; font-weight: 600; color: #111827;",
      "}",
      ".at-card-delete {",
      "  border: none; background: transparent; font-size: 20px; line-height: 1;",
      "  color: #D1D5DB; cursor: pointer; padding: 0 2px; flex-shrink: 0;",
      "}",
      ".at-card-delete:hover { color: #EF4444; }",
      ".at-card-course {",
      "  font-size: 13px; color: #6B7280;",
      "}",
      ".at-card-meta {",
      "  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;",
      "}",
      ".at-card-due {",
      "  font-size: 12px; font-weight: 600;",
      "}",
      ".at-card-notes {",
      "  font-size: 12px; color: #9CA3AF; margin: 0;",
      "  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
      "}",
      ".at-card-status-row {",
      "  margin-top: auto; padding-top: 4px;",
      "}",

      /* Badges */
      ".at-badge {",
      "  display: inline-block; padding: 2px 8px; border-radius: 12px;",
      "  font-size: 11px; font-weight: 600; white-space: nowrap;",
      "}",
      ".at-badge-category {",
      "  /* colors set inline */",
      "}",
      ".at-priority-high   { background: #FEE2E2; color: #DC2626; }",
      ".at-priority-medium { background: #FEF3C7; color: #D97706; }",
      ".at-priority-low    { background: #D1FAE5; color: #059669; }",

      /* Status select */
      ".at-status-select {",
      "  font-size: 12px; padding: 4px 6px;",
      "}",

      /* Table view */
      ".at-table-wrap { overflow-x: auto; }",
      ".at-table {",
      "  width: 100%; border-collapse: collapse; font-size: 14px;",
      "}",
      ".at-th {",
      "  text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 600;",
      "  color: #6B7280; border-bottom: 2px solid #E5E7EB; white-space: nowrap;",
      "}",
      ".at-th-sortable { cursor: pointer; user-select: none; }",
      ".at-th-sortable:hover { color: #111827; }",
      ".at-td {",
      "  padding: 10px 12px; border-bottom: 1px solid #F3F4F6;",
      "  vertical-align: middle;",
      "}",
      ".at-tr:hover { background: #F9FAFB; }",
      ".at-urgency-dot {",
      "  display: inline-block; width: 8px; height: 8px; border-radius: 50%;",
      "  vertical-align: middle;",
      "}",
      ".at-table-countdown {",
      "  font-size: 12px; font-weight: 500;",
      "}",
      ".at-td-actions { text-align: center; }",
      ".at-row-delete {",
      "  border: none; background: transparent; font-size: 18px; line-height: 1;",
      "  color: #D1D5DB; cursor: pointer; padding: 0 4px;",
      "}",
      ".at-row-delete:hover { color: #EF4444; }",
    ].join("\n");

    var styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  /* ---------- Public interface ---------- */

  window.AssignmentTracker = {
    init:             init,
    addAssignment:    addAssignment,
    updateAssignment: updateAssignment,
    deleteAssignment: deleteAssignment,
    getStats:         getStats,
    render:           render
  };
})();
