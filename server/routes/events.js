// Events (days) + their schedule items.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlink } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { catalog, events, items, users } from '../db.js';
import { generateProposalDocx } from '../docx/generate.js';
import { generateProposalPdf } from '../pdf/generate.js';

const router = Router();

const now = () => new Date().toISOString();

// Private day-file attachments → disk (same volume as photos), served at
// /uploads. Accepts ANY file type (no image filter), capped at 25MB.
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const fileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
});
const fileUpload = multer({ storage: fileStorage, limits: { fileSize: 25 * 1024 * 1024 } });

function withItems(event) {
  const list = items
    .where((i) => i.event_id === event.id)
    .sort((a, b) => a.order_index - b.order_index);
  return { ...event, items: list };
}

// Resolve the לקוח a viewer is scoped to. Admins (or anything else) → null
// (unrestricted). Viewers with no assigned client → null (see all). Reads
// from req.user.client, falling back to the user record.
function scopedClient(req) {
  const u = req.user;
  if (!u || u.role !== 'viewer') return null;
  let client = u.client;
  if (client === undefined || client === null) {
    const record = users.find(u.id);
    client = record && record.client;
  }
  client = String(client || '').trim();
  return client || null;
}

// --- Events ---------------------------------------------------------------
router.get('/', (req, res) => {
  const client = scopedClient(req);
  const list = client
    ? events.all().filter((ev) => ev.client_name === client)
    : events.all();
  res.json(list.map(withItems));
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const event = events.insert({
    title: b.title || 'יום חדש',
    client_name: b.client_name || '',
    owner: b.owner || '',
    group_size: b.group_size ?? null,
    audience: b.audience || '',
    requests: b.requests || '',
    budget: b.budget ?? null,
    target_date: b.target_date || null,
    target_month: b.target_month || null,
    target_season: b.target_season || null,
    status: 'draft',
    options_mode: b.options_mode === true,
    cover_photo: null,
    email: null,
    notes: b.notes || '',
    client_notes: b.client_notes || '',
    files: [],
    created_at: now(),
    updated_at: now(),
  });
  res.status(201).json(withItems(event));
});

router.get('/:id', (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });
  // Don't leak other clients' days to a scoped viewer.
  const client = scopedClient(req);
  if (client && event.client_name !== client) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(withItems(event));
});

// Resolve the shared proposal request options (variant flags + per-option
// filtering) used by BOTH the PDF and Word exports, so the two formats always
// render exactly the same content for the same query string.
function proposalRequest(event, query) {
  const prices = query.prices === 'true';
  // In no-prices mode the per-person budget band shows unless budget=false.
  const budget = query.budget !== 'false';

  // Per-option export: when the event is in A/B options mode and ?option=A|B is
  // given, render ONLY that option as a normal single-schedule proposal (not the
  // stacked both-options layout). Option A = items where option !== 'B'.
  const optionParam = query.option === 'A' || query.option === 'B' ? query.option : null;
  const applyOption = optionParam && event.options_mode === true;
  // The Hebrew label shown on the cover badge / in the filename.
  const optionLabel = applyOption ? (optionParam === 'B' ? 'ב' : 'א') : null;

  let renderEvent = withItems(event);
  if (applyOption) {
    const filtered = renderEvent.items.filter((it) =>
      optionParam === 'B' ? it.option === 'B' : it.option !== 'B',
    );
    // Shallow copy with only this option's items and options_mode off, so the
    // renderer produces a normal single schedule instead of the stacked sections.
    renderEvent = { ...renderEvent, items: filtered, options_mode: false };
  }
  return { prices, budget, optionLabel, renderEvent };
}

