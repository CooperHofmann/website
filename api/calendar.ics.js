// This file generates an .ics feed from your events
// Vercel will automatically turn this into an API endpoint

// Must use CommonJS exports for Vercel Node.js runtime
module.exports = function handler(req, res) {
  // For now, let's use sample events
  // Later you can connect this to a database
  const events = [
    {
      id: "event-1",
      title: "Team Meeting",
      start: new Date(2026, 1, 21, 10, 0).toISOString(),
      end: new Date(2026, 1, 21, 11, 0).toISOString(),
      allDay: false,
      description: "Weekly team sync",
      location: "Conference Room",
      reminders: [15],
      recurrence: { frequency: "never" }
    },
    // Add more events...
  ];

  // Generate ICS string
  const icsContent = generateICS(events);

  // Set proper headers for calendar subscription
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="calendar.ics"');
  res.status(200).send(icsContent);
};

// Copied from your ics-parser.js
function generateICS(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cooper's Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:My Calendar",
    "X-WR-TIMEZONE:America/New_York",
  ];

  events.forEach(function (ev) {
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

    lines.push("DTSTAMP:" + formatICSDateTime(new Date()));
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// Helper functions (from your ics-parser.js)
function sanitizeICS(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

function formatICSDateTime(date) {
  return date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z";
}

function formatICSDateOnly(date) {
  return date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate());
}
