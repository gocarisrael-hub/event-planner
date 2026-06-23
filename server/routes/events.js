// Events (days) + their schedule items.
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { catalog, events, items } from '../db.js';
import { generateProposalPdf } from '../pdf/generate.js';

const router = Router();

const now = () => new Date().toISOString();

function withItems(event) {
  const list = items
    .where((i) => i.event_id === event.id)
    .sort((a, b) => a.order_index - b.order_index);
  return { ...event, items: list };
}

// --- Events ---------------------------------------------------------------
router.get('/', (_req, res) => {
  res.json(events.all().map(withItems));
});

router.post('/', (req, res) => {
  const b = req.body || {};
  const event = events.insert({
    title: b.title || 'יום חדש',
    client_name: b.client_name || '',
    group_size: b.group_size ?? null,
    audience: b.audience || '',
    requests: b.requests || '',
    budget: b.budget ?? null,
    target_date: b.target_date || null,
    target_month: b.target_month || null,
    target_season: b.target_season || null,
    status: 'draft',
    cover_photo: null,
    email: null,
    created_at: now(),
    updated_at: now(),
  });
  res.status(201).json(withItems(event));
});

router.get('/:id', (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });
  res.json(withItems(event));
});

// In-app proposal PDF download (no addon key). Renders a clean A4 Hebrew PDF.
router.get('/:id/proposal.pdf', async (req, res) => {
  const event = events.find(req.params.id);
  if (!event) return res.status(404).json({ error: 'not found' });

  const prices = req.query.prices === 'true';

  let pdfBuffer;
  try {
    pdfBuffer = await generateProposalPdf(withItems(event), { prices });
  } catch (err) {
    return res
      .status(503)
      .json({ error: 'pdf_unavailable', message: String(err.message || err) });
  }

  // Build a filesystem-safe name from the event title, distinguishing the
  // with/without-prices variants — mirrors the client's a.download scheme.
  // UTF-8 filename* carries the real (Hebrew) name; the plain ASCII filename
  // is a safe fallback for clients that don't support RFC 5987.
  const base = String(event.title || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let name;
  if (!base) name = prices ? 'הצעה (עם מחירים).pdf' : 'הצעה.pdf';
  else name = prices ? `הצעה – ${base} (עם מחירים).pdf` : `הצעה – ${base}.pdf`;
  const utf8Name = encodeURIComponent(name);
  res.set('Content-Type', 'application/pdf');
  res.set(
    'Content-Disposition',
    `attachment; filename="proposal.pdf"; filename*=UTF-8''${utf8Name}`,
  );
  res.send(pdfBuffer);
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
