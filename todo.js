/* ==========================================================================
   Todo Manager — Todo list with categories, priorities & drag-and-drop
   ========================================================================== */

var TodoManager = (function () {
  "use strict";

  var STORAGE_KEY = "todo_items";

  var DEFAULT_PRIORITY = 3;

  var CATEGORIES = {
    school:   { label: "School",   color: "#3B82F6" },
    home:     { label: "Home",     color: "#10B981" },
    personal: { label: "Personal", color: "#8B5CF6" },
    work:     { label: "Work",     color: "#F59E0B" }
  };

  var todos = [];
  var containerEl = null;
  var activeFilter = "all";
  var showCompleted = false;
  var dragSourceId = null;

  /* ---------- Persistence ---------- */

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
      if (typeof CloudSync !== "undefined") {
        CloudSync.syncToCloud("todos", todos);
      }
    } catch (e) {
      console.error("Failed to save todos:", e);
    }
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      var parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to load todos:", e);
      return [];
    }
  }

  /* ---------- Helpers ---------- */

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "todo-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  function nextOrder() {
    var max = 0;
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].order > max) max = todos[i].order;
    }
    return max + 1;
  }

  /* ---------- Public API ---------- */

  function init(el) {
    containerEl = el;
    todos = load();
    render();
  }

  function addTodo(title, category, priority, dueDate) {
    if (!title || !title.trim()) return null;
    var p = parseInt(priority, 10);
    if (isNaN(p) || p < 1 || p > 4) p = DEFAULT_PRIORITY;

    var todo = {
      id: generateId(),
      title: title.trim(),
      category: category || "personal",
      priority: p,
      dueDate: dueDate || null,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      order: nextOrder(),
      deleted: false
    };
    todos.push(todo);
    save();
    render();
    return todo;
  }

  function toggleTodo(id) {
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos[i].completed = !todos[i].completed;
        todos[i].completedAt = todos[i].completed ? new Date().toISOString() : null;
        break;
      }
    }
    save();
    render();
  }

  function deleteTodo(id) {
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos[i].deleted = true;
        break;
      }
    }
    save();
    render();
  }

  function updateTodo(id, updates) {
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        var keys = Object.keys(updates);
        for (var k = 0; k < keys.length; k++) {
          todos[i][keys[k]] = updates[keys[k]];
        }
        break;
      }
    }
    save();
    render();
  }

  function reorderTodo(id, newOrder) {
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === id) {
        todos[i].order = newOrder;
        break;
      }
    }
    save();
    render();
  }

  function getStats() {
    var active = todos.filter(function (t) { return !t.deleted; });
    var completed = active.filter(function (t) { return t.completed; });
    var byCategory = {};
    Object.keys(CATEGORIES).forEach(function (cat) {
      byCategory[cat] = active.filter(function (t) { return t.category === cat; }).length;
    });
    return { total: active.length, completed: completed.length, byCategory: byCategory };
  }

  /* ---------- Rendering ---------- */

  function render() {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    var wrapper = document.createElement("div");
    wrapper.className = "todo-manager";

    wrapper.appendChild(buildFilterBar());
    wrapper.appendChild(buildAddForm());
    wrapper.appendChild(buildTodoList());

    containerEl.appendChild(wrapper);
  }

  /* --- Filter bar --- */

  function buildFilterBar() {
    var bar = document.createElement("div");
    bar.className = "todo-filter-bar";
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;";

    var filters = [{ key: "all", label: "All" }];
    Object.keys(CATEGORIES).forEach(function (key) {
      filters.push({ key: key, label: CATEGORIES[key].label });
    });

    filters.forEach(function (f) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = f.label;
      var isActive = activeFilter === f.key;
      var color = f.key !== "all" ? CATEGORIES[f.key].color : "#6B7280";
      btn.style.cssText =
        "padding:4px 12px;border-radius:16px;border:1px solid " + color + ";" +
        "background:" + (isActive ? color : "transparent") + ";" +
        "color:" + (isActive ? "#fff" : color) + ";" +
        "cursor:pointer;font-size:13px;font-weight:500;";
      btn.addEventListener("click", function () {
        activeFilter = f.key;
        render();
      });
      bar.appendChild(btn);
    });

    // Show Completed toggle
    var toggle = document.createElement("label");
    toggle.style.cssText = "margin-left:auto;display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;color:#6B7280;";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = showCompleted;
    cb.addEventListener("change", function () {
      showCompleted = cb.checked;
      render();
    });
    toggle.appendChild(cb);
    toggle.appendChild(document.createTextNode("Show Completed"));
    bar.appendChild(toggle);

    return bar;
  }

  /* --- Quick-add form --- */

  function buildAddForm() {
    var form = document.createElement("form");
    form.className = "todo-add-form";
    form.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;align-items:center;";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "New todo\u2026";
    input.required = true;
    input.style.cssText = "flex:1;min-width:160px;padding:6px 10px;border:1px solid #D1D5DB;border-radius:6px;font-size:14px;";

    var select = document.createElement("select");
    select.style.cssText = "padding:6px 8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;";
    Object.keys(CATEGORIES).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = CATEGORIES[key].label;
      select.appendChild(opt);
    });

    var prioritySel = document.createElement("select");
    prioritySel.style.cssText = "padding:6px 8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;";
    var priorityLabels = ["", "Urgent", "High", "Medium", "Low"];
    for (var p = 1; p <= 4; p++) {
      var pOpt = document.createElement("option");
      pOpt.value = p;
      pOpt.textContent = "P" + p + " \u2013 " + priorityLabels[p];
      if (p === DEFAULT_PRIORITY) pOpt.selected = true;
      prioritySel.appendChild(pOpt);
    }

    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.style.cssText = "padding:6px 8px;border:1px solid #D1D5DB;border-radius:6px;font-size:13px;";

    var btn = document.createElement("button");
    btn.type = "submit";
    btn.textContent = "Add";
    btn.style.cssText = "padding:6px 16px;border:none;border-radius:6px;background:#3B82F6;color:#fff;font-size:14px;cursor:pointer;";

    form.appendChild(input);
    form.appendChild(select);
    form.appendChild(prioritySel);
    form.appendChild(dateInput);
    form.appendChild(btn);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = input.value.trim();
      if (!title) return;
      addTodo(title, select.value, parseInt(prioritySel.value, 10), dateInput.value || null);
      input.value = "";
      dateInput.value = "";
    });

    return form;
  }

  /* --- Todo list --- */

  function buildTodoList() {
    var list = document.createElement("div");
    list.className = "todo-list";

    var visible = todos.filter(function (t) {
      if (t.deleted) return false;
      if (activeFilter !== "all" && t.category !== activeFilter) return false;
      return true;
    });

    var active = visible.filter(function (t) { return !t.completed; });
    var completed = visible.filter(function (t) { return t.completed; });

    active.sort(function (a, b) { return a.order - b.order; });
    completed.sort(function (a, b) { return a.order - b.order; });

    active.forEach(function (todo) {
      list.appendChild(buildCard(todo));
    });

    if (showCompleted && completed.length > 0) {
      var divider = document.createElement("div");
      divider.style.cssText = "margin:12px 0;border-top:1px solid #E5E7EB;padding-top:8px;font-size:12px;color:#9CA3AF;";
      divider.textContent = "Completed (" + completed.length + ")";
      list.appendChild(divider);

      completed.forEach(function (todo) {
        list.appendChild(buildCard(todo));
      });
    }

    return list;
  }

  /* --- Single card --- */

  function buildCard(todo) {
    var card = document.createElement("div");
    card.className = "todo-card" + (todo.completed ? " todo-completed" : "");
    card.setAttribute("data-id", todo.id);
    card.draggable = true;
    card.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;" +
      "border:1px solid #E5E7EB;border-radius:8px;background:#fff;" +
      (todo.completed ? "opacity:0.55;" : "") +
      "cursor:grab;";

    // Drag events
    card.addEventListener("dragstart", function (e) {
      dragSourceId = todo.id;
      e.dataTransfer.effectAllowed = "move";
      card.style.opacity = "0.4";
    });
    card.addEventListener("dragend", function () {
      card.style.opacity = todo.completed ? "0.55" : "1";
      dragSourceId = null;
    });
    card.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.style.borderColor = "#3B82F6";
    });
    card.addEventListener("dragleave", function () {
      card.style.borderColor = "#E5E7EB";
    });
    card.addEventListener("drop", function (e) {
      e.preventDefault();
      card.style.borderColor = "#E5E7EB";
      if (dragSourceId && dragSourceId !== todo.id) {
        swapOrder(dragSourceId, todo.id);
      }
    });

    // Checkbox
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed;
    checkbox.style.cssText = "width:18px;height:18px;cursor:pointer;flex-shrink:0;";
    checkbox.addEventListener("change", function () {
      toggleTodo(todo.id);
    });
    card.appendChild(checkbox);

    // Title (click to edit)
    var titleEl = document.createElement("span");
    titleEl.className = "todo-title";
    titleEl.textContent = todo.title;
    titleEl.style.cssText =
      "flex:1;font-size:14px;cursor:text;min-width:0;overflow:hidden;text-overflow:ellipsis;" +
      (todo.completed ? "text-decoration:line-through;color:#9CA3AF;" : "");
    titleEl.addEventListener("click", function () {
      if (todo.completed) return;
      var editInput = document.createElement("input");
      editInput.type = "text";
      editInput.value = todo.title;
      editInput.style.cssText = "flex:1;font-size:14px;padding:2px 4px;border:1px solid #3B82F6;border-radius:4px;";
      titleEl.replaceWith(editInput);
      editInput.focus();

      var commit = function () {
        var newTitle = editInput.value.trim();
        if (newTitle && newTitle !== todo.title) {
          updateTodo(todo.id, { title: newTitle });
        } else {
          render();
        }
      };
      editInput.addEventListener("blur", commit);
      editInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { editInput.blur(); }
        if (e.key === "Escape") { editInput.value = todo.title; editInput.blur(); }
      });
    });
    card.appendChild(titleEl);

    // Category badge
    var catInfo = CATEGORIES[todo.category] || CATEGORIES.personal;
    var badge = document.createElement("span");
    badge.textContent = catInfo.label;
    badge.style.cssText =
      "padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;" +
      "background:" + catInfo.color + "22;color:" + catInfo.color + ";white-space:nowrap;";
    card.appendChild(badge);

    // Due date
    if (todo.dueDate) {
      var due = document.createElement("span");
      due.textContent = "\uD83D\uDCC5 " + todo.dueDate;
      due.style.cssText = "font-size:12px;color:#6B7280;white-space:nowrap;";
      card.appendChild(due);
    }

    // Delete button
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "\u00D7";
    delBtn.title = "Delete";
    delBtn.style.cssText =
      "border:none;background:transparent;font-size:20px;line-height:1;" +
      "color:#D1D5DB;cursor:pointer;padding:0 4px;flex-shrink:0;";
    delBtn.addEventListener("mouseenter", function () { delBtn.style.color = "#EF4444"; });
    delBtn.addEventListener("mouseleave", function () { delBtn.style.color = "#D1D5DB"; });
    delBtn.addEventListener("click", function () { deleteTodo(todo.id); });
    card.appendChild(delBtn);

    return card;
  }

  /* --- Drag-and-drop swap --- */

  function swapOrder(sourceId, targetId) {
    var source = null;
    var target = null;
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].id === sourceId) source = todos[i];
      if (todos[i].id === targetId) target = todos[i];
    }
    if (source && target) {
      var tmp = source.order;
      source.order = target.order;
      target.order = tmp;
      save();
      render();
    }
  }

  return {
    init: init,
    addTodo: addTodo,
    toggleTodo: toggleTodo,
    deleteTodo: deleteTodo,
    updateTodo: updateTodo,
    reorderTodo: reorderTodo,
    getStats: getStats,
    render: render
  };
})();
