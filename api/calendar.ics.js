// Vercel serverless function — serves a live .ics calendar feed.
// Subscribe in Apple Calendar (or any CalDAV/iCal client) at:
//   https://<your-site>.vercel.app/api/calendar.ics

export default async function handler(req, res) {
  // Demo events — replace or extend by connecting to a real data source
  // (e.g. Firestore, Notion API, or any database).
  const events = [
    {
      id: "demo-event-1",
      title: "Team Meeting",
      start: new Date(2026, 1, 25, 10, 0).toISOString(),
      end: new Date(2026, 1, 25, 11, 0).toISOString(),
      allDay: false,
      description: "Weekly team sync",
      location: "Conference Room A",
    },
    {
      id: "demo-event-2",
      title: "Project Deadline",
      start: new Date(2026, 2, 1, 0, 0).toISOString(),
      end: new Date(2026, 2, 1, 0, 0).toISOString(),
      allDay: true,
      description: "Final project submission due",
      location: "",
    },
    {
      id: "demo-event-3",
      title: "Study Session",
      start: new Date(2026, 2, 5, 14, 0).toISOString(),
      end: new Date(2026, 2, 5, 16, 0).toISOString(),
      allDay: false,
      description: "Midterm exam preparation",
      location: "Library",
    },
  ];

  const icsContent = generateICS(events);

  // Headers required for calendar subscription clients
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="calendar.ics"');
  res.status(200).send(icsContent);
}

// Generates a valid iCalendar string from an array of event objects.
function generateICS(events) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cooper's Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Cooper's Calendar",
    "X-WR-TIMEZONE:America/New_York",
  ];

  events.forEach((ev) => {
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

// Escape special characters for ICS text fields.
function sanitizeICS(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// Format a Date as ICS UTC datetime (YYYYMMDDTHHmmssZ).
function formatICSDateTime(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

// Format a Date as ICS date-only string (YYYYMMDD).
// Uses local date methods so all-day events land on the correct calendar day
// regardless of the server's UTC offset.
function formatICSDateOnly(date) {
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate())
  );
}
