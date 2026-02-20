// Vercel serverless function for Apple Calendar sync
module.exports = (req, res) => {
  // Demo events for testing
  const events = [
    {
      id: "demo-1",
      title: "Team Meeting",
      start: "2026-02-25T10:00:00Z",
      end: "2026-02-25T11:00:00Z",
      description: "Weekly sync",
      location: "Zoom"
    },
    {
      id: "demo-2",
      title: "Lunch Break",
      start: "2026-02-26T12:00:00Z",
      end: "2026-02-26T13:00:00Z",
      description: "Grab some food",
      location: "Downtown"
    },
    {
      id: "demo-3",
      title: "Project Review",
      start: "2026-02-27T14:00:00Z",
      end: "2026-02-27T15:30:00Z",
      description: "Quarterly review meeting",
      location: "Conference Room A"
    }
  ];

  // Generate ICS format
  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cooper's Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Cooper's Calendar",
    "X-WR-TIMEZONE:America/New_York"
  ];

  events.forEach(ev => {
    icsLines.push("BEGIN:VEVENT");
    icsLines.push(`UID:${ev.id}`);
    icsLines.push(`SUMMARY:${ev.title}`);
    icsLines.push(`DTSTART:${ev.start.replace(/[-:]/g, '').replace('.000', '')}`);
    icsLines.push(`DTEND:${ev.end.replace(/[-:]/g, '').replace('.000', '')}`);
    if (ev.description) icsLines.push(`DESCRIPTION:${ev.description}`);
    if (ev.location) icsLines.push(`LOCATION:${ev.location}`);
    icsLines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace('.000', '')}`);
    icsLines.push("END:VEVENT");
  });

  icsLines.push("END:VCALENDAR");

  // Send response
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="calendar.ics"');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).send(icsLines.join("\r\n"));
};
