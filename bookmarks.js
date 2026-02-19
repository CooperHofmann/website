window.BookmarkManager = (function () {
  "use strict";
  var STORAGE_KEY = "bookmarks";
  var CATEGORIES = {
    school:   { label: "School",   color: "#3B82F6" },
    home:     { label: "Home",     color: "#10B981" },
    personal: { label: "Personal", color: "#8B5CF6" },
    work:     { label: "Work",     color: "#F59E0B" }
  };
  var FAVICON_BASE = "https://www.google.com/s2/favicons?domain=";

  var containerEl = null;
  var bookmarks = [];
  var activeFilter = "all";
  var searchQuery = "";
  var editingId = null;
  var styleInjected = false;

  // ── Helpers ──────────────────────────────────────────────

  function generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "bm-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9);
  }

  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function extractDomain(url) {
    try {
      var a = document.createElement("a");
      a.href = url;
      return a.hostname || "";
    } catch (_) {
      return "";
    }
  }

  function faviconUrl(url) {
    var domain = extractDomain(url);
    if (!domain) return "";
    return FAVICON_BASE + encodeURIComponent(domain) + "&sz=32";
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.substring(0, max) + "…" : str;
  }

  function parseTags(raw) {
    if (Array.isArray(raw)) return raw.map(function (t) { return t.trim(); }).filter(Boolean);
    if (typeof raw === "string") {
      return raw.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    }
    return [];
  }

  // ── Persistence ──────────────────────────────────────────

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    } catch (e) {
      console.error("BookmarkManager: failed to save", e);
    }
  }

  function load() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      var parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("BookmarkManager: failed to load", e);
      return [];
    }
  }

  // ── CRUD ─────────────────────────────────────────────────

  function addBookmark(url, title, description, category, tags) {
    var bm = {
      id: generateId(),
      url: url || "",
      title: title || "",
      description: description || "",
      category: CATEGORIES[category] ? category : "personal",
      tags: parseTags(tags),
      favicon: faviconUrl(url),
      createdAt: new Date().toISOString()
    };
    bookmarks.unshift(bm);
    save();
    render();
    return bm;
  }

  function updateBookmark(id, updates) {
    for (var i = 0; i < bookmarks.length; i++) {
      if (bookmarks[i].id === id) {
        var bm = bookmarks[i];
        if (updates.url !== undefined) {
          bm.url = updates.url;
          bm.favicon = faviconUrl(updates.url);
        }
        if (updates.title !== undefined)       bm.title = updates.title;
        if (updates.description !== undefined) bm.description = updates.description;
        if (updates.category !== undefined && CATEGORIES[updates.category]) {
          bm.category = updates.category;
        }
        if (updates.tags !== undefined) bm.tags = parseTags(updates.tags);
        save();
        render();
        return bm;
      }
    }
    return null;
  }

  function deleteBookmark(id) {
    bookmarks = bookmarks.filter(function (b) { return b.id !== id; });
    save();
    render();
  }

  function searchBookmarks(query) {
    if (!query) return bookmarks.slice();
    var q = query.toLowerCase();
    return bookmarks.filter(function (b) {
      return (b.title && b.title.toLowerCase().indexOf(q) !== -1) ||
             (b.url && b.url.toLowerCase().indexOf(q) !== -1) ||
             (b.tags && b.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; }));
    });
  }

  function getStats() {
    var byCategory = {};
    Object.keys(CATEGORIES).forEach(function (k) { byCategory[k] = 0; });
    bookmarks.forEach(function (b) {
      if (byCategory[b.category] !== undefined) byCategory[b.category]++;
    });
    return { total: bookmarks.length, byCategory: byCategory };
  }

  // ── Styles ───────────────────────────────────────────────

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    var css = [
      ".bm-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1100px; margin: 0 auto; }",
      ".bm-search { display:flex; gap:8px; margin-bottom:12px; }",
      ".bm-search input { flex:1; padding:8px 12px; border:1px solid var(--border,#e5e7eb); border-radius:8px; font-size:14px; background:var(--surface,#fff); color:var(--text,#1f2937); }",
      ".bm-form { background:var(--surface,#fff); border:1px solid var(--border,#e5e7eb); border-radius:10px; padding:16px; margin-bottom:14px; }",
      ".bm-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }",
      ".bm-form-full { grid-column: 1 / -1; }",
      ".bm-form label { display:block; font-size:12px; font-weight:600; color:var(--text-secondary,#6b7280); margin-bottom:4px; }",
      ".bm-form input, .bm-form select, .bm-form textarea { width:100%; padding:7px 10px; border:1px solid var(--border,#e5e7eb); border-radius:6px; font-size:13px; background:var(--surface,#fff); color:var(--text,#1f2937); box-sizing:border-box; }",
      ".bm-form textarea { resize:vertical; min-height:50px; }",
      ".bm-form-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }",
      ".bm-btn { padding:7px 16px; border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; transition:opacity .15s; }",
      ".bm-btn:hover { opacity:.85; }",
      ".bm-btn-primary { background:var(--accent,#0071e3); color:#fff; }",
      ".bm-btn-secondary { background:var(--border,#e5e7eb); color:var(--text,#374151); }",
      ".bm-btn-danger { background:#EF4444; color:#fff; }",
      ".bm-btn-add { margin-bottom:12px; }",
      ".bm-filters { display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap; }",
      ".bm-filter-btn { padding:5px 14px; border:1px solid var(--border,#e5e7eb); border-radius:20px; background:var(--surface,#fff); font-size:12px; font-weight:600; cursor:pointer; color:var(--text-secondary,#6b7280); transition:all .15s; }",
      ".bm-filter-btn.active { background:var(--accent,#0071e3); color:#fff; border-color:var(--accent,#0071e3); }",
      ".bm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }",
      ".bm-card { background:var(--surface,#fff); border:1px solid var(--border,#e5e7eb); border-radius:10px; padding:14px; cursor:pointer; transition:box-shadow .15s, transform .15s; position:relative; display:flex; flex-direction:column; gap:8px; }",
      ".bm-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.08); transform:translateY(-1px); }",
      ".bm-card-header { display:flex; align-items:center; gap:10px; }",
      ".bm-card-favicon { width:32px; height:32px; border-radius:6px; flex-shrink:0; background:var(--border,#e5e7eb); }",
      ".bm-card-title { font-size:14px; font-weight:600; color:var(--text,#1f2937); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      ".bm-card-url { font-size:12px; color:var(--text-secondary,#9ca3af); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
      ".bm-card-desc { font-size:12px; color:var(--text-secondary,#6b7280); line-height:1.4; }",
      ".bm-card-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }",
      ".bm-badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }",
      ".bm-tag { display:inline-block; padding:1px 7px; border-radius:10px; font-size:10px; font-weight:500; background:var(--border,#e5e7eb); color:var(--text-secondary,#6b7280); }",
      ".bm-card-actions { display:flex; gap:6px; margin-top:auto; }",
      ".bm-card-actions .bm-btn { padding:4px 10px; font-size:11px; }",
      ".bm-empty { text-align:center; padding:40px 20px; color:var(--text-secondary,#9ca3af); font-size:14px; }"
    ].join("\n");
    var s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── UI Builders ──────────────────────────────────────────

  function buildSearchBar() {
    var wrap = el("div", "bm-search");
    var input = el("input");
    input.type = "text";
    input.placeholder = "Search bookmarks by title, URL, or tag…";
    input.value = searchQuery;
    input.addEventListener("input", function () {
      searchQuery = this.value;
      render();
    });
    wrap.appendChild(input);
    return wrap;
  }

  function buildAddForm(existing) {
    var isEdit = !!existing;
    var form = el("div", "bm-form");
    if (!isEdit) form.style.display = "none";
    form.setAttribute("data-bm-form", "1");

    var grid = el("div", "bm-form-grid");

    // URL
    var urlGroup = el("div");
    var urlLabel = el("label");
    urlLabel.textContent = "URL";
    var urlInput = el("input");
    urlInput.type = "url";
    urlInput.placeholder = "https://example.com";
    urlInput.value = isEdit ? existing.url : "";
    urlInput.setAttribute("data-field", "url");
    urlGroup.appendChild(urlLabel);
    urlGroup.appendChild(urlInput);

    // Title
    var titleGroup = el("div");
    var titleLabel = el("label");
    titleLabel.textContent = "Title";
    var titleInput = el("input");
    titleInput.type = "text";
    titleInput.placeholder = "Bookmark title";
    titleInput.value = isEdit ? existing.title : "";
    titleInput.setAttribute("data-field", "title");
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);

    // Description
    var descGroup = el("div", "bm-form-full");
    var descLabel = el("label");
    descLabel.textContent = "Description (optional)";
    var descInput = el("textarea");
    descInput.placeholder = "Short description…";
    descInput.value = isEdit ? existing.description : "";
    descInput.setAttribute("data-field", "description");
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);

    // Category
    var catGroup = el("div");
    var catLabel = el("label");
    catLabel.textContent = "Category";
    var catSelect = el("select");
    catSelect.setAttribute("data-field", "category");
    Object.keys(CATEGORIES).forEach(function (key) {
      var opt = el("option");
      opt.value = key;
      opt.textContent = CATEGORIES[key].label;
      if (isEdit && existing.category === key) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catGroup.appendChild(catLabel);
    catGroup.appendChild(catSelect);

    // Tags
    var tagsGroup = el("div");
    var tagsLabel = el("label");
    tagsLabel.textContent = "Tags (comma separated)";
    var tagsInput = el("input");
    tagsInput.type = "text";
    tagsInput.placeholder = "js, tutorial, docs";
    tagsInput.value = isEdit ? existing.tags.join(", ") : "";
    tagsInput.setAttribute("data-field", "tags");
    tagsGroup.appendChild(tagsLabel);
    tagsGroup.appendChild(tagsInput);

    grid.appendChild(urlGroup);
    grid.appendChild(titleGroup);
    grid.appendChild(descGroup);
    grid.appendChild(catGroup);
    grid.appendChild(tagsGroup);
    form.appendChild(grid);

    // Favicon preview on URL paste/change
    urlInput.addEventListener("input", function () {
      var fav = faviconUrl(this.value);
      var preview = form.querySelector("[data-bm-fav-preview]");
      if (preview) preview.src = fav || "";
    });

    // Actions
    var actions = el("div", "bm-form-actions");
    if (isEdit) {
      var saveBtn = el("button", "bm-btn bm-btn-primary");
      saveBtn.textContent = "Save";
      saveBtn.type = "button";
      saveBtn.addEventListener("click", function () {
        updateBookmark(existing.id, {
          url: urlInput.value,
          title: titleInput.value,
          description: descInput.value,
          category: catSelect.value,
          tags: tagsInput.value
        });
        editingId = null;
        render();
      });
      var cancelBtn = el("button", "bm-btn bm-btn-secondary");
      cancelBtn.textContent = "Cancel";
      cancelBtn.type = "button";
      cancelBtn.addEventListener("click", function () {
        editingId = null;
        render();
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(saveBtn);
    } else {
      var addBtn = el("button", "bm-btn bm-btn-primary");
      addBtn.textContent = "Add Bookmark";
      addBtn.type = "button";
      addBtn.addEventListener("click", function () {
        var url = urlInput.value.trim();
        var title = titleInput.value.trim();
        if (!url) { urlInput.focus(); return; }
        if (!title) { titleInput.focus(); return; }
        addBookmark(url, title, descInput.value.trim(), catSelect.value, tagsInput.value);
      });
      actions.appendChild(addBtn);
    }
    form.appendChild(actions);

    return form;
  }

  function buildToggleButton() {
    var btn = el("button", "bm-btn bm-btn-primary bm-btn-add");
    btn.textContent = "+ Add Bookmark";
    btn.type = "button";
    btn.addEventListener("click", function () {
      var formEl = containerEl.querySelector("[data-bm-form]");
      if (formEl) {
        var visible = formEl.style.display !== "none";
        formEl.style.display = visible ? "none" : "block";
      }
    });
    return btn;
  }

  function buildFilters() {
    var bar = el("div", "bm-filters");
    var tabs = [{ key: "all", label: "All" }];
    Object.keys(CATEGORIES).forEach(function (k) {
      tabs.push({ key: k, label: CATEGORIES[k].label });
    });
    tabs.forEach(function (tab) {
      var btn = el("button", "bm-filter-btn" + (activeFilter === tab.key ? " active" : ""));
      btn.textContent = tab.label;
      btn.type = "button";
      btn.addEventListener("click", function () {
        activeFilter = tab.key;
        render();
      });
      bar.appendChild(btn);
    });
    return bar;
  }

  function buildCard(bm) {
    var card = el("div", "bm-card");

    // Click card → open link
    card.addEventListener("click", function (e) {
      if (e.target.closest(".bm-card-actions")) return;
      var link = window.open(bm.url, "_blank", "noopener,noreferrer");
      if (link) link.opener = null;
    });

    // Header: favicon + title
    var header = el("div", "bm-card-header");
    var img = el("img", "bm-card-favicon");
    img.src = bm.favicon || "";
    img.alt = "";
    img.width = 32;
    img.height = 32;
    img.loading = "lazy";
    header.appendChild(img);

    var titleEl = el("span", "bm-card-title");
    titleEl.textContent = bm.title;
    header.appendChild(titleEl);
    card.appendChild(header);

    // URL
    var urlEl = el("div", "bm-card-url");
    urlEl.textContent = truncate(bm.url, 60);
    card.appendChild(urlEl);

    // Description
    if (bm.description) {
      var descEl = el("div", "bm-card-desc");
      descEl.textContent = bm.description;
      card.appendChild(descEl);
    }

    // Meta: category badge + tags
    var meta = el("div", "bm-card-meta");
    var catInfo = CATEGORIES[bm.category];
    if (catInfo) {
      var badge = el("span", "bm-badge");
      badge.textContent = catInfo.label;
      badge.style.background = catInfo.color + "22";
      badge.style.color = catInfo.color;
      meta.appendChild(badge);
    }
    if (bm.tags && bm.tags.length) {
      bm.tags.forEach(function (t) {
        var tag = el("span", "bm-tag");
        tag.textContent = t;
        meta.appendChild(tag);
      });
    }
    card.appendChild(meta);

    // Actions
    var actions = el("div", "bm-card-actions");

    var openBtn = el("a", "bm-btn bm-btn-primary");
    openBtn.textContent = "Open";
    openBtn.href = bm.url;
    openBtn.target = "_blank";
    openBtn.rel = "noopener noreferrer";
    openBtn.style.textDecoration = "none";
    openBtn.addEventListener("click", function (e) { e.stopPropagation(); });
    actions.appendChild(openBtn);

    var editBtn = el("button", "bm-btn bm-btn-secondary");
    editBtn.textContent = "Edit";
    editBtn.type = "button";
    editBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      editingId = bm.id;
      render();
    });
    actions.appendChild(editBtn);

    var delBtn = el("button", "bm-btn bm-btn-danger");
    delBtn.textContent = "Delete";
    delBtn.type = "button";
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      deleteBookmark(bm.id);
    });
    actions.appendChild(delBtn);

    card.appendChild(actions);
    return card;
  }

  // ── Render ───────────────────────────────────────────────

  function render() {
    if (!containerEl) return;
    injectStyles();
    containerEl.innerHTML = "";

    var wrap = el("div", "bm-wrap");

    // Search
    wrap.appendChild(buildSearchBar());

    // Add / Edit form
    if (editingId) {
      var target = bookmarks.filter(function (b) { return b.id === editingId; })[0];
      if (target) {
        var editForm = buildAddForm(target);
        editForm.style.display = "block";
        wrap.appendChild(editForm);
      }
    } else {
      wrap.appendChild(buildToggleButton());
      wrap.appendChild(buildAddForm());
    }

    // Filters
    wrap.appendChild(buildFilters());

    // Filtered list
    var list = searchBookmarks(searchQuery);
    if (activeFilter !== "all") {
      list = list.filter(function (b) { return b.category === activeFilter; });
    }

    if (list.length === 0) {
      var empty = el("div", "bm-empty");
      empty.textContent = bookmarks.length === 0
        ? "No bookmarks yet. Add one above!"
        : "No bookmarks match your search or filter.";
      wrap.appendChild(empty);
    } else {
      var grid = el("div", "bm-grid");
      list.forEach(function (bm) { grid.appendChild(buildCard(bm)); });
      wrap.appendChild(grid);
    }

    containerEl.appendChild(wrap);
  }

  // ── Init ─────────────────────────────────────────────────

  function init(el) {
    containerEl = el;
    bookmarks = load();
    render();
  }

  // ── Public API ───────────────────────────────────────────

  return {
    init: init,
    addBookmark: addBookmark,
    updateBookmark: updateBookmark,
    deleteBookmark: deleteBookmark,
    searchBookmarks: searchBookmarks,
    getStats: getStats,
    render: render
  };
})();
