# Connecting Gmail (one-time setup)

This lets the app read your request emails, create a fun day from a mail, and draft
reply emails with the no-prices PDF attached. ~5–10 minutes, all in the Google Cloud Console.
Do this with the **Google account whose Gmail you want to connect** (your Ocar mailbox).

---

## Part 1 — Create a Google Cloud project
1. Go to https://console.cloud.google.com and sign in.
2. Top bar → project dropdown → **New Project**.
3. Name it `Ocar Event Planner` → **Create** → make sure it's the selected project.

## Part 2 — Enable the Gmail API
4. Left menu (☰) → **APIs & Services → Library**.
5. Search **Gmail API** → open it → **Enable**.

## Part 3 — OAuth consent screen
(In the newer console this is under **APIs & Services → OAuth consent screen**, sometimes branded
"Google Auth Platform".)
6. Open **OAuth consent screen**. If it shows "Get started", fill:
   - App name: `Ocar Event Planner`
   - User support email: your email
   - **Audience: External**
   - Developer contact email: your email
   - Save.
7. **Audience** tab → keep status **Testing** → **Test users → Add users** → add **your own Gmail
   address** (and any teammate who will connect). In Testing mode, only listed test users can log in.
8. **Data access** (scopes) tab → **Add or remove scopes** → add these two (search or paste in the
   "manually add scopes" box), then **Update → Save**:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`

## Part 4 — Create the OAuth client
9. **APIs & Services → Credentials** (or Google Auth Platform → **Clients**).
10. **+ Create credentials → OAuth client ID**.
11. Application type: **Web application**. Name: `Ocar Event Planner local`.
12. **Authorized redirect URIs → + Add URI** → paste exactly:
    ```
    http://localhost:4001/api/gmail/callback
    ```
13. **Create** → in the dialog click **Download JSON**.

## Part 5 — Install the credentials in the app
14. Rename the downloaded file to **`credentials.json`** and put it at:
    ```
    server/gmail/credentials.json
    ```
    (It's gitignored — it will not be committed.) From the project root you can run:
    ```
    mv ~/Downloads/client_secret_*.json server/gmail/credentials.json
    ```
    (Alternatively, instead of the file, set env vars `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.)
15. **Restart the server** so it picks up the credentials (`npm run dev` again).

## Part 6 — Connect inside the app
16. Open http://localhost:4000 → **מיילים** tab → **התחבר ל-Gmail**.
17. A Google popup opens → pick your account → you'll see **"Google hasn't verified this app"**
    (normal for a Testing app) → **Advanced → Go to Ocar Event Planner (unsafe)** → it's your own
    app → **Continue** and grant the read + compose permissions.
18. The popup closes and the app flips to **connected**, listing your recent emails.

---

## Troubleshooting
- **"Access blocked / app not verified / no access"** → add your email under **Test users** (Part 3, step 7).
- **`redirect_uri_mismatch`** → the client's redirect URI must be exactly
  `http://localhost:4001/api/gmail/callback` (Part 4, step 12). If you change the server `PORT`,
  update this URI to match.
- **Switch to a different Gmail later** → delete `server/data/gmail-token.json` and reconnect.

## What the app can do with this access
- **Read** your request emails (`gmail.readonly`).
- **Create draft** replies with the proposal PDF attached (`gmail.compose`).
- It **never sends automatically** — you review and send each draft yourself in Gmail.
