import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import addonRouter from './routes/addon.js';
import catalogRouter, { categoryRouter } from './routes/catalog.js';
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
app.use('/api/events', eventsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/statuses', statusesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/gmail', gmailRouter);
app.use('/api/addon', addonRouter);

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
