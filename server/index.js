import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import addonRouter from './routes/addon.js';
import { authRouter, bearer, sessionFromToken, usersRouter } from './routes/auth.js';
import catalogRouter, { categoryRouter, clientRouter, spaceRouter } from './routes/catalog.js';
import eventsRouter from './routes/events.js';
import gmailRouter from './routes/gmail.js';
import statusesRouter from './routes/statuses.js';
import uploadsRouter from './routes/uploads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4001;
const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, 'uploads');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Static: uploaded photos + the user-provided Ocar logo.
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/brand', express.static(join(__dirname, 'assets')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
// Build/deploy marker — bump this string each deploy to verify what's live.
app.get('/api/version', (_req, res) => res.json({ version: '2026-06-24-gmail-reply-fix' }));

// --- Auth middleware -------------------------------------------------------
// Valid Bearer token → req.user = { id, email, role }; otherwise 401.
function requireAuth(req, res, next) {
  const ctx = sessionFromToken(bearer(req));
  if (!ctx) return res.status(401).json({ error: 'unauthorized' });
  req.user = {
    id: ctx.user.id,
    email: ctx.user.email,
    role: ctx.user.role,
    client: ctx.user.client || '',
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

// Viewer allowlist. A viewer is PURELY READ-ONLY and may ONLY:
//   - GET  /api/events            (list)
//   - GET  /api/events/:id        (single)
//   - GET  /api/statuses
// Everything else — including ANY write (PATCH/POST/PUT/DELETE), catalog,
// categories, uploads, gmail, users, events create/delete/items/files,
// statuses writes — is admin-only. Admins bypass.
function viewerGuard(req, res, next) {
  if (!req.user || req.user.role === 'admin') return next();
  if (req.user.role !== 'viewer') return res.status(403).json({ error: 'forbidden' });

  const { method } = req;
  // strip the /api prefix → e.g. '/events/123'
  const path = req.path;

  const isEventsRead =
    method === 'GET' && /^\/events(\/[^/]+)?$/.test(path);
  const isStatusesRead = method === 'GET' && path === '/statuses';

  if (isEventsRead || isStatusesRead) return next();
  return res.status(403).json({ error: 'forbidden' });
}

// Public: login. (me/logout read the Bearer token themselves.)
app.use('/api/auth', authRouter);

// The add-on keeps its own X-Addon-Key auth — no user auth here.
app.use('/api/addon', addonRouter);

// Everything else under /api requires a valid user, then the viewer allowlist.
app.use('/api', requireAuth, viewerGuard);

// User management is admin-only.
app.use('/api/users', requireAdmin, usersRouter);

app.use('/api/events', eventsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/spaces', spaceRouter);
app.use('/api/clients', clientRouter);
app.use('/api/statuses', statusesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/gmail', gmailRouter);

// Serve the built client (production). In dev there's no dist, so this is a
// no-op and the Vite dev server handles the front end via its proxy.
const CLIENT_DIST = join(__dirname, '..', 'client', 'dist');
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  // SPA fallback: any non-API, non-asset GET returns index.html so client-side
  // routing (e.g. /day/:id) works on a full page load.
  app.get(/^(?!\/(api|uploads|brand)\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[event-planner] server on http://localhost:${PORT}`);
});
