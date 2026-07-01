// Reusable catalog of activities + the defined category list.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlink } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { catalog, categories, clients, owners, spaces } from '../db.js';

const router = Router();

// Catalog-activity file attachments → disk (same volume/served at /uploads as
// day-files). Accepts ANY file type (no image filter), capped at 25MB. Mirrors
// the day-file pattern in routes/events.js.
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});
const fileUpload = multer({ storage: fileStorage, limits: { fileSize: 25 * 1024 * 1024 } });

// --- Catalog activities ---------------------------------------------------
router.get('/', (_req, res) => res.json(catalog.all()));

router.post('/', (req, res) => {
  const b = req.body || {};
  const row = catalog.insert({
    title: b.title || 'פעילות',
    description: b.description || '',
    notes: b.notes || '', // internal note — NEVER shown in the client proposal PDF
    category: b.category || '',
    default_duration_hours: b.default_duration_hours ?? null,
    default_price: b.default_price ?? null,
    default_price_type: b.default_price_type === 'total' ? 'total' : 'per_person',
    contact_name: b.contact_name || '',
    contact_phone: b.contact_phone || '',
    location: b.location || '',
    photos: b.photos || [],
    tags: b.tags || [],
    files: [],
  });
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  const row = catalog.update(req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => res.json({ ok: catalog.remove(req.params.id) }));

// --- Files (attachments appended to proposal PDFs) ------------------------
router.post('/:id/files', fileUpload.single('file'), (req, res) => {
  const row = catalog.find(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const file = {
    id: randomUUID(),
    // multer/busboy decodes the multipart filename as latin1; re-decode to
    // utf8 so Hebrew (and other non-ASCII) names aren't mojibake/squares.
    name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    type: req.file.mimetype,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    // Opt-in: only files explicitly marked are appended to the proposal PDF.
    in_pdf: false,
    uploaded_at: new Date().toISOString(),
  };
  const files = [...(row.files || []), file];
  catalog.update(row.id, { files });
  res.status(201).json(file);
});

// Toggle whether a catalog file is appended to the proposal PDF.
router.patch('/:id/files/:fileId', (req, res) => {
  const row = catalog.find(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const files = row.files || [];
  const file = files.find((f) => f.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: 'not found' });
  file.in_pdf = !!(req.body || {}).in_pdf;
  catalog.update(row.id, { files });
  res.json(file);
});

router.delete('/:id/files/:fileId', (req, res) => {
  const row = catalog.find(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const file = (row.files || []).find((f) => f.id === req.params.fileId);
  const files = (row.files || []).filter((f) => f.id !== req.params.fileId);
  catalog.update(row.id, { files });
  // Best-effort disk cleanup; ignore errors (e.g. already gone).
  if (file && file.url) {
    unlink(join(UPLOAD_DIR, file.url.replace(/^\/uploads\//, '')), () => {});
  }
  res.json({ ok: true });
});

export default router;

// --- Categories (defined list; mounted separately in index.js) ------------
export const categoryRouter = Router();
categoryRouter.get('/', (_req, res) => res.json(categories.all()));
categoryRouter.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const existing = categories.all().find((c) => c.name === name);
  if (existing) return res.status(200).json(existing);
  res.status(201).json(categories.insert({ name }));
});
categoryRouter.delete('/:id', (req, res) => res.json({ ok: categories.remove(req.params.id) }));

// --- Spaces (מרחב; defined list; mounted separately in index.js) -----------
export const spaceRouter = Router();
spaceRouter.get('/', (_req, res) => res.json(spaces.all()));
spaceRouter.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const existing = spaces.all().find((s) => s.name === name);
  if (existing) return res.status(200).json(existing);
  res.status(201).json(spaces.insert({ name }));
});
spaceRouter.delete('/:id', (req, res) => res.json({ ok: spaces.remove(req.params.id) }));

// --- Clients (לקוח; defined list; mounted separately in index.js) ----------
export const clientRouter = Router();
clientRouter.get('/', (_req, res) => res.json(clients.all()));
clientRouter.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const existing = clients.all().find((c) => c.name === name);
  if (existing) return res.status(200).json(existing);
  res.status(201).json(clients.insert({ name }));
});
clientRouter.delete('/:id', (req, res) => res.json({ ok: clients.remove(req.params.id) }));

// --- Owners (אחראי; defined list; mounted separately in index.js) ----------
export const ownerRouter = Router();
ownerRouter.get('/', (_req, res) => res.json(owners.all()));
ownerRouter.post('/', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const existing = owners.all().find((o) => o.name === name);
  if (existing) return res.status(200).json(existing);
  res.status(201).json(owners.insert({ name }));
});
ownerRouter.delete('/:id', (req, res) => res.json({ ok: owners.remove(req.params.id) }));