// Build a filesystem-safe name from the event title, distinguishing the
// with/without-prices variants — mirrors the client's a.download scheme.
function proposalFilename(event, { prices, budget, optionLabel, ext }) {
  const base = String(event.title || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Three variants: with prices / no prices (with budget) / no prices, no budget.
  const suffix = prices ? ' (עם מחירים)' : budget ? '' : ' (ללא תקציב)';
  // When exporting a single option, insert "אופציה א/ב" before the variant suffix.
  const optionPart = optionLabel ? ` – אופציה ${optionLabel}` : '';
  return base
    ? `הצעה – ${base}${optionPart}${suffix}.${ext}`
    : `הצעה${optionPart}${suffix}.${ext}`;
}

// In-app proposal PDF download (no addon key). Renders a clean A4 Hebrew PDF.
router.get('/:id/proposal.pdf', async (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });

  const { prices, budget, optionLabel, renderEvent } = proposalRequest(event, req.query);

  let pdfBuffer;
  try {
    pdfBuffer = await generateProposalPdf(renderEvent, { prices, budget, option: optionLabel });
  } catch (err) {
    return res
      .status(503)
      .json({ error: 'pdf_unavailable', message: String(err.message || err) });
  }

  // UTF-8 filename* carries the real (Hebrew) name; the plain ASCII filename
  // is a safe fallback for clients that don't support RFC 5987.
  const name = proposalFilename(event, { prices, budget, optionLabel, ext: 'pdf' });
  const utf8Name = encodeURIComponent(name);
  res.set('Content-Type', 'application/pdf');
  res.set(
    'Content-Disposition',
    `attachment; filename="proposal.pdf"; filename*=UTF-8''${utf8Name}`,
  );
  res.send(pdfBuffer);
});

// The same proposal as an EDITABLE Word document. Same query string as the PDF
// route (prices / budget / option), same content and same money — only the
// medium differs. Note: unlike the PDF, catalog file attachments are NOT
// appended (a .docx can't absorb arbitrary PDFs page-for-page).
router.get('/:id/proposal.docx', async (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });

  const { prices, budget, optionLabel, renderEvent } = proposalRequest(event, req.query);

  let docxBuffer;
  try {
    docxBuffer = await generateProposalDocx(renderEvent, { prices, budget, option: optionLabel });
  } catch (err) {
    return res
      .status(503)
      .json({ error: 'docx_unavailable', message: String(err.message || err) });
  }

  const name = proposalFilename(event, { prices, budget, optionLabel, ext: 'docx' });
  const utf8Name = encodeURIComponent(name);
  res.set(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  res.set(
    'Content-Disposition',
    `attachment; filename="proposal.docx"; filename*=UTF-8''${utf8Name}`,
  );
  res.send(docxBuffer);
});

router.patch('/:id', (req, res) => {
  const event = events.update(req.params.id, { ...req.body, updated_at: now() });
  if (!event) return res.status(404).json({ error: 'not found' });
  res.json(withItems(event));
});

router.delete('/:id', (req, res) => {
  items.where((i) => i.event_id === req.params.id).forEach((i) => items.remove(i.id));
  const ok = events.remove(req.params.id);
  res.json({ ok });
});

// --- Files (private day attachments) -------------------------------------
router.post('/:id/files', fileUpload.single('file'), (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const file = {
    id: randomUUID(),
    // multer/busboy decodes the multipart filename as latin1; re-decode to
    // utf8 so Hebrew (and other non-ASCII) names aren't mojibake/squares.
    name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    type: req.file.mimetype,
    size: req.file.size,
    url: `/uploads/${req.file.filename}`,
    uploaded_at: new Date().toISOString(),
  };
  const files = [...(event.files || []), file];
  events.update(event.id, { files });
  res.status(201).json(file);
});

