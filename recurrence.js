/* ==========================================================================
   Recurrence Engine — Generate recurring event instances
   ========================================================================== */

var RecurrenceEngine = (function () {
  "use strict";

  /**
   * Generate recurring event instances between startRange and endRange.
   * @param {Object} parentEvent - The parent event with a recurrence property.
   * @param {Date} startRange - Start of the visible date range.
   * @param {Date} endRange - End of the visible date range.
   * @returns {Array} Array of event instances.
   */
  function generateInstances(parentEvent, startRange, endRange) {
    if (!parentEvent.recurrence || parentEvent.recurrence.frequency === "never") {
      return [];
    }

    var rec = parentEvent.recurrence;
    var instances = [];
    var eventStart = new Date(parentEvent.start);
    var eventEnd = parentEvent.end ? new Date(parentEvent.end) : null;
    var duration = eventEnd ? (eventEnd - eventStart) : 0;
    var current = new Date(eventStart);
    var count = 0;
    var maxInstances = 1000; // safety limit

    // Determine the end condition
    var recEnd = null;
    if (rec.endCondition === "on" && rec.endDate) {
      recEnd = new Date(rec.endDate);
      recEnd.setHours(23, 59, 59, 999);
    }
    var recCount = (rec.endCondition === "after" && rec.endCount) ? rec.endCount : null;

    while (current <= endRange && count < maxInstances) {
      // Check end conditions
      if (recEnd && current > recEnd) break;
      if (recCount && count >= recCount) break;

      // Only include instances that fall within the visible range
      if (current >= startRange || (duration > 0 && new Date(current.getTime() + duration) >= startRange)) {
        // For weekly recurrence with specific days, check if current day matches
        if (rec.frequency === "weekly" && rec.daysOfWeek && rec.daysOfWeek.length > 0) {
          if (rec.daysOfWeek.indexOf(current.getDay()) !== -1) {
            instances.push(createInstance(parentEvent, current, duration, count));
          }
        } else {
          instances.push(createInstance(parentEvent, current, duration, count));
        }
      }

      count++;
      current = getNextDate(current, rec, eventStart);
    }

    return instances;
  }

  /**
   * Create a single instance of a recurring event.
   */
  function createInstance(parentEvent, date, duration, index) {
    var instanceStart = new Date(date);
    var instanceEnd = duration > 0 ? new Date(date.getTime() + duration) : null;

    return {
      id: parentEvent.id + "-instance-" + index,
      parentId: parentEvent.id,
      title: parentEvent.title,
      start: instanceStart.toISOString(),
      end: instanceEnd ? instanceEnd.toISOString() : null,
      allDay: parentEvent.allDay || false,
      location: parentEvent.location || "",
      description: parentEvent.description || "",
      color: parentEvent.color || "",
      reminders: parentEvent.reminders || [],
      isRecurringInstance: true,
    };
  }

  /**
   * Calculate the next date based on recurrence rules.
   */
  function getNextDate(current, rec, originalStart) {
    var interval = rec.interval || 1;
    var next = new Date(current);

    switch (rec.frequency) {
      case "daily":
        next.setDate(next.getDate() + interval);
        break;

      case "weekly":
        if (rec.daysOfWeek && rec.daysOfWeek.length > 0) {
          // Move to next matching day
          var found = false;
          for (var i = 1; i <= 7; i++) {
            var testDate = new Date(current);
            testDate.setDate(testDate.getDate() + i);
            if (rec.daysOfWeek.indexOf(testDate.getDay()) !== -1) {
              // Check if we've wrapped around a full week * interval
              var weeksDiff = Math.floor((testDate - originalStart) / (7 * 86400000));
              if (weeksDiff % interval === 0 || i <= 7) {
                next = testDate;
                found = true;
                break;
              }
            }
          }
          if (!found) {
            next.setDate(next.getDate() + 7 * interval);
          }
        } else {
          next.setDate(next.getDate() + 7 * interval);
        }
        break;

      case "monthly":
        next.setMonth(next.getMonth() + interval);
        // Handle edge case: if original date was 31 but target month has fewer days
        var targetDay = originalStart.getDate();
        var maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(targetDay, maxDay));
        break;

      case "yearly":
        next.setFullYear(next.getFullYear() + interval);
        break;

      default:
        next.setDate(next.getDate() + 1);
        break;
    }

    return next;
  }

  /**
   * Format a recurrence rule as a human-readable string.
   */
  function formatRule(rec) {
    if (!rec || rec.frequency === "never") return "";

    var interval = rec.interval || 1;
    var str = "";

    switch (rec.frequency) {
      case "daily":
        str = interval === 1 ? "Every day" : "Every " + interval + " days";
        break;
      case "weekly":
        str = interval === 1 ? "Every week" : "Every " + interval + " weeks";
        if (rec.daysOfWeek && rec.daysOfWeek.length > 0) {
          var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          var days = rec.daysOfWeek.map(function (d) { return dayNames[d]; });
          str += " on " + days.join(", ");
        }
        break;
      case "monthly":
        str = interval === 1 ? "Every month" : "Every " + interval + " months";
        break;
      case "yearly":
        str = interval === 1 ? "Every year" : "Every " + interval + " years";
        break;
    }

    if (rec.endCondition === "after" && rec.endCount) {
      str += ", " + rec.endCount + " times";
    } else if (rec.endCondition === "on" && rec.endDate) {
      str += ", until " + rec.endDate;
    }

    return str;
  }

  /**
   * Convert recurrence rules to RRULE string (iCalendar format).
   */
  function toRRule(rec) {
    if (!rec || rec.frequency === "never") return "";

    var parts = [];
    var freqMap = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
    parts.push("FREQ=" + (freqMap[rec.frequency] || "DAILY"));

    if (rec.interval && rec.interval > 1) {
      parts.push("INTERVAL=" + rec.interval);
    }

    if (rec.frequency === "weekly" && rec.daysOfWeek && rec.daysOfWeek.length > 0) {
      var dayMap = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
      var days = rec.daysOfWeek.map(function (d) { return dayMap[d]; });
      parts.push("BYDAY=" + days.join(","));
    }

    if (rec.endCondition === "after" && rec.endCount) {
      parts.push("COUNT=" + rec.endCount);
    } else if (rec.endCondition === "on" && rec.endDate) {
      var d = new Date(rec.endDate);
      parts.push("UNTIL=" + formatICSDate(d));
    }

    return parts.join(";");
  }

  /**
   * Parse an RRULE string back to a recurrence object.
   */
  function fromRRule(rrule) {
    if (!rrule) return { frequency: "never" };

    var rec = { frequency: "never", interval: 1, endCondition: "never" };
    var parts = rrule.split(";");
    var freqMap = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };
    var dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

    parts.forEach(function (part) {
      var kv = part.split("=");
      var key = kv[0];
      var val = kv[1];

      switch (key) {
        case "FREQ":
          rec.frequency = freqMap[val] || "daily";
          break;
        case "INTERVAL":
          rec.interval = parseInt(val, 10) || 1;
          break;
        case "BYDAY":
          rec.daysOfWeek = val.split(",").map(function (d) { return dayMap[d.trim()]; }).filter(function (d) { return d !== undefined; });
          break;
        case "COUNT":
          rec.endCondition = "after";
          rec.endCount = parseInt(val, 10);
          break;
        case "UNTIL":
          rec.endCondition = "on";
          rec.endDate = parseICSDate(val);
          break;
      }
    });

    return rec;
  }

  function formatICSDate(d) {
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function parseICSDate(str) {
    // Format: YYYYMMDDTHHmmss or YYYYMMDD
    if (!str) return null;
    str = str.replace("Z", "");
    var y = parseInt(str.substring(0, 4), 10);
    var m = parseInt(str.substring(4, 6), 10) - 1;
    var d = parseInt(str.substring(6, 8), 10);
    return y + "-" + (m + 1 < 10 ? "0" : "") + (m + 1) + "-" + (d < 10 ? "0" : "") + d;
  }

  return {
    generateInstances: generateInstances,
    formatRule: formatRule,
    toRRule: toRRule,
    fromRRule: fromRRule,
  };
})();
