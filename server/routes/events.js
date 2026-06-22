// Events (days) + their schedule items.
import { Router } from 'express';
import { catalog, events, items } from '../db.js';

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
    approx_end: b.approx_end || null,
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
    show_price: b.show_price ?? true,
    approx_start: b.approx_start || null,
    time_note: b.time_note || '',
    notes: b.notes || '',
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
