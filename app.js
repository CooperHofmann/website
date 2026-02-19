/* ==========================================================================
   Calendar App — Vanilla JS with Notion Integration
   ==========================================================================
   Features:
     - Month / Week / Day views
     - Notion database sync (via CORS proxy for client-side use)
     - JSON export & URL-parameter import
     - Lightweight, no build step, GitHub-Pages-ready
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Constants & State ---------- */

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const HOURS = Array.from({ length: 24 }, (_, i) => {
    const h = i % 12 || 12;
    const ampm = i < 12 ? "AM" : "PM";
    return h + " " + ampm;
  });

  /** Application state */
  const state = {
    view: "month",        // "month" | "week" | "day"
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    day: new Date().getDate(),
    events: [],           // Array of { id, title, start, end, description }
    credentials: null,    // Decrypted credentials held in memory
  };

  /* ---------- PIN Encryption / Decryption (AES-GCM + PBKDF2) ---------- */

  /** Derive an AES-GCM key from a PIN string and salt using PBKDF2. */
  function deriveKey(pin, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey(
      "raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]
    ).then(function (keyMaterial) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 600000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    });
  }

  /** Encrypt a credentials object with the given PIN. Returns a JSON string. */
  function encryptCredentials(pin, data) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var enc = new TextEncoder();
    return deriveKey(pin, salt).then(function (key) {
      return crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        enc.encode(JSON.stringify(data))
      );
    }).then(function (ct) {
      function toBase64(arr) {
        var binary = "";
        for (var i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
        return btoa(binary);
      }
      return JSON.stringify({
        salt: toBase64(salt),
        iv: toBase64(iv),
        ct: toBase64(new Uint8Array(ct)),
      });
    });
  }

  /** Decrypt a stored credentials string with the given PIN. Returns parsed object. */
  function decryptCredentials(pin, encryptedStr) {
    var parsed = JSON.parse(encryptedStr);
    var salt = Uint8Array.from(atob(parsed.salt), function (c) { return c.charCodeAt(0); });
    var iv = Uint8Array.from(atob(parsed.iv), function (c) { return c.charCodeAt(0); });
    var ct = Uint8Array.from(atob(parsed.ct), function (c) { return c.charCodeAt(0); });
    return deriveKey(pin, salt).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
    }).then(function (plainBuf) {
      return JSON.parse(new TextDecoder().decode(plainBuf));
    });
  }

  /** Check whether encrypted credentials exist in localStorage. */
  function hasEncryptedCredentials() {
    return !!localStorage.getItem("encrypted_credentials");
  }

  /* ---------- DOM References ---------- */

  const $calendar = document.getElementById("calendar");
  const $label = document.getElementById("current-label");
  const $prevBtn = document.getElementById("prev-btn");
  const $nextBtn = document.getElementById("next-btn");
  const $todayBtn = document.getElementById("today-btn");
  const $settingsBtn = document.getElementById("settings-btn");
  const $settingsPanel = document.getElementById("settings-panel");
  const $saveSettings = document.getElementById("save-settings");
  const $closeSettings = document.getElementById("close-settings");
  const $exportBtn = document.getElementById("export-btn");
  const $modal = document.getElementById("event-modal");
  const $closeModal = document.getElementById("close-modal");
  const $modalTitle = document.getElementById("modal-title");
  const $modalTime = document.getElementById("modal-time");
  const $modalDesc = document.getElementById("modal-desc");

  // PIN-related elements
  const $pinOverlay = document.getElementById("pin-overlay");
  const $pinInput = document.getElementById("pin-input");
  const $pinUnlockBtn = document.getElementById("pin-unlock-btn");
  const $pinError = document.getElementById("pin-error");
  const $pinSkipBtn = document.getElementById("pin-skip-btn");
  const $settingsPin = document.getElementById("settings-pin");

  /* ---------- Helpers ---------- */

  /** Return first day-of-week (0=Sun) for the given month/year. */
  function firstDow(y, m) {
    return new Date(y, m, 1).getDay();
  }

  /** Return number of days in the given month/year. */
  function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  /** Check if a date matches today. */
  function isToday(y, m, d) {
    var now = new Date();
    return y === now.getFullYear() && m === now.getMonth() && d === now.getDate();
  }

  /** Format a Date to readable string. */
  function fmtDate(d) {
    return DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  /** Format time portion of a Date. */
  function fmtTime(d) {
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
  }

  /** Create an element with optional className and text. */
  function el(tag, className, text) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Get events that fall on a specific date (year, month, day). */
  function eventsOnDate(y, m, d) {
    return state.events.filter(function (ev) {
      var s = new Date(ev.start);
      return s.getFullYear() === y && s.getMonth() === m && s.getDate() === d;
    });
  }

  /** Get the Monday (start) of the week containing the given date. */
  function weekStart(y, m, d) {
    var dt = new Date(y, m, d);
    var day = dt.getDay();
    var diff = day === 0 ? -6 : 1 - day; // start on Monday
    dt.setDate(dt.getDate() + diff);
    return dt;
  }

  /* ---------- Rendering ---------- */

  /** Update the header label based on current view. */
  function updateLabel() {
    if (state.view === "month") {
      $label.textContent = MONTHS[state.month] + " " + state.year;
    } else if (state.view === "week") {
      var ws = weekStart(state.year, state.month, state.day);
      var we = new Date(ws);
      we.setDate(we.getDate() + 6);
      $label.textContent =
        MONTHS[ws.getMonth()] + " " + ws.getDate() + " – " +
        MONTHS[we.getMonth()] + " " + we.getDate() + ", " + we.getFullYear();
    } else {
      $label.textContent = fmtDate(new Date(state.year, state.month, state.day));
    }
  }

  /** Render the month view grid. */
  function renderMonth() {
    $calendar.innerHTML = "";

    // Day-of-week header
    var dowRow = el("div", "dow-row");
    DAYS.forEach(function (d) {
      dowRow.appendChild(el("span", null, d));
    });
    $calendar.appendChild(dowRow);

    // Grid
    var grid = el("div", "month-grid");
    var first = firstDow(state.year, state.month);
    var total = daysInMonth(state.year, state.month);
    var prevTotal = daysInMonth(state.year, state.month - 1);

    // Leading days from previous month
    for (var p = first - 1; p >= 0; p--) {
      var cell = el("div", "day-cell outside");
      cell.appendChild(el("span", "day-num", String(prevTotal - p)));
      grid.appendChild(cell);
    }

    // Current month days
    for (var d = 1; d <= total; d++) {
      var cell = el("div", "day-cell");
      if (isToday(state.year, state.month, d)) cell.classList.add("today");
      cell.appendChild(el("span", "day-num", String(d)));

      // Attach events
      var dayEvents = eventsOnDate(state.year, state.month, d);
      dayEvents.forEach(function (ev) {
        var pill = el("div", "event-pill", fmtTime(new Date(ev.start)) + " " + ev.title);
        pill.addEventListener("click", openModal.bind(null, ev));
        cell.appendChild(pill);
      });

      // Click day → go to day view
      (function (day) {
        cell.addEventListener("dblclick", function () {
          state.day = day;
          state.view = "day";
          setActiveViewBtn("day");
          render();
        });
      })(d);

      grid.appendChild(cell);
    }

    // Trailing days
    var totalCells = first + total;
    var trailing = (7 - (totalCells % 7)) % 7;
    for (var t = 1; t <= trailing; t++) {
      var cell = el("div", "day-cell outside");
      cell.appendChild(el("span", "day-num", String(t)));
      grid.appendChild(cell);
    }

    $calendar.appendChild(grid);
  }

  /** Render the week view. */
  function renderWeek() {
    $calendar.innerHTML = "";
    var ws = weekStart(state.year, state.month, state.day);
    var container = el("div", "week-view");

    // Header row: blank corner + 7 day headers
    var corner = el("div", "week-header-cell");
    container.appendChild(corner);
    for (var i = 0; i < 7; i++) {
      var dt = new Date(ws);
      dt.setDate(dt.getDate() + i);
      var hdr = el("div", "week-header-cell",
        DAYS[dt.getDay()] + " " + dt.getDate());
      if (isToday(dt.getFullYear(), dt.getMonth(), dt.getDate())) {
        hdr.classList.add("today-header");
      }
      container.appendChild(hdr);
    }

    // 24 hour rows
    for (var h = 0; h < 24; h++) {
      container.appendChild(el("div", "week-time-label", HOURS[h]));
      for (var i = 0; i < 7; i++) {
        var slot = el("div", "week-slot");
        slot.dataset.hour = h;
        slot.dataset.dayOffset = i;

        // Events that start at this hour on this day
        var dt = new Date(ws);
        dt.setDate(dt.getDate() + i);
        var dayEvts = eventsOnDate(dt.getFullYear(), dt.getMonth(), dt.getDate());
        dayEvts.forEach(function (ev) {
          var s = new Date(ev.start);
          if (s.getHours() === h) {
            var e = new Date(ev.end || ev.start);
            var duration = Math.max(1, (e - s) / 3600000);
            var chip = el("div", "week-event", fmtTime(s) + " " + ev.title);
            chip.style.height = (duration * 48) + "px";
            chip.addEventListener("click", openModal.bind(null, ev));
            slot.appendChild(chip);
          }
        });

        container.appendChild(slot);
      }
    }

    $calendar.appendChild(container);
  }

  /** Render the day view. */
  function renderDay() {
    $calendar.innerHTML = "";
    var container = el("div", "day-view");

    // Header
    var header = el("div", "day-view-header",
      fmtDate(new Date(state.year, state.month, state.day)));
    container.appendChild(header);

    // 24 hour slots
    for (var h = 0; h < 24; h++) {
      container.appendChild(el("div", "day-time-label", HOURS[h]));
      var slot = el("div", "day-slot");
      slot.dataset.hour = h;

      var dayEvts = eventsOnDate(state.year, state.month, state.day);
      dayEvts.forEach(function (ev) {
        var s = new Date(ev.start);
        if (s.getHours() === h) {
          var e = new Date(ev.end || ev.start);
          var duration = Math.max(1, (e - s) / 3600000);
          var chip = el("div", "day-event", fmtTime(s) + " " + ev.title);
          chip.style.height = (duration * 48) + "px";
          chip.addEventListener("click", openModal.bind(null, ev));
          slot.appendChild(chip);
        }
      });

      container.appendChild(slot);
    }

    $calendar.appendChild(container);
  }

  /** Master render function. */
  function render() {
    updateLabel();
    if (state.view === "month") renderMonth();
    else if (state.view === "week") renderWeek();
    else renderDay();
  }

  /* ---------- Navigation ---------- */

  function navigatePrev() {
    if (state.view === "month") {
      state.month--;
      if (state.month < 0) { state.month = 11; state.year--; }
    } else if (state.view === "week") {
      var d = new Date(state.year, state.month, state.day - 7);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      state.day = d.getDate();
    } else {
      var d = new Date(state.year, state.month, state.day - 1);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      state.day = d.getDate();
    }
    render();
  }

  function navigateNext() {
    if (state.view === "month") {
      state.month++;
      if (state.month > 11) { state.month = 0; state.year++; }
    } else if (state.view === "week") {
      var d = new Date(state.year, state.month, state.day + 7);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      state.day = d.getDate();
    } else {
      var d = new Date(state.year, state.month, state.day + 1);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      state.day = d.getDate();
    }
    render();
  }

  function goToday() {
    var now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
    state.day = now.getDate();
    render();
  }

  /* ---------- View Switching ---------- */

  function setActiveViewBtn(view) {
    document.querySelectorAll(".view-btn").forEach(function (btn) {
      var isActive = btn.dataset.view === view;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive);
    });
  }

  /* ---------- Event Modal ---------- */

  function openModal(ev) {
    $modalTitle.textContent = ev.title;
    var s = new Date(ev.start);
    var timeStr = fmtDate(s) + " at " + fmtTime(s);
    if (ev.end) {
      var e = new Date(ev.end);
      timeStr += " – " + fmtTime(e);
    }
    $modalTime.textContent = timeStr;
    $modalDesc.textContent = ev.description || "";
    $modal.classList.remove("hidden");
  }

  function closeModal() {
    $modal.classList.add("hidden");
  }

  /* ---------- Settings / Notion ---------- */

  function openSettings() {
    // Populate fields from in-memory credentials (decrypted) or fall back to localStorage
    var creds = state.credentials || {};
    var key = document.getElementById("notion-key");
    var db = document.getElementById("notion-db");
    var proxy = document.getElementById("cors-proxy");
    key.value = creds.notion_key || localStorage.getItem("notion_key") || "";
    db.value = creds.notion_db || localStorage.getItem("notion_db") || "";
    proxy.value = creds.cors_proxy || localStorage.getItem("cors_proxy") || "";

    // Google Calendar credentials
    var googleKey = document.getElementById("google-api-key");
    var googleCalId = document.getElementById("google-calendar-id");
    googleKey.value = creds.google_api_key || localStorage.getItem("google_api_key") || "";
    googleCalId.value = creds.google_calendar_id || localStorage.getItem("google_calendar_id") || "";

    // Clear PIN field each time
    $settingsPin.value = "";

    $settingsPanel.classList.remove("hidden");
  }

  function closeSettings() {
    $settingsPanel.classList.add("hidden");
  }

  function saveSettings() {
    var key = document.getElementById("notion-key").value.trim();
    var db = document.getElementById("notion-db").value.trim();
    var proxy = document.getElementById("cors-proxy").value.trim();
    var googleKey = document.getElementById("google-api-key").value.trim();
    var googleCalId = document.getElementById("google-calendar-id").value.trim();
    var pin = $settingsPin.value;

    var creds = {
      notion_key: key,
      notion_db: db,
      cors_proxy: proxy,
      google_api_key: googleKey,
      google_calendar_id: googleCalId,
    };

    // Keep decrypted credentials in memory
    state.credentials = creds;

    var hasKeys = key || googleKey;

    if (pin && hasKeys) {
      // Encrypt and store credentials, then remove any old plain-text keys
      encryptCredentials(pin, creds).then(function (encrypted) {
        localStorage.setItem("encrypted_credentials", encrypted);
        // Remove legacy plain-text keys
        localStorage.removeItem("notion_key");
        localStorage.removeItem("notion_db");
        localStorage.removeItem("cors_proxy");
        localStorage.removeItem("google_api_key");
        localStorage.removeItem("google_calendar_id");
        afterSave(key, db, proxy, googleKey, googleCalId);
      }).catch(function (err) {
        console.error("Encryption failed:", err);
        alert("Failed to encrypt credentials. They were not saved.");
      });
    } else {
      // No PIN provided — store as plain text (backward-compatible)
      localStorage.setItem("notion_key", key);
      localStorage.setItem("notion_db", db);
      localStorage.setItem("cors_proxy", proxy);
      localStorage.setItem("google_api_key", googleKey);
      localStorage.setItem("google_calendar_id", googleCalId);
      afterSave(key, db, proxy, googleKey, googleCalId);
    }
  }

  /** Common post-save logic: close panel and sync. */
  function afterSave(key, db, proxy, googleKey, googleCalId) {
    closeSettings();
    if (key && db) fetchNotionEvents(key, db, proxy);
    if (googleKey && googleCalId) fetchGoogleCalendarEvents(googleKey, googleCalId);
  }

  /* ---------- Notion API Integration ---------- */

  /**
   * Fetch events from a Notion database.
   * Because the Notion API does not support CORS for browser requests,
   * a CORS proxy is required for client-side use.
   * The proxy URL should forward requests to https://api.notion.com.
   *
   * Expected Notion database properties:
   *   - Name (title)       → event title
   *   - Date (date)        → start / end
   *   - Description (rich_text) → event description
   */
  function fetchNotionEvents(apiKey, dbId, proxyUrl) {
    var base = proxyUrl
      ? proxyUrl.replace(/\/+$/, "")
      : "https://api.notion.com";
    var url = base + "/v1/databases/" + encodeURIComponent(dbId) + "/query";

    fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100 }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Notion API error: " + res.status);
        return res.json();
      })
      .then(function (data) {
        var fetched = (data.results || []).map(parseNotionPage).filter(Boolean);
        // Merge with existing events (keep unique by id)
        var ids = new Set(fetched.map(function (e) { return e.id; }));
        state.events = fetched.concat(
          state.events.filter(function (e) { return !ids.has(e.id); })
        );
        render();
      })
      .catch(function (err) {
        console.error("Failed to fetch Notion events:", err);
        alert("Could not fetch events from Notion. Check your API key, database ID, and proxy URL.");
      });
  }

  /** Parse a Notion page object into our event format. */
  function parseNotionPage(page) {
    var props = page.properties || {};

    // Title — look for a "title" type property (usually "Name")
    var title = "";
    Object.keys(props).forEach(function (k) {
      if (props[k].type === "title" && props[k].title && props[k].title.length) {
        title = props[k].title.map(function (t) { return t.plain_text; }).join("");
      }
    });

    // Date — look for a "date" type property
    var start = null;
    var end = null;
    Object.keys(props).forEach(function (k) {
      if (props[k].type === "date" && props[k].date) {
        start = props[k].date.start;
        end = props[k].date.end || null;
      }
    });

    if (!start) return null;

    // Description — look for "rich_text" type property named Description
    var desc = "";
    Object.keys(props).forEach(function (k) {
      if (props[k].type === "rich_text" && props[k].rich_text && props[k].rich_text.length) {
        desc = props[k].rich_text.map(function (t) { return t.plain_text; }).join("");
      }
    });

    return {
      id: page.id,
      title: title || "Untitled",
      start: start,
      end: end,
      description: desc,
    };
  }

  /* ---------- Google Calendar API Integration ---------- */

  /**
   * Fetch events from Google Calendar API.
   * API Documentation: https://developers.google.com/calendar/api/v3/reference/events/list
   */
  function fetchGoogleCalendarEvents(apiKey, calendarId) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var url = "https://www.googleapis.com/calendar/v3/calendars/" +
      encodeURIComponent(calendarId) +
      "/events?key=" + encodeURIComponent(apiKey) +
      "&timeMin=" + today.toISOString() +
      "&maxResults=100" +
      "&singleEvents=true" +
      "&orderBy=startTime";

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Google Calendar API error: " + res.status);
        return res.json();
      })
      .then(function (data) {
        var fetched = (data.items || []).map(parseGoogleEvent).filter(Boolean);
        // Merge with existing events (keep unique by id)
        var ids = new Set(fetched.map(function (e) { return e.id; }));
        state.events = fetched.concat(
          state.events.filter(function (e) { return !ids.has(e.id); })
        );
        render();
      })
      .catch(function (err) {
        console.error("Failed to fetch Google Calendar events:", err);
        alert("Could not fetch events from Google Calendar. Check your API key and calendar ID.");
      });
  }

  /** Parse a Google Calendar event object into our event format. */
  function parseGoogleEvent(event) {
    if (!event.start) return null;

    var start = event.start.dateTime || event.start.date;
    var end = event.end ? (event.end.dateTime || event.end.date) : null;

    // Handle all-day events (date only, no time)
    if (event.start.date && !event.start.dateTime) {
      var startParts = event.start.date.split("-");
      start = new Date(+startParts[0], +startParts[1] - 1, +startParts[2], 0, 0, 0).toISOString();
      if (event.end && event.end.date) {
        var endParts = event.end.date.split("-");
        end = new Date(+endParts[0], +endParts[1] - 1, +endParts[2], 23, 59, 59).toISOString();
      } else {
        end = null;
      }
    }

    return {
      id: "google-" + event.id,
      title: event.summary || "Untitled",
      start: start,
      end: end,
      description: event.description || "",
    };
  }

  /* ---------- JSON Export ---------- */

  function exportJSON() {
    var data = JSON.stringify(state.events, null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "calendar-events.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ---------- URL Parameter Import ---------- */

  /**
   * Accept events via URL search parameters:
   *   ?events=<URL-encoded JSON array>
   *
   * Example (URL-encoded):
   *   ?events=[{"title":"Meeting","start":"2026-02-20T10:00","end":"2026-02-20T11:00"}]
   *
   * This allows external websites to link to this calendar with pre-loaded events.
   */
  function importFromURL() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("events");
    if (!raw) return;
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach(function (ev, i) {
        if (ev.title && ev.start) {
          state.events.push({
            id: ev.id || "url-" + i,
            title: ev.title,
            start: ev.start,
            end: ev.end || null,
            description: ev.description || "",
          });
        }
      });
    } catch (e) {
      console.warn("Could not parse events from URL:", e);
    }
  }

  /* ---------- Demo Events ---------- */

  /** Seed a few sample events so the calendar is not empty on first load. */
  function seedDemoEvents() {
    if (state.events.length > 0) return; // already have events

    var today = new Date();
    var y = today.getFullYear();
    var m = today.getMonth();
    var d = today.getDate();

    state.events = [
      {
        id: "demo-1",
        title: "Team Standup",
        start: new Date(y, m, d, 9, 0).toISOString(),
        end: new Date(y, m, d, 9, 30).toISOString(),
        description: "Daily sync with the team.",
      },
      {
        id: "demo-2",
        title: "Design Review",
        start: new Date(y, m, d + 1, 14, 0).toISOString(),
        end: new Date(y, m, d + 1, 15, 0).toISOString(),
        description: "Review the new calendar interface designs.",
      },
      {
        id: "demo-3",
        title: "Lunch with Alex",
        start: new Date(y, m, d + 2, 12, 0).toISOString(),
        end: new Date(y, m, d + 2, 13, 0).toISOString(),
        description: "Catch up over sushi.",
      },
      {
        id: "demo-4",
        title: "Sprint Planning",
        start: new Date(y, m, d + 3, 10, 0).toISOString(),
        end: new Date(y, m, d + 3, 11, 30).toISOString(),
        description: "Plan next sprint goals and tasks.",
      },
      {
        id: "demo-5",
        title: "Yoga Class",
        start: new Date(y, m, d - 1, 7, 0).toISOString(),
        end: new Date(y, m, d - 1, 8, 0).toISOString(),
        description: "Morning yoga session at the studio.",
      },
    ];
  }

  /* ---------- PIN Unlock Flow ---------- */

  /** Show the PIN overlay and wire up unlock logic. */
  function showPinOverlay() {
    $pinOverlay.classList.remove("hidden");
    $pinInput.value = "";
    $pinError.textContent = "";
    $pinInput.focus();
  }

  /** Attempt to unlock encrypted credentials with the entered PIN. */
  function attemptUnlock() {
    var pin = $pinInput.value;
    if (!pin) {
      $pinError.textContent = "Please enter your PIN.";
      return;
    }

    var encrypted = localStorage.getItem("encrypted_credentials");
    $pinUnlockBtn.disabled = true;
    $pinError.textContent = "";

    decryptCredentials(pin, encrypted).then(function (creds) {
      state.credentials = creds;
      $pinOverlay.classList.add("hidden");
      $pinUnlockBtn.disabled = false;

      // Sync with decrypted credentials
      if (creds.notion_key && creds.notion_db) {
        fetchNotionEvents(creds.notion_key, creds.notion_db, creds.cors_proxy || "");
      }
      if (creds.google_api_key && creds.google_calendar_id) {
        fetchGoogleCalendarEvents(creds.google_api_key, creds.google_calendar_id);
      }
    }).catch(function () {
      $pinError.textContent = "Invalid PIN. Please try again.";
      $pinInput.value = "";
      $pinInput.focus();
      $pinUnlockBtn.disabled = false;
    });
  }

  /* ---------- Initialization ---------- */

  function init() {
    // Import events from URL parameters first
    importFromURL();

    // Seed demo events if none loaded
    seedDemoEvents();

    // Check for encrypted credentials — show PIN overlay if found
    if (hasEncryptedCredentials()) {
      showPinOverlay();
    } else {
      // Legacy: auto-sync from plain-text credentials if present
      var savedKey = localStorage.getItem("notion_key");
      var savedDb = localStorage.getItem("notion_db");
      var savedProxy = localStorage.getItem("cors_proxy");
      if (savedKey && savedDb) {
        state.credentials = {
          notion_key: savedKey,
          notion_db: savedDb,
          cors_proxy: savedProxy || "",
        };
        fetchNotionEvents(savedKey, savedDb, savedProxy || "");
      }

      var savedGoogleKey = localStorage.getItem("google_api_key");
      var savedGoogleCalId = localStorage.getItem("google_calendar_id");
      if (savedGoogleKey && savedGoogleCalId) {
        state.credentials = state.credentials || {};
        state.credentials.google_api_key = savedGoogleKey;
        state.credentials.google_calendar_id = savedGoogleCalId;
        fetchGoogleCalendarEvents(savedGoogleKey, savedGoogleCalId);
      }
    }

    // Wire up UI
    $prevBtn.addEventListener("click", navigatePrev);
    $nextBtn.addEventListener("click", navigateNext);
    $todayBtn.addEventListener("click", goToday);

    document.querySelectorAll(".view-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.view = btn.dataset.view;
        setActiveViewBtn(state.view);
        render();
      });
    });

    $settingsBtn.addEventListener("click", openSettings);
    $saveSettings.addEventListener("click", saveSettings);
    $closeSettings.addEventListener("click", closeSettings);
    $exportBtn.addEventListener("click", exportJSON);
    $closeModal.addEventListener("click", closeModal);

    // PIN unlock handlers
    $pinUnlockBtn.addEventListener("click", attemptUnlock);
    $pinInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") attemptUnlock();
    });
    $pinSkipBtn.addEventListener("click", function () {
      $pinOverlay.classList.add("hidden");
    });

    // Close modal on backdrop click
    $modal.addEventListener("click", function (e) {
      if (e.target === $modal) closeModal();
    });

    // Close settings on backdrop click
    $settingsPanel.addEventListener("click", function (e) {
      if (e.target === $settingsPanel) closeSettings();
    });

    // Keyboard: Escape closes modals
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeModal();
        closeSettings();
      }
    });

    // Initial render
    render();
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
