# Ocar Fun Day — Gmail Add-on

A Google Workspace (Gmail) add-on that lets you, while reading a client's
request email, create a "fun day" in the hosted Ocar Fun Day Builder with that
email attached, and then attach a no-prices proposal PDF to a draft reply.

The add-on runs **as you** (Apps Script). It reads the open message and creates
the draft itself via `GmailApp`; it only calls the backend to (a) create the day
and (b) fetch the proposal PDF.

---

## What's in this folder

- `appsscript.json` — the add-on manifest (scopes + Gmail contextual trigger).
- `Code.gs` — the Apps Script code (panel + two actions).
- `README.md` — this guide.

---

## Install

### 1. Create an Apps Script project

1. Go to <https://script.google.com> and click **New project**.
2. Give it a name, e.g. **Ocar Fun Day**.

### 2. Paste the manifest and code

1. Open **Project Settings** (gear icon) and tick
   **"Show 'appsscript.json' manifest file in editor"**.
2. Back in the **Editor**:
   - Open `appsscript.json` and replace its contents with this folder's
     [`appsscript.json`](./appsscript.json).
   - Open `Code.gs` (or create it) and replace its contents with this folder's
     [`Code.gs`](./Code.gs).
3. Save (Ctrl/Cmd-S).

### 3. Set Script Properties

In **Project Settings → Script Properties → Add script property**, add:

| Property         | Value                                                        |
|------------------|-------------------------------------------------------------|
| `BACKEND_URL`    | The hosted app URL, e.g. `https://your-app.up.railway.app`  |
| `ADDON_API_KEY`  | The shared key — **must match** the value on the server     |

> The add-on sends `X-Addon-Key: <ADDON_API_KEY>` on every backend request.
> A localhost URL will **not** work — Apps Script runs in Google's cloud and
> cannot reach your machine. Use the hosted (Railway) URL.

### 4. (If prompted) associate a standard GCP project

Some scopes require a standard Google Cloud project instead of the default one.
If deployment or consent complains:

1. In Google Cloud Console create (or pick) a project, note its **Project number**.
2. In Apps Script **Project Settings → Google Cloud Platform (GCP) Project →
   Change project**, paste the project number.
3. In that GCP project configure the **OAuth consent screen** (Internal is fine
   for a Workspace org) and enable the **Google Workspace Add-ons** / Gmail APIs
   if asked.

### 5. Deploy and install

1. **Deploy → Test deployments**.
2. In the dialog choose **Install** (the Gmail add-on entry).
3. Authorize the requested scopes when prompted.
4. Open Gmail (reload it). The **Ocar Fun Day** icon appears in the right-hand
   add-on sidebar.

---

## Use

1. Open a client's **request email** in Gmail.
2. Click the **Ocar Fun Day** icon in the right sidebar — the panel shows the
   email's subject and sender.
3. Press **"צור יום ב-Ocar"** to create the fun day with this email attached.
   - On success you get a confirmation card with **"פתח את היום"** (opens the day
     in the hosted app).
4. Press **"השב עם הצעה (ללא מחירים)"** to fetch the proposal PDF and attach it
   to a **draft reply** on this thread. You'll get a "טיוטה נוצרה" notification;
   open Gmail Drafts to review and send.

> The reply button needs a day to exist first. The add-on remembers which event
> belongs to which Gmail **thread** (see "How thread → event mapping works"),
> so once you've created the day, the reply button knows which PDF to fetch.

---

## How thread → event mapping works

When a day is created, the add-on stores `{ event_id, url }` keyed by the Gmail
**thread id** in the project's Script Properties (durable across sessions).
The reply action looks the event up by the current thread id. If nothing is
found, it asks you to create the day first.

---

## Troubleshooting

- **"חסרים מאפייני סקריפט"** — `BACKEND_URL` or `ADDON_API_KEY` is not set.
  Add them in Project Settings → Script Properties.
- **403 / 401 from the backend** — `ADDON_API_KEY` doesn't match the server's
  value. Re-check both sides.
- **Network error / nothing happens** — confirm `BACKEND_URL` is the **hosted**
  HTTPS URL (not `http://localhost...`). Apps Script can't reach localhost.
- **Consent / scope errors** — re-run the authorization, and if needed associate
  a standard GCP project (step 4) with a configured OAuth consent screen.
- **"יש ליצור קודם יום ב-Ocar"** on the reply button — create the day first; the
  reply attaches the PDF for the event mapped to this thread.
- **PDF fetch failed (non-200)** — the event may not have a proposal yet, or the
  backend `proposal-pdf` endpoint returned an error; check the server logs.

---

## Scopes used

- `gmail.addons.current.message.readonly` — read the currently open message.
- `gmail.addons.execute` — run the add-on.
- `gmail.compose` and `gmail.modify` — create the draft reply with the attachment.
- `script.external_request` — call the hosted backend via `UrlFetchApp`.
