/* ==========================================================================
   Calendar App — Vanilla JS with Notion Integration
   ==========================================================================
   Features:
     - Month / Week / Day views
     - Event creation, editing, deletion
     - Recurrence (daily, weekly, monthly, yearly, custom)
     - Browser notification reminders
     - ICS import/export
     - Notion database sync (via CORS proxy for client-side use)
     - Google Calendar sync (existing integration)
     - localStorage persistence
     - JSON export & URL-parameter import
     - Keyboard shortcuts
     - Lightweight, no build step, GitHub-Pages-ready
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Constants & State ---------- */

  var EVENT_COLORS = ["#0071e3", "#34c759", "#ff9500", "#ff3b30", "#af52de", "#5856d6"];

  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  var HOURS = Array.from({ length: 24 }, function (_, i) {
    var h = i % 12 || 12;
    var ampm = i < 12 ? "AM" : "PM";
    return h + " " + ampm;
  });

  /** Application state */
  var state = {
    view: "month",        // "month" | "week" | "day"
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    day: new Date().getDate(),
    events: [],           // Array of event objects
    credentials: null,    // Decrypted credentials held in memory
    editingEventId: null, // ID of event being edited (null = creating new)
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

  var $calendar = document.getElementById("calendar");
  var $label = document.getElementById("current-label");
  var $prevBtn = document.getElementById("prev-btn");
  var $nextBtn = document.getElementById("next-btn");
  var $todayBtn = document.getElementById("today-btn");
  var $settingsBtn = document.getElementById("settings-btn");
  var $settingsPanel = document.getElementById("settings-panel");
  var $saveSettings = document.getElementById("save-settings");
  var $closeSettings = document.getElementById("close-settings");
  var $exportBtn = document.getElementById("export-btn");
  var $modal = document.getElementById("event-modal");
  var $closeModal = document.getElementById("close-modal");
  var $modalTitle = document.getElementById("modal-title");
  var $modalTime = document.getElementById("modal-time");
  var $modalLocation = document.getElementById("modal-location");
  var $modalRecurrence = document.getElementById("modal-recurrence");
  var $modalDesc = document.getElementById("modal-desc");
  var $modalEditBtn = document.getElementById("modal-edit-btn");
  var $modalDeleteBtn = document.getElementById("modal-delete-btn");

  // PIN-related elements
  var $pinOverlay = document.getElementById("pin-overlay");
  var $pinInput = document.getElementById("pin-input");
  var $pinUnlockBtn = document.getElementById("pin-unlock-btn");
  var $pinError = document.getElementById("pin-error");
  var $pinSkipBtn = document.getElementById("pin-skip-btn");
  var $settingsPin = document.getElementById("settings-pin");

  // Add Event button + form
  var $addEventBtn = document.getElementById("add-event-btn");
  var $eventFormModal = document.getElementById("event-form-modal");
  var $closeEventForm = document.getElementById("close-event-form");
  var $eventFormTitle = document.getElementById("event-form-title");
  var $efTitle = document.getElementById("ef-title");
  var $efTitleError = document.getElementById("ef-title-error");
  var $efStartDate = document.getElementById("ef-start-date");
  var $efStartTime = document.getElementById("ef-start-time");
  var $efAllDay = document.getElementById("ef-all-day");
  var $efEndDate = document.getElementById("ef-end-date");
  var $efEndTime = document.getElementById("ef-end-time");
  var $efEndGroup = document.getElementById("ef-end-group");
  var $efDateError = document.getElementById("ef-date-error");
  var $efRepeat = document.getElementById("ef-repeat");
  var $efCustomRecurrence = document.getElementById("ef-custom-recurrence");
  var $efRecInterval = document.getElementById("ef-rec-interval");
  var $efRecFreq = document.getElementById("ef-rec-freq");
  var $efDaysOfWeekGroup = document.getElementById("ef-days-of-week-group");
  var $efRecEnd = document.getElementById("ef-rec-end");
  var $efRecEndAfter = document.getElementById("ef-rec-end-after");
  var $efRecEndOn = document.getElementById("ef-rec-end-on");
  var $efRecCount = document.getElementById("ef-rec-count");
  var $efRecEndDate = document.getElementById("ef-rec-end-date");
  var $efLocation = document.getElementById("ef-location");
  var $efDescription = document.getElementById("ef-description");
  var $efSave = document.getElementById("ef-save");
  var $efCancel = document.getElementById("ef-cancel");
  var $efDelete = document.getElementById("ef-delete");
  var $efColorPicker = document.getElementById("ef-color-picker");

  // Import/export
  var $importBtn = document.getElementById("import-btn");
  var $icsFileInput = document.getElementById("ics-file-input");
  var $syncStatus = document.getElementById("sync-status");

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

  /** Get events that fall on a specific date (year, month, day). Includes recurring instances. */
  function eventsOnDate(y, m, d) {
    var target = new Date(y, m, d);
    var rangeStart = new Date(y, m, d, 0, 0, 0);
    var rangeEnd = new Date(y, m, d, 23, 59, 59);

    var results = [];

    state.events.forEach(function (ev) {
      if (ev.isRecurringInstance) return; // skip pre-generated instances

      var s = new Date(ev.start);
      if (s.getFullYear() === y && s.getMonth() === m && s.getDate() === d) {
        results.push(ev);
      }

      // Generate recurring instances for this date
      if (ev.recurrence && ev.recurrence.frequency !== "never") {
        var instances = RecurrenceEngine.generateInstances(ev, rangeStart, rangeEnd);
        instances.forEach(function (inst) {
          var is = new Date(inst.start);
          if (is.getFullYear() === y && is.getMonth() === m && is.getDate() === d) {
            // Avoid duplicating the original occurrence
            if (is.getTime() !== s.getTime()) {
              results.push(inst);
            }
          }
        });
      }
    });

    return results;
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

      // Quick-add button
      var qaBtn = el("button", "quick-add-btn", "+");
      qaBtn.setAttribute("aria-label", "Quick add event");
      (function (day) {
        qaBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openEventForm(new Date(state.year, state.month, day));
        });
      })(d);
      cell.appendChild(qaBtn);

      // Attach events
      var dayEvents = eventsOnDate(state.year, state.month, d);
      dayEvents.forEach(function (ev) {
        var pill = el("div", "event-pill", fmtTime(new Date(ev.start)) + " " + ev.title);
        if (ev.color) {
          pill.style.setProperty("--pill-color", ev.color);
          pill.style.borderLeftColor = ev.color;
        }
        if (ev.isRecurringInstance || (ev.recurrence && ev.recurrence.frequency !== "never")) {
          pill.classList.add("recurring");
        }
        pill.addEventListener("click", function (e) {
          e.stopPropagation();
          openModal(ev);
        });
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

        // Quick-add on double-click
        (function (hour, dayOffset) {
          slot.addEventListener("dblclick", function (e) {
            if (e.target !== slot) return;
            var slotDate = new Date(ws);
            slotDate.setDate(slotDate.getDate() + dayOffset);
            slotDate.setHours(hour, 0, 0, 0);
            openEventForm(slotDate);
          });
        })(h, i);

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
            if (ev.color) {
              chip.style.borderLeftColor = ev.color;
            }
            if (ev.isRecurringInstance || (ev.recurrence && ev.recurrence.frequency !== "never")) {
              chip.classList.add("recurring");
            }
            chip.addEventListener("click", function (evt) {
              evt.stopPropagation();
              openModal(ev);
            });
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

      // Quick-add on double-click
      (function (hour) {
        slot.addEventListener("dblclick", function (e) {
          if (e.target !== slot) return;
          var slotDate = new Date(state.year, state.month, state.day, hour, 0, 0);
          openEventForm(slotDate);
        });
      })(h);

      var dayEvts = eventsOnDate(state.year, state.month, state.day);
      dayEvts.forEach(function (ev) {
        var s = new Date(ev.start);
        if (s.getHours() === h) {
          var e = new Date(ev.end || ev.start);
          var duration = Math.max(1, (e - s) / 3600000);
          var chip = el("div", "day-event", fmtTime(s) + " " + ev.title);
          chip.style.height = (duration * 48) + "px";
          if (ev.color) {
            chip.style.borderLeftColor = ev.color;
          }
          if (ev.isRecurringInstance || (ev.recurrence && ev.recurrence.frequency !== "never")) {
            chip.classList.add("recurring");
          }
          chip.addEventListener("click", function (evt) {
            evt.stopPropagation();
            openModal(ev);
          });
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

  /* ---------- Event Detail Modal ---------- */

  var currentModalEvent = null;

  function openModal(ev) {
    currentModalEvent = ev;
    $modalTitle.textContent = ev.title;
    var s = new Date(ev.start);
    var timeStr = fmtDate(s);
    if (!ev.allDay) {
      timeStr += " at " + fmtTime(s);
      if (ev.end) {
        var e = new Date(ev.end);
        timeStr += " – " + fmtTime(e);
      }
    } else {
      timeStr += " (All day)";
    }
    $modalTime.textContent = timeStr;

    // Location
    if (ev.location) {
      $modalLocation.textContent = "📍 " + ev.location;
      $modalLocation.style.display = "";
    } else {
      $modalLocation.style.display = "none";
    }

    // Recurrence
    if (ev.recurrence && ev.recurrence.frequency !== "never") {
      $modalRecurrence.textContent = "🔁 " + RecurrenceEngine.formatRule(ev.recurrence);
      $modalRecurrence.style.display = "";
    } else if (ev.isRecurringInstance) {
      $modalRecurrence.textContent = "🔁 Recurring event";
      $modalRecurrence.style.display = "";
    } else {
      $modalRecurrence.style.display = "none";
    }

    $modalDesc.textContent = ev.description || "";
    $modal.classList.remove("hidden");

    // Focus trap
    $modalEditBtn.focus();
  }

  function closeModal() {
    $modal.classList.add("hidden");
    currentModalEvent = null;
  }

  /** Edit the currently viewed event. */
  function editCurrentEvent() {
    if (!currentModalEvent) return;
    var eventToEdit = currentModalEvent;
    closeModal();

    // If it's a recurring instance, edit the parent
    if (eventToEdit.isRecurringInstance && eventToEdit.parentId) {
      var parent = state.events.find(function (e) { return e.id === eventToEdit.parentId; });
      if (parent) {
        eventToEdit = parent;
      }
    }

    openEventFormForEdit(eventToEdit);
  }

  /** Delete the currently viewed event. */
  function deleteCurrentEvent() {
    if (!currentModalEvent) return;

    var eventToDelete = currentModalEvent;
    // If it's a recurring instance, delete the parent
    if (eventToDelete.isRecurringInstance && eventToDelete.parentId) {
      if (!confirm("This is a recurring event. Delete all occurrences?")) return;
      eventToDelete = { id: eventToDelete.parentId };
    } else if (eventToDelete.recurrence && eventToDelete.recurrence.frequency !== "never") {
      if (!confirm("This is a recurring event. Delete all occurrences?")) return;
    }

    var idToDelete = eventToDelete.id;
    closeModal();
    deleteEvent(idToDelete);
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
    var data = JSON.stringify(state.events.filter(function (e) { return !e.isRecurringInstance; }), null, 2);
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

  /* ---------- ICS Export ---------- */

  function exportICS() {
    var eventsToExport = state.events.filter(function (e) { return !e.isRecurringInstance; });
    ICSParser.downloadICS(eventsToExport, "calendar-events.ics");
  }

  /* ---------- ICS Import ---------- */

  function importICS(file) {
    ICSParser.importFromFile(file).then(function (imported) {
      if (imported.length === 0) {
        alert("No events found in the file.");
        return;
      }
      state.events = SyncManager.mergeEvents(state.events, imported);
      persistEvents();
      render();
      alert("Imported " + imported.length + " event(s).");
    }).catch(function (err) {
      console.error("ICS import failed:", err);
      alert("Failed to import calendar file.");
    });
  }

  /* ---------- Event Form (Create / Edit) ---------- */

  /**
   * Open the event creation form.
   * @param {Date} [prefillDate] - Optional date to pre-fill.
   */
  function openEventForm(prefillDate) {
    state.editingEventId = null;
    $eventFormTitle.textContent = "Create New Event";
    $efSave.textContent = "Save Event";
    $efDelete.classList.add("hidden");

    // Reset form
    resetEventForm();

    // Smart defaults
    var now = prefillDate || new Date();
    var startDate = formatDateInput(now);
    $efStartDate.value = startDate;
    $efEndDate.value = startDate;

    // Round to next 30-min interval
    var minutes = now.getMinutes();
    var roundedMin = minutes < 30 ? 30 : 0;
    var roundedHour = minutes < 30 ? now.getHours() : now.getHours() + 1;
    if (roundedHour >= 24) roundedHour = 23;
    $efStartTime.value = padTime(roundedHour, roundedMin);

    // End = start + 1 hour
    var endHour = roundedHour + 1;
    if (endHour >= 24) endHour = 23;
    $efEndTime.value = padTime(endHour, roundedMin);

    // Default color
    selectColor(EVENT_COLORS[0]);

    // Default reminder
    var reminderChecks = $efReminders().querySelectorAll("input[type='checkbox']");
    reminderChecks.forEach(function (cb) {
      cb.checked = cb.value === "15";
    });

    $eventFormModal.classList.remove("hidden");
    $efTitle.focus();
  }

  /**
   * Open the event form pre-filled for editing.
   */
  function openEventFormForEdit(ev) {
    state.editingEventId = ev.id;
    $eventFormTitle.textContent = "Edit Event";
    $efSave.textContent = "Update Event";
    $efDelete.classList.remove("hidden");

    resetEventForm();

    // Fill form fields
    $efTitle.value = ev.title || "";
    var s = new Date(ev.start);
    $efStartDate.value = formatDateInput(s);
    $efStartTime.value = padTime(s.getHours(), s.getMinutes());

    if (ev.end) {
      var e = new Date(ev.end);
      $efEndDate.value = formatDateInput(e);
      $efEndTime.value = padTime(e.getHours(), e.getMinutes());
    } else {
      $efEndDate.value = $efStartDate.value;
      $efEndTime.value = $efStartTime.value;
    }

    $efAllDay.checked = !!ev.allDay;
    toggleAllDay();

    $efLocation.value = ev.location || "";
    $efDescription.value = ev.description || "";

    // Color
    selectColor(ev.color || EVENT_COLORS[0]);

    // Reminders
    var reminderChecks = $efReminders().querySelectorAll("input[type='checkbox']");
    reminderChecks.forEach(function (cb) {
      cb.checked = (ev.reminders || []).indexOf(parseInt(cb.value, 10)) !== -1;
    });

    // Recurrence
    if (ev.recurrence && ev.recurrence.frequency !== "never") {
      var rec = ev.recurrence;
      if (["daily", "weekly", "monthly", "yearly"].indexOf(rec.frequency) !== -1 && (!rec.interval || rec.interval === 1) && (!rec.daysOfWeek || rec.daysOfWeek.length === 0) && rec.endCondition === "never") {
        $efRepeat.value = rec.frequency;
      } else {
        $efRepeat.value = "custom";
        showCustomRecurrence();
        $efRecFreq.value = rec.frequency;
        $efRecInterval.value = rec.interval || 1;
        if (rec.daysOfWeek && rec.daysOfWeek.length > 0) {
          var dowChecks = $efDaysOfWeekGroup.querySelectorAll("input[type='checkbox']");
          dowChecks.forEach(function (cb) {
            cb.checked = rec.daysOfWeek.indexOf(parseInt(cb.value, 10)) !== -1;
          });
        }
        $efRecEnd.value = rec.endCondition || "never";
        toggleRecEndFields();
        if (rec.endCondition === "after") $efRecCount.value = rec.endCount || 10;
        if (rec.endCondition === "on") $efRecEndDate.value = rec.endDate || "";
      }
    } else {
      $efRepeat.value = "never";
    }

    $eventFormModal.classList.remove("hidden");
    $efTitle.focus();
  }

  /** Helper to get reminders container. */
  function $efReminders() {
    return document.getElementById("ef-reminders");
  }

  /** Reset the event form to blank state. */
  function resetEventForm() {
    $efTitle.value = "";
    $efTitleError.textContent = "";
    $efDateError.textContent = "";
    $efStartDate.value = "";
    $efStartTime.value = "";
    $efEndDate.value = "";
    $efEndTime.value = "";
    $efAllDay.checked = false;
    $efLocation.value = "";
    $efDescription.value = "";
    $efRepeat.value = "never";
    $efCustomRecurrence.classList.add("hidden");
    $efRecInterval.value = 1;
    $efRecFreq.value = "daily";
    $efRecEnd.value = "never";
    $efRecEndAfter.classList.add("hidden");
    $efRecEndOn.classList.add("hidden");
    $efDaysOfWeekGroup.classList.add("hidden");

    // Reset day-of-week checkboxes
    var dowChecks = $efDaysOfWeekGroup.querySelectorAll("input[type='checkbox']");
    dowChecks.forEach(function (cb) { cb.checked = false; });

    // Show time fields
    var timeInputs = $eventFormModal.querySelectorAll("input[type='time']");
    timeInputs.forEach(function (inp) { inp.style.display = ""; });
    $efEndGroup.classList.remove("hidden");
  }

  /** Close the event form. */
  function closeEventForm() {
    $eventFormModal.classList.add("hidden");
    state.editingEventId = null;
  }

  /** Toggle time fields based on all-day checkbox. */
  function toggleAllDay() {
    var isAllDay = $efAllDay.checked;
    $efStartTime.style.display = isAllDay ? "none" : "";
    $efEndTime.style.display = isAllDay ? "none" : "";
  }

  /** Show/hide custom recurrence fields. */
  function showCustomRecurrence() {
    $efCustomRecurrence.classList.remove("hidden");
    toggleDaysOfWeek();
    toggleRecEndFields();
  }

  function hideCustomRecurrence() {
    $efCustomRecurrence.classList.add("hidden");
  }

  /** Toggle days-of-week picker visibility. */
  function toggleDaysOfWeek() {
    if ($efRecFreq.value === "weekly") {
      $efDaysOfWeekGroup.classList.remove("hidden");
    } else {
      $efDaysOfWeekGroup.classList.add("hidden");
    }
  }

  /** Toggle recurrence end condition fields. */
  function toggleRecEndFields() {
    var val = $efRecEnd.value;
    $efRecEndAfter.classList.toggle("hidden", val !== "after");
    $efRecEndOn.classList.toggle("hidden", val !== "on");
  }

  /** Select a color in the color picker. */
  function selectColor(color) {
    var options = $efColorPicker.querySelectorAll(".color-option");
    options.forEach(function (opt) {
      opt.classList.toggle("selected", opt.dataset.color === color);
    });
  }

  /** Get the currently selected color. */
  function getSelectedColor() {
    var selected = $efColorPicker.querySelector(".color-option.selected");
    return selected ? selected.dataset.color : EVENT_COLORS[0];
  }

  /** Validate the event form. Returns true if valid. */
  function validateEventForm() {
    var valid = true;
    $efTitleError.textContent = "";
    $efDateError.textContent = "";

    // Title required
    var title = $efTitle.value.trim();
    if (!title) {
      $efTitleError.textContent = "Event title is required.";
      valid = false;
    } else if (title.length > 100) {
      $efTitleError.textContent = "Title must be 100 characters or less.";
      valid = false;
    }

    // Date validation
    if (!$efStartDate.value) {
      $efDateError.textContent = "Start date is required.";
      valid = false;
    } else if (!$efAllDay.checked) {
      var startDT = new Date($efStartDate.value + "T" + ($efStartTime.value || "00:00"));
      var endDT = new Date(($efEndDate.value || $efStartDate.value) + "T" + ($efEndTime.value || $efStartTime.value || "00:00"));
      if (endDT < startDT) {
        $efDateError.textContent = "End time must be after start time.";
        valid = false;
      }
    }

    return valid;
  }

  /** Save event from form data. */
  function saveEventFromForm() {
    if (!validateEventForm()) return;

    var title = $efTitle.value.trim();
    var startDate = $efStartDate.value;
    var startTime = $efStartTime.value || "00:00";
    var endDate = $efEndDate.value || startDate;
    var endTime = $efEndTime.value || startTime;
    var isAllDay = $efAllDay.checked;

    var startISO, endISO;
    if (isAllDay) {
      startISO = new Date(startDate + "T00:00:00").toISOString();
      endISO = endDate ? new Date(endDate + "T23:59:59").toISOString() : null;
    } else {
      startISO = new Date(startDate + "T" + startTime).toISOString();
      endISO = new Date(endDate + "T" + endTime).toISOString();
    }

    // Gather reminders
    var reminders = [];
    var reminderChecks = $efReminders().querySelectorAll("input[type='checkbox']:checked");
    reminderChecks.forEach(function (cb) {
      reminders.push(parseInt(cb.value, 10));
    });

    // Gather recurrence
    var recurrence = { frequency: "never" };
    var repeatVal = $efRepeat.value;
    if (repeatVal !== "never") {
      if (repeatVal === "custom") {
        recurrence = {
          frequency: $efRecFreq.value,
          interval: parseInt($efRecInterval.value, 10) || 1,
          endCondition: $efRecEnd.value,
        };

        if (recurrence.frequency === "weekly") {
          var daysOfWeek = [];
          $efDaysOfWeekGroup.querySelectorAll("input[type='checkbox']:checked").forEach(function (cb) {
            daysOfWeek.push(parseInt(cb.value, 10));
          });
          if (daysOfWeek.length > 0) recurrence.daysOfWeek = daysOfWeek;
        }

        if (recurrence.endCondition === "after") {
          recurrence.endCount = parseInt($efRecCount.value, 10) || 10;
        } else if (recurrence.endCondition === "on") {
          recurrence.endDate = $efRecEndDate.value || null;
        }
      } else {
        recurrence = {
          frequency: repeatVal,
          interval: 1,
          endCondition: "never",
        };
      }
    }

    var eventData = {
      title: title,
      start: startISO,
      end: endISO,
      allDay: isAllDay,
      location: $efLocation.value.trim(),
      description: $efDescription.value.trim(),
      color: getSelectedColor(),
      reminders: reminders,
      recurrence: recurrence,
    };

    if (state.editingEventId) {
      // Update existing event
      var idx = state.events.findIndex(function (e) { return e.id === state.editingEventId; });
      if (idx !== -1) {
        eventData.id = state.editingEventId;
        state.events[idx] = eventData;
      }
    } else {
      // Create new event
      eventData.id = SyncManager.generateId();
      state.events.push(eventData);
    }

    // Persist, schedule reminders, re-render
    persistEvents();
    ReminderManager.scheduleReminders(eventData);
    closeEventForm();
    render();
  }

  /** Delete an event by ID. */
  function deleteEvent(eventId) {
    state.events = state.events.filter(function (e) { return e.id !== eventId; });
    ReminderManager.cancelReminders(eventId);
    persistEvents();
    render();
  }

  /** Delete event from the edit form. */
  function deleteEventFromForm() {
    if (!state.editingEventId) return;
    var ev = state.events.find(function (e) { return e.id === state.editingEventId; });
    if (ev && ev.recurrence && ev.recurrence.frequency !== "never") {
      if (!confirm("This is a recurring event. Delete all occurrences?")) return;
    }
    deleteEvent(state.editingEventId);
    closeEventForm();
  }

  /** Persist events to localStorage via SyncManager. */
  function persistEvents() {
    SyncManager.saveEvents(state.events);
  }

  /** Update sync status indicator in UI. */
  function updateSyncStatus(status) {
    if (!$syncStatus) return;
    $syncStatus.className = "sync-status " + status;
    if (status === "synced") {
      $syncStatus.innerHTML = "&#10003;";
      $syncStatus.title = "Saved";
    } else if (status === "syncing") {
      $syncStatus.innerHTML = "&#10227;";
      $syncStatus.title = "Syncing…";
    } else if (status === "error") {
      $syncStatus.innerHTML = "&#9888;";
      $syncStatus.title = "Sync error";
    } else if (status === "offline") {
      $syncStatus.innerHTML = "&#9729;";
      $syncStatus.title = "Offline";
    }
  }

  /* ---------- Helper formatters for form ---------- */

  /** Format a Date to YYYY-MM-DD for input[type=date]. */
  function formatDateInput(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  /** Format hours/minutes to HH:MM for input[type=time]. */
  function padTime(h, m) {
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
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
        allDay: false,
        location: "Zoom",
        description: "Daily sync with the team.",
        color: "#0071e3",
        reminders: [15],
        recurrence: { frequency: "weekly", interval: 1, daysOfWeek: [1, 2, 3, 4, 5], endCondition: "never" },
      },
      {
        id: "demo-2",
        title: "Design Review",
        start: new Date(y, m, d + 1, 14, 0).toISOString(),
        end: new Date(y, m, d + 1, 15, 0).toISOString(),
        allDay: false,
        location: "Conference Room B",
        description: "Review the new calendar interface designs.",
        color: "#34c759",
        reminders: [15, 60],
        recurrence: { frequency: "never" },
      },
      {
        id: "demo-3",
        title: "Lunch with Alex",
        start: new Date(y, m, d + 2, 12, 0).toISOString(),
        end: new Date(y, m, d + 2, 13, 0).toISOString(),
        allDay: false,
        location: "Sushi Place",
        description: "Catch up over sushi.",
        color: "#ff9500",
        reminders: [30],
        recurrence: { frequency: "never" },
      },
      {
        id: "demo-4",
        title: "Sprint Planning",
        start: new Date(y, m, d + 3, 10, 0).toISOString(),
        end: new Date(y, m, d + 3, 11, 30).toISOString(),
        allDay: false,
        location: "",
        description: "Plan next sprint goals and tasks.",
        color: "#af52de",
        reminders: [15],
        recurrence: { frequency: "weekly", interval: 2, endCondition: "never" },
      },
      {
        id: "demo-5",
        title: "Yoga Class",
        start: new Date(y, m, d - 1, 7, 0).toISOString(),
        end: new Date(y, m, d - 1, 8, 0).toISOString(),
        allDay: false,
        location: "Studio",
        description: "Morning yoga session at the studio.",
        color: "#5856d6",
        reminders: [60],
        recurrence: { frequency: "never" },
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
    // Register sync status callback
    SyncManager.onStatusChange(updateSyncStatus);
    if (typeof CloudSync !== "undefined") {
      CloudSync.onStatusChange(updateSyncStatus);
    }

    // Load persisted events from localStorage first
    var storedEvents = SyncManager.loadEvents();
    if (storedEvents.length > 0) {
      state.events = storedEvents;
    }

    // Import events from URL parameters
    importFromURL();

    // Seed demo events if none loaded
    seedDemoEvents();

    // Persist initial state (including demos if applicable)
    persistEvents();

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

    // Wire up navigation
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

    // Settings
    $settingsBtn.addEventListener("click", openSettings);
    $saveSettings.addEventListener("click", saveSettings);
    $closeSettings.addEventListener("click", closeSettings);

    // Export (JSON + ICS)
    $exportBtn.addEventListener("click", function () {
      // Offer both formats
      exportICS();
    });

    // Import ICS
    $importBtn.addEventListener("click", function () {
      $icsFileInput.click();
    });
    $icsFileInput.addEventListener("change", function () {
      if ($icsFileInput.files && $icsFileInput.files[0]) {
        importICS($icsFileInput.files[0]);
        $icsFileInput.value = ""; // Reset for re-import
      }
    });

    // Event detail modal
    $closeModal.addEventListener("click", closeModal);
    $modalEditBtn.addEventListener("click", editCurrentEvent);
    $modalDeleteBtn.addEventListener("click", deleteCurrentEvent);

    // Add Event button
    $addEventBtn.addEventListener("click", function () {
      openEventForm(new Date(state.year, state.month, state.day));
    });

    // Event form handlers
    $closeEventForm.addEventListener("click", closeEventForm);
    $efCancel.addEventListener("click", closeEventForm);
    $efSave.addEventListener("click", saveEventFromForm);
    $efDelete.addEventListener("click", deleteEventFromForm);

    // All-day toggle
    $efAllDay.addEventListener("change", toggleAllDay);

    // Repeat dropdown
    $efRepeat.addEventListener("change", function () {
      if ($efRepeat.value === "custom") {
        showCustomRecurrence();
      } else {
        hideCustomRecurrence();
      }
    });

    // Custom recurrence sub-fields
    $efRecFreq.addEventListener("change", toggleDaysOfWeek);
    $efRecEnd.addEventListener("change", toggleRecEndFields);

    // Color picker
    $efColorPicker.querySelectorAll(".color-option").forEach(function (opt) {
      opt.addEventListener("click", function () {
        selectColor(opt.dataset.color);
      });
    });

    // PIN unlock handlers
    $pinUnlockBtn.addEventListener("click", attemptUnlock);
    $pinInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") attemptUnlock();
    });
    $pinSkipBtn.addEventListener("click", function () {
      $pinOverlay.classList.add("hidden");
    });

    // Close modals on backdrop click
    $modal.addEventListener("click", function (e) {
      if (e.target === $modal) closeModal();
    });
    $eventFormModal.addEventListener("click", function (e) {
      if (e.target === $eventFormModal) closeEventForm();
    });
    $settingsPanel.addEventListener("click", function (e) {
      if (e.target === $settingsPanel) closeSettings();
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", function (e) {
      // Escape closes modals
      if (e.key === "Escape") {
        if (!$eventFormModal.classList.contains("hidden")) {
          closeEventForm();
        } else if (!$modal.classList.contains("hidden")) {
          closeModal();
        } else {
          closeSettings();
        }
        return;
      }

      // Don't trigger shortcuts when typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

      // Ctrl/Cmd+N: New event
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        openEventForm(new Date(state.year, state.month, state.day));
        return;
      }

      // T: Go to today
      if (e.key === "t" || e.key === "T") {
        goToday();
        return;
      }

      // Arrow left/right: navigate prev/next
      if (e.key === "ArrowLeft") {
        navigatePrev();
        return;
      }
      if (e.key === "ArrowRight") {
        navigateNext();
        return;
      }

      // 1/2/3: Switch views
      if (e.key === "1") { state.view = "month"; setActiveViewBtn("month"); render(); return; }
      if (e.key === "2") { state.view = "week"; setActiveViewBtn("week"); render(); return; }
      if (e.key === "3") { state.view = "day"; setActiveViewBtn("day"); render(); return; }
    });

    // Request notification permission (non-blocking)
    ReminderManager.requestPermission().then(function () {
      // Schedule reminders for all upcoming events
      ReminderManager.scheduleAll(state.events);
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
