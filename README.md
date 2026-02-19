# Calendar — Notion-Connected

A lightweight, minimalistic-brutalist calendar application inspired by Apple's design language. Built with vanilla HTML, CSS, and JavaScript — no build step required, ready for GitHub Pages.

## Features

- **Monthly / Weekly / Daily views** — switch seamlessly between perspectives
- **Notion integration** — sync events from a Notion database
- **Google Calendar integration** — sync from Google Calendar as an alternative or bridge to Apple Calendar
- **PIN-protected credentials** — API keys are encrypted (AES-GCM) in the browser before storage
- **JSON export** — download all events as a JSON file
- **URL-parameter import** — load events from external sources via query string
- **Responsive** — works on desktop, tablet, and mobile
- **Zero dependencies** — vanilla JS, no frameworks

---

## Prerequisites

- A **modern browser** (Chrome 67+, Firefox 57+, Safari 11+, Edge 79+) — required for the Web Crypto API used to encrypt credentials.
- A **static file host** — GitHub Pages, Vercel, Netlify, or any local HTTP server. Opening `index.html` directly as a `file://` URL will not work due to browser security restrictions.

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
3. Copy the **Database ID** from the URL. It is the 32-character hex string that appears after the last `/` and before the `?`:
   ```
   https://www.notion.so/my-workspace/My-Database-Title-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...
                                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ```
   The ID may also be formatted with hyphens (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — both formats are accepted.

### 4. CORS Proxy (Required for Browser Use)

The Notion API does not allow direct browser requests (no CORS headers). You need a lightweight proxy that forwards requests to `https://api.notion.com`.

**Options:**

- **Cloudflare Worker** (free tier, recommended for production) — deploy the worker below in minutes at [dash.cloudflare.com](https://dash.cloudflare.com/).
- **Vercel Serverless Function** — a `/api/notion` route that forwards to the Notion API.
- **[cors-anywhere](https://github.com/Rob--W/cors-anywhere)** — self-hosted; suitable for local development only, not recommended for production.

**Deploying a Cloudflare Worker:**

1. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create**.
2. Choose **"Hello World" worker**, give it a name, then click **Edit code**.
3. Replace the default code with the snippet below and click **Deploy**.
4. Copy the Worker URL (e.g. `https://my-worker.username.workers.dev`) — this is your CORS Proxy URL.

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
3. *(Recommended)* Enter a **PIN** in the PIN Protection field to encrypt your credentials before they are saved.
4. Click **Save & Sync**.

Credentials are saved to `localStorage`. If you set a PIN they are encrypted with AES-GCM (PBKDF2, 600,000 iterations) before storage. On your next visit, a lock screen will prompt for the PIN to decrypt them. Without a PIN, credentials are stored as plain text — see the [PIN Protection](#pin-protection) section for details.

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

## PIN Protection

All API credentials (Notion and Google) can be encrypted in the browser before they are written to `localStorage`.

### How It Works

1. Open **⚙ Settings** and fill in your API keys.
2. Enter a PIN in the **PIN Protection** field.
3. Click **Save & Sync**.

The app derives an AES-GCM 256-bit key from your PIN using PBKDF2 (SHA-256, 600,000 iterations) with a random salt, then encrypts your credentials. Only the ciphertext, salt, and IV are stored — the PIN itself is never saved.

On your next visit a lock screen appears. Enter your PIN to decrypt the credentials in memory; they are never written back to the page in plain text.

### Skipping the PIN

If you leave the PIN field blank, credentials are stored as **plain text** in `localStorage`. This is convenient for private/local use but not recommended on shared or public devices.

### Changing or Resetting Your PIN

1. Open **⚙ Settings** and enter the new credentials (or leave them as-is).
2. Enter a **new PIN** and click **Save & Sync** — this re-encrypts everything under the new PIN.
3. To remove encryption entirely, leave the PIN field blank and click **Save & Sync**.

> **Forgotten PIN?** There is no recovery mechanism by design. Clear `localStorage` (DevTools → Application → Local Storage → Clear) and re-enter your credentials.

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
