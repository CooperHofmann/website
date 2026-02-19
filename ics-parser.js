/* ==========================================================================
   ICS Parser — Import / Export iCalendar (.ics) files
   ========================================================================== */

var ICSParser = (function () {
  "use strict";

  /**
   * Export events to an iCalendar (.ics) string.
   * @param {Array} events - Array of event objects.
   * @returns {string} iCalendar formatted string.
   */
  function exportToICS(events) {
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Calendar App//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    events.forEach(function (ev) {
      // Skip recurring instances (only export parent events)
      if (ev.isRecurringInstance) return;

      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + sanitizeICS(ev.id));
      lines.push("SUMMARY:" + sanitizeICS(ev.title || "Untitled"));

      if (ev.allDay) {
        lines.push("DTSTART;VALUE=DATE:" + formatICSDateOnly(new Date(ev.start)));
        if (ev.end) {
          lines.push("DTEND;VALUE=DATE:" + formatICSDateOnly(new Date(ev.end)));
        }
      } else {
        lines.push("DTSTART:" + formatICSDateTime(new Date(ev.start)));
        if (ev.end) {
          lines.push("DTEND:" + formatICSDateTime(new Date(ev.end)));
        }
      }

      if (ev.description) {
        lines.push("DESCRIPTION:" + sanitizeICS(ev.description));
      }
      if (ev.location) {
        lines.push("LOCATION:" + sanitizeICS(ev.location));
      }

      // Recurrence rule
      if (ev.recurrence && ev.recurrence.frequency !== "never" && typeof RecurrenceEngine !== "undefined") {
        var rrule = RecurrenceEngine.toRRule(ev.recurrence);
        if (rrule) {
          lines.push("RRULE:" + rrule);
        }
      }

      // Reminders as VALARM
      if (ev.reminders && ev.reminders.length > 0) {
        ev.reminders.forEach(function (minutes) {
          lines.push("BEGIN:VALARM");
          lines.push("TRIGGER:-PT" + minutes + "M");
          lines.push("ACTION:DISPLAY");
          lines.push("DESCRIPTION:Reminder");
          lines.push("END:VALARM");
        });
      }

      lines.push("DTSTAMP:" + formatICSDateTime(new Date()));
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }

  /**
   * Parse an iCalendar (.ics) string into event objects.
   * @param {string} icsString - Raw .ics file content.
   * @returns {Array} Array of parsed event objects.
   */
  function parseICS(icsString) {
    var events = [];
    var lines = unfoldLines(icsString);
    var currentEvent = null;
    var inAlarm = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      if (line === "BEGIN:VEVENT") {
        currentEvent = {
          id: "",
          title: "",
          start: null,
          end: null,
          allDay: false,
          description: "",
          location: "",
          color: "",
          reminders: [],
          recurrence: { frequency: "never" },
        };
        inAlarm = false;
      } else if (line === "END:VEVENT" && currentEvent) {
        if (currentEvent.start) {
          if (!currentEvent.id) {
            currentEvent.id = "ics-" + Date.now() + "-" + events.length;
          }
          events.push(currentEvent);
        }
        currentEvent = null;
      } else if (line === "BEGIN:VALARM") {
        inAlarm = true;
      } else if (line === "END:VALARM") {
        inAlarm = false;
      } else if (currentEvent && !inAlarm) {
        parseEventProperty(currentEvent, line);
      } else if (currentEvent && inAlarm) {
        parseAlarmProperty(currentEvent, line);
      }
    }

    return events;
  }

  /**
   * Unfold ICS lines (lines starting with space/tab are continuations).
   */
  function unfoldLines(str) {
    return str.replace(/\r\n[\t ]/g, "").replace(/\r/g, "").split("\n");
  }

  /**
   * Parse a single VEVENT property line.
   */
  function parseEventProperty(event, line) {
    var colonIdx = line.indexOf(":");
    if (colonIdx < 0) return;

    var fullKey = line.substring(0, colonIdx);
    var value = line.substring(colonIdx + 1);
    var key = fullKey.split(";")[0].toUpperCase();

    switch (key) {
      case "UID":
        event.id = "ics-" + value;
        break;
      case "SUMMARY":
        event.title = unescapeICS(value);
        break;
      case "DESCRIPTION":
        event.description = unescapeICS(value);
        break;
      case "LOCATION":
        event.location = unescapeICS(value);
        break;
      case "DTSTART":
        if (fullKey.indexOf("VALUE=DATE") !== -1) {
          event.allDay = true;
          event.start = parseDateOnly(value);
        } else {
          event.start = parseDateTime(value);
        }
        break;
      case "DTEND":
        if (fullKey.indexOf("VALUE=DATE") !== -1) {
          event.end = parseDateOnly(value);
        } else {
          event.end = parseDateTime(value);
        }
        break;
      case "RRULE":
        if (typeof RecurrenceEngine !== "undefined") {
          event.recurrence = RecurrenceEngine.fromRRule(value);
        }
        break;
    }
  }

  /**
   * Parse a VALARM property to extract reminder minutes.
   */
  function parseAlarmProperty(event, line) {
    if (line.indexOf("TRIGGER:") !== 0 && line.indexOf("TRIGGER;") !== 0) return;

    var value = line.substring(line.indexOf(":") + 1);
    var minutes = parseTriggerDuration(value);
    if (minutes !== null && event.reminders.indexOf(minutes) === -1) {
      event.reminders.push(minutes);
    }
  }

  /**
   * Parse a TRIGGER duration string (e.g., -PT15M, -PT1H, -P1D).
   */
  function parseTriggerDuration(str) {
    if (!str) return null;
    var negative = str.charAt(0) === "-";
    str = str.replace(/^[-+]/, "").replace("P", "");

    var totalMinutes = 0;
    var dayMatch = str.match(/(\d+)D/);
    var hourMatch = str.match(/(\d+)H/);
    var minMatch = str.match(/(\d+)M/);

    if (dayMatch) totalMinutes += parseInt(dayMatch[1], 10) * 1440;
    if (hourMatch) totalMinutes += parseInt(hourMatch[1], 10) * 60;
    if (minMatch) totalMinutes += parseInt(minMatch[1], 10);

    return totalMinutes || 0;
  }

  /**
   * Parse an ICS datetime string (YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ).
   */
  function parseDateTime(str) {
    if (!str) return null;
    str = str.replace("Z", "");
    var y = parseInt(str.substring(0, 4), 10);
    var m = parseInt(str.substring(4, 6), 10) - 1;
    var d = parseInt(str.substring(6, 8), 10);
    var h = str.length >= 11 ? parseInt(str.substring(9, 11), 10) : 0;
    var min = str.length >= 13 ? parseInt(str.substring(11, 13), 10) : 0;
    var s = str.length >= 15 ? parseInt(str.substring(13, 15), 10) : 0;
    return new Date(y, m, d, h, min, s).toISOString();
  }

  /**
   * Parse an ICS date-only string (YYYYMMDD).
   */
  function parseDateOnly(str) {
    if (!str) return null;
    var y = parseInt(str.substring(0, 4), 10);
    var m = parseInt(str.substring(4, 6), 10) - 1;
    var d = parseInt(str.substring(6, 8), 10);
    return new Date(y, m, d, 0, 0, 0).toISOString();
  }

  /**
   * Format a Date to ICS datetime (YYYYMMDDTHHmmss).
   */
  function formatICSDateTime(d) {
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  /**
   * Format a Date to ICS date-only (YYYYMMDD).
   */
  function formatICSDateOnly(d) {
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  /**
   * Sanitize text for ICS output (escape special chars).
   */
  function sanitizeICS(str) {
    if (!str) return "";
    return str
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  }

  /**
   * Unescape ICS text values.
   */
  function unescapeICS(str) {
    if (!str) return "";
    return str
      .replace(/\\n/g, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }

  /**
   * Download events as an .ics file.
   */
  function downloadICS(events, filename) {
    var icsContent = exportToICS(events);
    var blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "calendar-events.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Read and parse an uploaded .ics file.
   * @param {File} file - The file object from input.
   * @returns {Promise<Array>} Array of parsed event objects.
   */
  function importFromFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var events = parseICS(e.target.result);
          resolve(events);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () {
        reject(new Error("Failed to read file"));
      };
      reader.readAsText(file);
    });
  }

  return {
    exportToICS: exportToICS,
    parseICS: parseICS,
    downloadICS: downloadICS,
    importFromFile: importFromFile,
  };
})();
