// User-editable event statuses (dynamic; replaces the old hardcoded set).
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { statuses } from '../db.js';

const router = Router();

const sorted = () => [...statuses.all()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

router.get('/', (_req, res) => res.json(sorted()));

router.post('/', (req, res) => {
  const label = (req.body?.label || '').trim();
  const color = (req.body?.color || 'slate').trim();
  if (!label) return res.status(400).json({ error: 'label required' });
  const maxOrder = statuses.all().reduce((m, s) => Math.max(m, s.order ?? 0), -1);
  const row = statuses.insert({ id: randomUUID(), label, color, order: maxOrder + 1 });
  res.status(201).json(row);
});

router.put('/:id', (req, res) => {
  const patch = {};
  const b = req.body || {};
  if (typeof b.label === 'string') patch.label = b.label.trim();
  if (typeof b.color === 'string') patch.color = b.color.trim();
  if (b.order !== undefined && b.order !== null) patch.order = Number(b.order);
  const row = statuses.update(req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.delete('/:id', (req, res) => {
  if (!statuses.find(req.params.id)) return res.status(404).json({ error: 'not found' });
  // Never allow removing the last remaining status.
  if (statuses.all().length <= 1) {
    return res.status(400).json({ error: 'cannot delete the last status' });
  }
  res.json({ ok: statuses.remove(req.params.id) });
});

export default router;
