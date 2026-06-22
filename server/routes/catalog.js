// Reusable catalog of activities + the defined category list.
import { Router } from 'express';
import { catalog, categories } from '../db.js';

const router = Router();

// --- Catalog activities ---------------------------------------------------
router.get('/', (_req, res) => res.json(catalog.all()));

router.post('/', (req, res) => {
  const b = req.body || {};
  const row = catalog.insert({
    title: b.title || 'פעילות',
    description: b.description || '',
    category: b.category || '',
    default_duration_hours: b.default_duration_hours ?? null,
    default_price: b.default_price ?? null,
    contact_name: b.contact_name || '',
    contact_phone: b.contact_phone || '',
    location: b.location || '',
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
