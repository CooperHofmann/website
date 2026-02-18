# Calendar — Notion-Connected

A lightweight, minimalistic-brutalist calendar application inspired by Apple's design language. Built with vanilla HTML, CSS, and JavaScript — no build step required, ready for GitHub Pages.

## Features

- **Monthly / Weekly / Daily views** — switch seamlessly between perspectives
- **Notion integration** — sync events from a Notion database
- **JSON export** — download all events as a JSON file
- **URL-parameter import** — load events from external sources via query string
- **Responsive** — works on desktop, tablet, and mobile
- **Zero dependencies** — vanilla JS, no frameworks

---

## Quick Start

### Run Locally

```bash
# Any static server works:
python -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000`.

### Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Set the source to the **root** of your default branch.
4. Your calendar will be live at `https://<user>.github.io/<repo>/`.

---

## Notion Integration

### 1. Create a Notion Integration

1. Go to [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations).
2. Click **"New integration"**.
3. Give it a name (e.g., "Calendar Sync") and select the workspace.
4. Copy the **Internal Integration Token** (starts with `secret_...`).

### 2. Create a Notion Database

Create a new **full-page database** in Notion with these properties:

| Property      | Type       | Purpose                   |
| ------------- | ---------- | ------------------------- |
| **Name**      | Title      | Event title               |
| **Date**      | Date       | Event start (and end)     |
| **Description** | Text     | Optional event description|

> You can add more columns, but the calendar reads **Title**, **Date**, and **rich_text** properties.

### 3. Share the Database with Your Integration

1. Open the database page in Notion.
2. Click **"…"** → **"Connections"** → find your integration and **connect** it.
3. Copy the **Database ID** from the URL:
   ```
   https://www.notion.so/<workspace>/<DATABASE_ID>?v=...
                                      ^^^^^^^^^^^
   ```

### 4. CORS Proxy (Required for Client-Side)

The Notion API does not allow direct browser requests (no CORS headers). You need a lightweight proxy that forwards requests to `https://api.notion.com`.

**Options:**

- **Cloudflare Worker** (free tier) — deploy a small worker that proxies requests.
- **Vercel Serverless Function** — a `/api/notion` route that forwards to the Notion API.
- **[cors-anywhere](https://github.com/Rob--W/cors-anywhere)** — self-hosted proxy.

Example Cloudflare Worker:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = "https://api.notion.com" + url.pathname + url.search;
    const headers = new Headers(request.headers);
    headers.set("Host", "api.notion.com");
    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
    });
  },
};
```

### 5. Connect in the Calendar

1. Open the calendar and click the **⚙ gear icon** in the top-right.
2. Enter your **API Key**, **Database ID**, and **CORS Proxy URL**.
3. Click **Save & Sync**.

Credentials are stored in `localStorage` and used on subsequent page loads.

---

## Google Calendar Integration (Alternative/Additional)

You can also sync events from Google Calendar, which works great as a bridge to Apple Calendar.

### 1. Get a Google Calendar API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**
4. Go to **Credentials** → **Create Credentials** → **API Key**
5. Copy your API key

### 2. Find Your Calendar ID

1. Open [Google Calendar](https://calendar.google.com)
2. Click the three dots next to your calendar → **Settings and sharing**
3. Scroll to **Integrate calendar**
4. Copy the **Calendar ID** (usually your email address)

### 3. Connect in the Calendar

1. Open the calendar and click the **⚙ gear icon**
2. Enter your **Google Calendar API Key** and **Calendar ID**
3. Click **Save & Sync**

### 4. Sync with Apple Calendar

In Apple Calendar:
1. Go to **Settings** → **Accounts** → **Add Account** → **Google**
2. Sign in with your Google account
3. Enable Calendar sync

Now events flow: **Apple Calendar ↔ Google Calendar ↔ Your Web App**

---

## Cross-Website Data Sharing

### Import Events via URL Parameters

Pass a JSON-encoded array of events in the `events` query parameter:

```
https://your-site.github.io/calendar/?events=[{"title":"Meeting","start":"2026-03-15T10:00","end":"2026-03-15T11:00","description":"Quarterly review"}]
```

Each event object accepts:

| Field         | Required | Description               |
| ------------- | -------- | ------------------------- |
| `title`       | Yes      | Event title               |
| `start`       | Yes      | ISO 8601 date/time string |
| `end`         | No       | ISO 8601 date/time string |
| `description` | No       | Text description          |
| `id`          | No       | Unique identifier         |

### Export Events as JSON

Click the **⇓ download icon** in the top-right to export all loaded events as a `calendar-events.json` file.

### Embed in Another Website

Use an `<iframe>` to embed the calendar on any page:

```html
<iframe
  src="https://your-site.github.io/calendar/"
  width="100%"
  height="700"
  style="border: none; border-radius: 12px;"
  title="Calendar"
></iframe>
```

To embed with pre-loaded events:

```html
<iframe
  src="https://your-site.github.io/calendar/?events=[{&quot;title&quot;:&quot;Launch&quot;,&quot;start&quot;:&quot;2026-04-01T09:00&quot;}]"
  width="100%"
  height="700"
  style="border: none;"
  title="Calendar with events"
></iframe>
```

### Link from Another Website

```html
<a href="https://your-site.github.io/calendar/?events=[...]">
  View on Calendar
</a>
```

---

## Customization

### Colors & Theme

Edit the CSS custom properties in `styles.css` under `:root`:

```css
:root {
  --bg: #fafafa;          /* Page background */
  --surface: #ffffff;      /* Card / panel backgrounds */
  --border: #e5e5e5;       /* Grid lines */
  --text: #1d1d1f;         /* Primary text */
  --text-secondary: #6e6e73; /* Secondary text */
  --accent: #0071e3;       /* Accent / links / today highlight */
  --accent-light: #e8f0fe; /* Hover states */
  --event-bg: #f5f5f7;     /* Event pill background */
  --event-border: #0071e3; /* Event pill left border */
}
```

### Fonts

The calendar uses **Inter** via Google Fonts. Swap the `<link>` tag in `index.html` and update `--font` in `styles.css` to use a different typeface.

### Adding Static Events

In `app.js`, edit the `seedDemoEvents()` function to add your own default events, or remove it to start with an empty calendar.

---

## File Structure

```
.
├── index.html    — Calendar markup and structure
├── styles.css    — All styles (brutalist / Apple-inspired)
├── app.js        — Calendar logic, Notion sync, export/import
└── README.md     — This file
```

## License

MIT
