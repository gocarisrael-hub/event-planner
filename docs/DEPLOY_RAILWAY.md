# Deploying Event Planner to Railway

This app ships a `Dockerfile` so Railway builds and runs it directly. The
container serves both the API and the built React client on a single port, and
generates Hebrew proposal PDFs with a system Chromium + Hebrew fonts.

## 1. Create the project

1. Push this repo to GitHub (Railway deploys from a Git repo).
2. In Railway: **New Project → Deploy from GitHub repo**, pick this repo.
3. Railway auto-detects the `Dockerfile` and uses it for the build. No build
   command or start command needs to be set — the image's `CMD` runs the server.

## 2. Add a persistent Volume

The data store (`app.json`), uploaded photos, and the Gmail token must survive
restarts and redeploys. Railway containers are otherwise ephemeral.

1. In the service: **Settings → Volumes → New Volume**.
2. Set the **mount path** to `/data`.

## 3. Set environment variables

In the service's **Variables** tab, add:

| Variable | Value | Notes |
| --- | --- | --- |
| `DATA_DIR` | `/data` | JSON store + Gmail token live here (on the volume). |
| `UPLOADS_DIR` | `/data/uploads` | Uploaded photos (on the volume). Created automatically on startup. |
| `ADDON_API_KEY` | *a long random string* | Required for the Gmail Add-on endpoints. Generate one, e.g. `openssl rand -hex 32`. The add-on sends it as the `X-Addon-Key` header. |
| `APP_BASE_URL` | `https://<your-app>.up.railway.app` | Must match the public URL (see step 4). Used to build the `/day/<id>` links the add-on returns. |

`PORT` is provided automatically by Railway — do **not** set it. The server
reads `process.env.PORT` and listens on it.

### Optional: in-app Gmail integration (legacy)

The in-app Gmail features (`/api/gmail/*`) are separate from the add-on. To use
them, also set:

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from your Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | from your Google Cloud OAuth client |

Then, in the Google Cloud console, add the production redirect URI:
`https://<your-app>.up.railway.app/api/gmail/callback`. The OAuth token is
stored at `$DATA_DIR/gmail-token.json` (on the volume), so it persists.

## 4. Get the public URL and finalize `APP_BASE_URL`

1. In the service: **Settings → Networking → Generate Domain** (or use a custom
   domain). This gives you something like `https://event-planner-production.up.railway.app`.
2. Copy that exact URL into the `APP_BASE_URL` variable (step 3). If it doesn't
   match the public URL, the `/day/<id>` links the add-on returns will be wrong.
3. Redeploy if you changed variables after the first deploy.

## 5. Verify

- Open `https://<your-app>.up.railway.app/` → the app UI loads.
- `GET /api/health` → `{ "ok": true }`.
- Add-on endpoints require the header `X-Addon-Key: <ADDON_API_KEY>`:
  - Missing/wrong key → `401`.
  - `ADDON_API_KEY` unset → `503 {"error":"addon_not_configured"}`.
