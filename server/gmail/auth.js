// Gmail OAuth helpers.
// Credentials come from server/gmail/credentials.json (Google "Desktop app" or
// "Web" client JSON) if present, otherwise from env GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET. Tokens are stored in server/data/gmail-token.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_FILE = join(__dirname, 'credentials.json');
const TOKEN_FILE = process.env.DATA_DIR
  ? join(process.env.DATA_DIR, 'gmail-token.json')
  : join(__dirname, '..', 'data', 'gmail-token.json');

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

const PORT = process.env.PORT || 4001;
// The OAuth callback MUST exactly match an "Authorized redirect URI" on the
// Google OAuth client. On the hosted server, derive it from the public URL
// (GMAIL_REDIRECT_URI or APP_BASE_URL); fall back to localhost in dev.
const REDIRECT_URI =
  process.env.GMAIL_REDIRECT_URI ||
  (process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL.replace(/\/+$/, '')}/api/gmail/callback`
    : `http://localhost:${PORT}/api/gmail/callback`);

// Read client id/secret from credentials.json (either "installed" or "web"
// shape) or from env vars. Returns null when nothing is configured.
function loadCredentials() {
  if (existsSync(CREDENTIALS_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf8'));
      const block = parsed.installed || parsed.web || parsed;
      if (block.client_id && block.client_secret) {
        return { clientId: block.client_id, clientSecret: block.client_secret };
      }
    } catch {
      // fall through to env vars
    }
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  return null;
}

export function isConfigured() {
  return loadCredentials() !== null;
}

function newOAuthClient() {
  const creds = loadCredentials();
  if (!creds) throw new Error('Gmail not configured');
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);
}

function readToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeToken(token) {
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

export function getAuthUrl() {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function exchangeCode(code) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  // Preserve an existing refresh_token if Google omits it on re-consent.
  const existing = readToken() || {};
  const merged = { ...existing, ...tokens };
  if (!merged.refresh_token && existing.refresh_token) {
    merged.refresh_token = existing.refresh_token;
  }
  writeToken(merged);
  return merged;
}

// Returns an OAuth2 client with the stored token attached and auto-refresh
// wired up (refreshed tokens are persisted). Throws if not configured/connected.
export function getAuthorizedClient() {
  const client = newOAuthClient();
  const token = readToken();
  if (!token) throw new Error('Gmail not connected');
  client.setCredentials(token);
  client.on('tokens', (t) => {
    const current = readToken() || {};
    writeToken({ ...current, ...t });
  });
  return client;
}

// A stored token exists (and credentials are configured). We don't make a
// network call here; auto-refresh handles expiry at call time.
export function isConnected() {
  if (!isConfigured()) return false;
  const token = readToken();
  return Boolean(token && (token.refresh_token || token.access_token));
}
