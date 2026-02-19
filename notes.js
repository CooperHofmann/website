(function () {
  "use strict";

  var STORAGE_KEY = "quick_notes";
  var DEBOUNCE_MS = 500;
  var CATEGORY_COLORS = {
    school: "#3B82F6",
    home: "#10B981",
    personal: "#8B5CF6",
    work: "#F59E0B",
  };
  var CATEGORIES = Object.keys(CATEGORY_COLORS);

  var notes = [];
  var containerEl = null;
  var searchQuery = "";
  var expandedNoteId = null;
  var debounceTimers = {};

  // ── Persistence ──

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (e) {
      console.error("Failed to save notes:", e);
    }
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      var parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to load notes:", e);
      return [];
    }
  }

  // ── Helpers ──

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function debounce(key, fn) {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(fn, DEBOUNCE_MS);
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    var month = d.toLocaleString("default", { month: "short" });
    var day = d.getDate();
    var year = d.getFullYear();
    return year === now.getFullYear()
      ? month + " " + day
      : month + " " + day + ", " + year;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    var escaped = escapeHtml(text);
    var lines = escaped.split("\n");
    var html = [];
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var bulletMatch = line.match(/^[-*]\s+(.*)/);
      if (bulletMatch) {
        if (!inList) { html.push("<ul>"); inList = true; }
        html.push("<li>" + inlineMarkdown(bulletMatch[1]) + "</li>");
      } else {
        if (inList) { html.push("</ul>"); inList = false; }
        html.push(inlineMarkdown(line));
        if (i < lines.length - 1) html.push("<br>");
      }
    }
    if (inList) html.push("</ul>");
    return html.join("\n");
  }

  function inlineMarkdown(text) {
    // Bold: **text**
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic: *text*
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    // Links: [text](url)
    text = text.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return text;
  }

  function findNote(id) {
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id) return notes[i];
    }
    return null;
  }

  function getFilteredNotes() {
    var q = searchQuery.toLowerCase().trim();
    var filtered = notes;
    if (q) {
      filtered = notes.filter(function (n) {
        return (
          n.title.toLowerCase().indexOf(q) !== -1 ||
          n.content.toLowerCase().indexOf(q) !== -1 ||
          n.tags.join(" ").toLowerCase().indexOf(q) !== -1
        );
      });
    }
    // Pinned first, then by updatedAt descending
    return filtered.slice().sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  // ── Core Methods ──

  function init(el) {
    containerEl = el;
    notes = load();
    injectStyles();
    render();
  }

  function addNote(title, content, category, tags) {
    var cat = CATEGORIES.indexOf(category) !== -1 ? category : "personal";
    var parsedTags = Array.isArray(tags) ? tags : parseTags(tags || "");
    var note = {
      id: generateId(),
      title: title || "Untitled",
      content: content || "",
      pinned: false,
      tags: parsedTags,
      category: cat,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    notes.push(note);
    save();
    render();
    return note;
  }

  function updateNote(id, updates) {
    var note = findNote(id);
    if (!note) return null;
    var allowed = ["title", "content", "category", "tags", "pinned"];
    for (var i = 0; i < allowed.length; i++) {
      var key = allowed[i];
      if (updates[key] !== undefined) {
        if (key === "tags" && typeof updates[key] === "string") {
          note[key] = parseTags(updates[key]);
        } else if (key === "category") {
          if (CATEGORIES.indexOf(updates[key]) !== -1) {
            note[key] = updates[key];
          }
        } else {
          note[key] = updates[key];
        }
      }
    }
    note.updatedAt = new Date().toISOString();
    save();
    return note;
  }

  function deleteNote(id) {
    notes = notes.filter(function (n) { return n.id !== id; });
    if (expandedNoteId === id) expandedNoteId = null;
    save();
    render();
  }

  function togglePin(id) {
    var note = findNote(id);
    if (!note) return;
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    save();
    render();
  }

  function searchNotes(query) {
    searchQuery = query || "";
    render();
  }

  function getStats() {
    var byCategory = {};
    CATEGORIES.forEach(function (c) { byCategory[c] = 0; });
    var pinned = 0;
    for (var i = 0; i < notes.length; i++) {
      byCategory[notes[i].category] = (byCategory[notes[i].category] || 0) + 1;
      if (notes[i].pinned) pinned++;
    }
    return { total: notes.length, byCategory: byCategory, pinned: pinned };
  }

  function parseTags(str) {
    return str
      .split(",")
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });
  }

  // ── Rendering ──

  function render() {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    var wrapper = el("div", "qn-wrapper");
    wrapper.appendChild(buildHeader());
    wrapper.appendChild(buildNoteGrid());
    containerEl.appendChild(wrapper);
  }

  function buildHeader() {
    var header = el("div", "qn-header");

    // Search bar
    var searchWrap = el("div", "qn-search-wrap");
    var searchIcon = el("span", "qn-search-icon");
    searchIcon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="8"></circle>' +
      '<line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
    var searchInput = el("input", "qn-search-input");
    searchInput.type = "text";
    searchInput.placeholder = "Search notes\u2026";
    searchInput.value = searchQuery;
    searchInput.addEventListener("input", function (e) {
      searchQuery = e.target.value;
      debounce("search", function () { renderGrid(); });
    });
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);

    // New note button
    var addBtn = el("button", "qn-add-btn");
    addBtn.textContent = "+ New Note";
    addBtn.addEventListener("click", function () {
      var note = addNote("", "", "personal", []);
      expandedNoteId = note.id;
      render();
      var titleInput = containerEl.querySelector(
        '.qn-edit-title[data-id="' + note.id + '"]'
      );
      if (titleInput) titleInput.focus();
    });

    header.appendChild(searchWrap);
    header.appendChild(addBtn);
    return header;
  }

  function buildNoteGrid() {
    var grid = el("div", "qn-grid");
    grid.id = "qn-grid";
    var filtered = getFilteredNotes();

    if (filtered.length === 0) {
      var empty = el("div", "qn-empty");
      empty.textContent = searchQuery
        ? "No notes match your search."
        : "No notes yet. Click \u201C+ New Note\u201D to get started!";
      grid.appendChild(empty);
      return grid;
    }

    for (var i = 0; i < filtered.length; i++) {
      var note = filtered[i];
      if (note.id === expandedNoteId) {
        grid.appendChild(buildExpandedCard(note));
      } else {
        grid.appendChild(buildNoteCard(note));
      }
    }
    return grid;
  }

  function renderGrid() {
    var grid = document.getElementById("qn-grid");
    if (!grid) return;
    var parent = grid.parentNode;
    var newGrid = buildNoteGrid();
    parent.replaceChild(newGrid, grid);
  }

  function buildNoteCard(note) {
    var card = el("div", "qn-card");

    // Color strip
    var strip = el("div", "qn-card-strip");
    strip.style.background = CATEGORY_COLORS[note.category] || "#999";
    card.appendChild(strip);

    var body = el("div", "qn-card-body");

    // Header row: title + pin icon
    var hdr = el("div", "qn-card-header");
    var title = el("span", "qn-card-title");
    title.textContent = note.title || "Untitled";
    if (note.pinned) {
      var pinIcon = el("span", "qn-pin-icon");
      pinIcon.title = "Pinned";
      pinIcon.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
        '<path d="M16 2l-4 4-5-2-4 4 7 7-4 4 1 1 5-5 7 7 4-4-2-5 4-4z"/></svg>';
      hdr.appendChild(pinIcon);
    }
    hdr.appendChild(title);
    body.appendChild(hdr);

    // Content preview (first 3 lines)
    var preview = el("div", "qn-card-preview");
    var lines = (note.content || "").split("\n").slice(0, 3).join("\n");
    preview.innerHTML = renderMarkdown(lines);
    body.appendChild(preview);

    // Tags
    if (note.tags.length > 0) {
      var tagsRow = el("div", "qn-card-tags");
      for (var t = 0; t < note.tags.length; t++) {
        var badge = el("span", "qn-tag-badge");
        badge.textContent = note.tags[t];
        tagsRow.appendChild(badge);
      }
      body.appendChild(tagsRow);
    }

    // Footer: timestamp + actions
    var footer = el("div", "qn-card-footer");
    var time = el("span", "qn-card-time");
    var label =
      note.updatedAt !== note.createdAt
        ? "Updated " + formatDate(note.updatedAt)
        : formatDate(note.createdAt);
    time.textContent = label;
    footer.appendChild(time);

    var actions = el("span", "qn-card-actions");
    var pinBtn = el("button", "qn-action-btn");
    pinBtn.textContent = note.pinned ? "Unpin" : "Pin";
    pinBtn.title = note.pinned ? "Unpin note" : "Pin note";
    pinBtn.addEventListener(
      "click",
      (function (id) {
        return function (e) {
          e.stopPropagation();
          togglePin(id);
        };
      })(note.id)
    );
    var delBtn = el("button", "qn-action-btn qn-action-del");
    delBtn.textContent = "Delete";
    delBtn.addEventListener(
      "click",
      (function (id) {
        return function (e) {
          e.stopPropagation();
          deleteNote(id);
        };
      })(note.id)
    );
    actions.appendChild(pinBtn);
    actions.appendChild(delBtn);
    footer.appendChild(actions);
    body.appendChild(footer);

    card.appendChild(body);

    // Click to expand
    card.addEventListener(
      "click",
      (function (id) {
        return function () {
          expandedNoteId = id;
          render();
        };
      })(note.id)
    );

    return card;
  }

  function buildExpandedCard(note) {
    var card = el("div", "qn-card qn-card-expanded");

    // Color strip
    var strip = el("div", "qn-card-strip");
    strip.style.background = CATEGORY_COLORS[note.category] || "#999";
    strip.id = "qn-strip-" + note.id;
    card.appendChild(strip);

    var body = el("div", "qn-card-body");

    // Close button
    var closeBtn = el("button", "qn-close-btn");
    closeBtn.textContent = "\u00D7";
    closeBtn.title = "Collapse";
    closeBtn.addEventListener("click", function () {
      expandedNoteId = null;
      render();
    });
    body.appendChild(closeBtn);

    // Title input
    var titleInput = el("input", "qn-edit-title");
    titleInput.type = "text";
    titleInput.placeholder = "Note title\u2026";
    titleInput.value = note.title;
    titleInput.setAttribute("data-id", note.id);
    titleInput.addEventListener(
      "input",
      (function (id) {
        return function (e) {
          debounce("title-" + id, function () {
            updateNote(id, { title: e.target.value });
          });
        };
      })(note.id)
    );
    body.appendChild(titleInput);

    // Category select
    var catRow = el("div", "qn-edit-row");
    var catLabel = el("label", "qn-edit-label");
    catLabel.textContent = "Category";
    var catSelect = el("select", "qn-edit-select");
    for (var c = 0; c < CATEGORIES.length; c++) {
      var opt = document.createElement("option");
      opt.value = CATEGORIES[c];
      opt.textContent = CATEGORIES[c].charAt(0).toUpperCase() + CATEGORIES[c].slice(1);
      if (CATEGORIES[c] === note.category) opt.selected = true;
      catSelect.appendChild(opt);
    }
    catSelect.addEventListener(
      "change",
      (function (id) {
        return function (e) {
          updateNote(id, { category: e.target.value });
          var s = document.getElementById("qn-strip-" + id);
          if (s) s.style.background = CATEGORY_COLORS[e.target.value] || "#999";
        };
      })(note.id)
    );
    catRow.appendChild(catLabel);
    catRow.appendChild(catSelect);
    body.appendChild(catRow);

    // Tags input
    var tagsRow = el("div", "qn-edit-row");
    var tagsLabel = el("label", "qn-edit-label");
    tagsLabel.textContent = "Tags";
    var tagsInput = el("input", "qn-edit-tags");
    tagsInput.type = "text";
    tagsInput.placeholder = "Comma-separated tags\u2026";
    tagsInput.value = note.tags.join(", ");
    tagsInput.addEventListener(
      "input",
      (function (id) {
        return function (e) {
          debounce("tags-" + id, function () {
            updateNote(id, { tags: e.target.value });
          });
        };
      })(note.id)
    );
    tagsRow.appendChild(tagsLabel);
    tagsRow.appendChild(tagsInput);
    body.appendChild(tagsRow);

    // Content textarea
    var textarea = el("textarea", "qn-edit-content");
    textarea.placeholder = "Write your note\u2026 (supports **bold**, *italic*, - lists, [links](url))";
    textarea.value = note.content;
    textarea.addEventListener(
      "input",
      (function (id) {
        return function (e) {
          debounce("content-" + id, function () {
            updateNote(id, { content: e.target.value });
          });
        };
      })(note.id)
    );
    body.appendChild(textarea);

    // Footer: timestamps + actions
    var footer = el("div", "qn-card-footer");
    var time = el("span", "qn-card-time");
    time.textContent =
      "Created " + formatDate(note.createdAt) +
      (note.updatedAt !== note.createdAt
        ? " \u00B7 Updated " + formatDate(note.updatedAt)
        : "");
    footer.appendChild(time);

    var actions = el("span", "qn-card-actions");
    var pinBtn = el("button", "qn-action-btn");
    pinBtn.textContent = note.pinned ? "Unpin" : "Pin";
    pinBtn.addEventListener(
      "click",
      (function (id) {
        return function () { togglePin(id); };
      })(note.id)
    );
    var delBtn = el("button", "qn-action-btn qn-action-del");
    delBtn.textContent = "Delete";
    delBtn.addEventListener(
      "click",
      (function (id) {
        return function () { deleteNote(id); };
      })(note.id)
    );
    actions.appendChild(pinBtn);
    actions.appendChild(delBtn);
    footer.appendChild(actions);
    body.appendChild(footer);

    card.appendChild(body);
    return card;
  }

  // ── Styles ──

  function injectStyles() {
    if (document.getElementById("qn-styles")) return;
    var style = document.createElement("style");
    style.id = "qn-styles";
    style.textContent = [
      ".qn-wrapper{font-family:system-ui,-apple-system,sans-serif;max-width:960px;margin:0 auto;padding:16px}",
      ".qn-header{display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap}",
      ".qn-search-wrap{display:flex;align-items:center;flex:1;min-width:200px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;gap:8px;transition:border-color .2s}",
      ".qn-search-wrap:focus-within{border-color:#3B82F6;background:#fff}",
      ".qn-search-icon{color:#94a3b8;display:flex;align-items:center;flex-shrink:0}",
      ".qn-search-input{border:none;outline:none;background:transparent;font-size:14px;width:100%;color:#1e293b}",
      ".qn-add-btn{background:#3B82F6;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .2s}",
      ".qn-add-btn:hover{background:#2563EB}",
      ".qn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}",
      ".qn-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;cursor:pointer;transition:box-shadow .2s,transform .15s}",
      ".qn-card:hover{box-shadow:0 4px 12px rgba(0,0,0,.08);transform:translateY(-1px)}",
      ".qn-card-expanded{grid-column:1/-1;cursor:default}",
      ".qn-card-expanded:hover{transform:none}",
      ".qn-card-strip{height:4px;width:100%}",
      ".qn-card-body{padding:14px 16px}",
      ".qn-card-header{display:flex;align-items:center;gap:6px;margin-bottom:8px}",
      ".qn-pin-icon{color:#F59E0B;display:flex;align-items:center}",
      ".qn-card-title{font-size:15px;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".qn-card-preview{font-size:13px;color:#475569;line-height:1.5;max-height:4.5em;overflow:hidden;margin-bottom:10px;word-break:break-word}",
      ".qn-card-preview ul{margin:4px 0;padding-left:18px}",
      ".qn-card-preview a{color:#3B82F6;text-decoration:underline}",
      ".qn-card-preview strong{font-weight:600}",
      ".qn-card-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}",
      ".qn-tag-badge{background:#f1f5f9;color:#475569;font-size:11px;padding:2px 8px;border-radius:12px;white-space:nowrap}",
      ".qn-card-footer{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:10px;margin-top:4px}",
      ".qn-card-actions{display:flex;gap:6px}",
      ".qn-action-btn{background:none;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;color:#64748b;transition:all .15s}",
      ".qn-action-btn:hover{background:#f8fafc;border-color:#cbd5e1;color:#334155}",
      ".qn-action-del:hover{background:#fef2f2;border-color:#fca5a5;color:#dc2626}",
      ".qn-close-btn{float:right;background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1;padding:0 0 8px 8px;transition:color .15s}",
      ".qn-close-btn:hover{color:#1e293b}",
      ".qn-edit-title{width:100%;border:none;border-bottom:2px solid #e2e8f0;padding:8px 0;font-size:18px;font-weight:600;color:#1e293b;outline:none;background:transparent;margin-bottom:12px;box-sizing:border-box}",
      ".qn-edit-title:focus{border-color:#3B82F6}",
      ".qn-edit-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}",
      ".qn-edit-label{font-size:13px;font-weight:500;color:#64748b;min-width:64px}",
      ".qn-edit-select{border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:13px;color:#1e293b;outline:none;background:#fff;cursor:pointer}",
      ".qn-edit-select:focus{border-color:#3B82F6}",
      ".qn-edit-tags{flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:6px 10px;font-size:13px;color:#1e293b;outline:none}",
      ".qn-edit-tags:focus{border-color:#3B82F6}",
      ".qn-edit-content{width:100%;min-height:180px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:14px;font-family:inherit;color:#1e293b;line-height:1.6;resize:vertical;outline:none;margin-bottom:12px;box-sizing:border-box}",
      ".qn-edit-content:focus{border-color:#3B82F6}",
      ".qn-empty{grid-column:1/-1;text-align:center;padding:48px 16px;color:#94a3b8;font-size:15px}",
    ].join("\n");
    document.head.appendChild(style);
  }

  // ── Public API ──

  window.NotesManager = {
    init: init,
    addNote: addNote,
    updateNote: updateNote,
    deleteNote: deleteNote,
    togglePin: togglePin,
    searchNotes: searchNotes,
    getStats: getStats,
    render: render,
  };
})();
