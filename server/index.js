import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import catalogRouter, { vendorRouter } from './routes/catalog.js';
import eventsRouter from './routes/events.js';
import uploadsRouter from './routes/uploads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Static: uploaded photos + the user-provided Ocar logo.
app.use('/uploads', express.static(join(__dirname, 'uploads')));
app.use('/brand', express.static(join(__dirname, 'assets')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/events', eventsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/vendors', vendorRouter);
app.use('/api/uploads', uploadsRouter);

app.listen(PORT, () => {
  console.log(`[event-planner] server on http://localhost:${PORT}`);
});
