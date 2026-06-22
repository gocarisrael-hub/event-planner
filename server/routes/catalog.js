// Reusable catalog of activities + vendors.
import { Router } from 'express';
import { catalog, vendors } from '../db.js';

const router = Router();

// --- Catalog activities ---------------------------------------------------
router.get('/', (_req, res) => res.json(catalog.all()));

router.post('/', (req, res) => {
  const b = req.body || {};
  const row = catalog.insert({
    title: b.title || 'פעילות',
    description: b.description || '',
    category: b.category || '',
    default_duration_min: b.default_duration_min ?? null,
    default_price_min: b.default_price_min ?? null,
    default_price_max: b.default_price_max ?? null,
    vendor_id: b.vendor_id || null,
    photos: b.photos || [],
    tags: b.tags || [],
  });
  res.status(201).json(row);
});

router.patch('/:id', (req, res) => {
  const row = catalog.update(req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => res.json({ ok: catalog.remove(req.params.id) }));

export default router;

// --- Vendors (mounted separately in index.js) -----------------------------
export const vendorRouter = Router();
vendorRouter.get('/', (_req, res) => res.json(vendors.all()));
vendorRouter.post('/', (req, res) => {
  const b = req.body || {};
  res.status(201).json(
    vendors.insert({ name: b.name || '', contact: b.contact || '', notes: b.notes || '' })
  );
});
vendorRouter.patch('/:id', (req, res) => {
  const row = vendors.update(req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});
vendorRouter.delete('/:id', (req, res) => res.json({ ok: vendors.remove(req.params.id) }));