router.delete('/:id/files/:fileId', (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });
  const file = (event.files || []).find((f) => f.id === req.params.fileId);
  const files = (event.files || []).filter((f) => f.id !== req.params.fileId);
  events.update(event.id, { files });
  // Best-effort disk cleanup; ignore errors (e.g. already gone).
  if (file && file.url) {
    unlink(join(UPLOAD_DIR, file.url.replace(/^\/uploads\//, '')), () => {});
  }
  res.json({ ok: true });
});

// --- Items (schedule blocks) ---------------------------------------------
// Add an item. If `from_catalog_id` given, copy catalog defaults.
// Otherwise create the item AND auto-save it to the catalog for reuse.
router.post('/:id/items', (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};

  const siblings = items.where((i) => i.event_id === event.id);
  const order_index = siblings.length;

  let base = {
    title: b.title || 'פעילות',
    description: b.description || '',
    category: b.category || '',
    contact_name: b.contact_name || '',
    contact_phone: b.contact_phone || '',
    price: b.price ?? null,
    price_type: b.price_type === 'total' ? 'total' : 'per_person',
    fixed_cost: b.fixed_cost ?? null,
    fixed_cost_note: b.fixed_cost_note || '',
    approx_duration_hours: b.approx_duration_hours ?? null,
    photos: b.photos || [],
    catalog_activity_id: null,
  };

  if (b.from_catalog_id) {
    const c = catalog.find(b.from_catalog_id);
    if (c) {
      base = {
        ...base,
        title: c.title,
        description: c.description,
        category: c.category,
        contact_name: c.contact_name || '',
        contact_phone: c.contact_phone || '',
        price: c.default_price,
        price_type: c.default_price_type === 'total' ? 'total' : 'per_person',
        approx_duration_hours: c.default_duration_hours,
        photos: c.photos || [],
        catalog_activity_id: c.id,
      };
    }
  } else if (b.save_to_catalog !== false) {
    // Brand-new activity created inline → remember it in the catalog.
    const created = catalog.insert({
      title: base.title,
      description: base.description,
      category: base.category,
      default_duration_hours: base.approx_duration_hours,
      default_price: base.price,
      default_price_type: base.price_type,
      contact_name: base.contact_name,
      contact_phone: base.contact_phone,
      photos: base.photos,
      tags: [],
    });
    base.catalog_activity_id = created.id;
  }

  const item = items.insert({
    event_id: event.id,
    order_index,
    option: b.option === 'B' ? 'B' : 'A',
    approx_start: b.approx_start || null,
    time_note: b.time_note || '',
    notes: b.notes || '',
    options: [],
    ...base,
  });
  res.status(201).json(item);
});

router.patch('/items/:itemId', (req, res) => {
  const item = items.update(req.params.itemId, req.body || {});
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

router.delete('/items/:itemId', (req, res) => {
  res.json({ ok: items.remove(req.params.itemId) });
});

// --- Options (alternatives nested inside an item) ------------------------
// Add an option to a choice block. If `from_catalog_id` given, copy catalog
// defaults. Otherwise a fresh option that is auto-saved to the catalog.
router.post('/items/:itemId/options', (req, res) => {
  const item = items.find(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};

  let option = {
    id: randomUUID(),
    title: b.title || 'אפשרות',
    description: b.description || '',
    price: b.price ?? null,
    photos: b.photos || [],
    contact_name: b.contact_name || '',
    contact_phone: b.contact_phone || '',
    catalog_activity_id: null,
  };

  if (b.from_catalog_id) {
    const c = catalog.find(b.from_catalog_id);
    if (c) {
      option = {
        ...option,
        title: c.title,
        description: c.description || '',
        price: c.default_price ?? null,
        photos: c.photos || [],
        contact_name: c.contact_name || '',
        contact_phone: c.contact_phone || '',
        catalog_activity_id: c.id,
      };
    }
  } else if (b.save_to_catalog !== false) {
    // Brand-new option created inline → remember it in the catalog.
    const created = catalog.insert({
      title: option.title,
      description: option.description,
      category: '',
      default_duration_hours: null,
      default_price: option.price,
      contact_name: option.contact_name,
      contact_phone: option.contact_phone,
      photos: option.photos,
      tags: [],
    });
    option.catalog_activity_id = created.id;
  }

  const options = [...(item.options || []), option];
  items.update(item.id, { options });
  res.status(201).json(option);
});

router.patch('/items/:itemId/options/:optionId', (req, res) => {
  const item = items.find(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'not found' });
  const exists = (item.options || []).some((o) => o.id === req.params.optionId);
  if (!exists) return res.status(404).json({ error: 'not found' });
  const options = (item.options || []).map((o) =>
    o.id === req.params.optionId ? { ...o, ...(req.body || {}) } : o,
  );
  items.update(item.id, { options });
  res.json(options.find((o) => o.id === req.params.optionId));
});

router.delete('/items/:itemId/options/:optionId', (req, res) => {
  const item = items.find(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'not found' });
  const options = (item.options || []).filter((o) => o.id !== req.params.optionId);
  items.update(item.id, { options });
  res.json({ ok: true });
});

// Reorder: body { ordered_ids: [...] }
router.put('/:id/items/reorder', (req, res) => {
  const ordered = req.body?.ordered_ids || [];
  ordered.forEach((id, idx) => items.update(id, { order_index: idx }));
  const list = items
    .where((i) => i.event_id === req.params.id)
    .sort((a, b) => a.order_index - b.order_index);
  res.json(list);
});

export default router;
