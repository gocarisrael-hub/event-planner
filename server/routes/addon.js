// API-key-protected endpoints for the Gmail Add-on. Mounted at /api/addon.
// Every route requires header `X-Addon-Key` matching process.env.ADDON_API_KEY.
import { Router } from 'express';
import { events, items } from '../db.js';
import { generateProposalPdf } from '../pdf/generate.js';

const router = Router();
const now = () => new Date().toISOString();

function withItems(event) {
  const list = items
    .where((i) => i.event_id === event.id)
    .sort((a, b) => a.order_index - b.order_index);
  return { ...event, items: list };
}

// Require a valid X-Addon-Key on every add-on route.
function requireAddonKey(req, res, next) {
  const expected = process.env.ADDON_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'addon_not_configured' });
  }
  const provided = req.get('X-Addon-Key');
  if (provided !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

router.use(requireAddonKey);

// --- Create a day (event) from an email message ---------------------------
router.post('/create-day', (req, res) => {
  const b = req.body || {};
  const email = {
    message_id: b.message_id || null,
    thread_id: b.thread_id || null,
    from: b.from || '',
    subject: b.subject || '',
    date: b.date || '',
    snippet: b.snippet || '',
    body: b.body || '',
  };
  const title = b.subject || `יום עבור ${b.from || ''}`.trim();
  const event = events.insert({
    title,
    client_name: '',
    group_size: null,
    audience: '',
    requests: '',
    budget: null,
    target_date: null,
    target_month: null,
    target_season: null,
    status: 'draft',
    cover_photo: null,
    emails: [email],
    created_at: now(),
    updated_at: now(),
  });
  const base = process.env.APP_BASE_URL || '';
  res.status(201).json({ event_id: event.id, url: `${base}/day/${event.id}` });
});

// --- A short human label for when the day is planned ----------------------
function whenLabel(event) {
  if (event.target_date) {
    try {
      return new Date(event.target_date).toLocaleDateString('he-IL');
    } catch {
      return event.target_date;
    }
  }
  if (event.target_month) return event.target_month;
  if (event.target_season) return event.target_season;
  return '';
}

// --- Lightweight list of existing days for selection in the add-on --------
router.get('/days', (_req, res) => {
  const list = events
    .all()
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 50)
    .map((e) => ({
      id: e.id,
      title: e.title || '',
      client_name: e.client_name || '',
      when: whenLabel(e),
    }));
  res.json(list);
});

// --- Link an email to an existing day -------------------------------------
router.post('/link-day', (req, res) => {
  const b = req.body || {};
  const event = events.find(b.event_id);
  if (!event) return res.status(404).json({ error: 'not found' });
  const email = {
    message_id: b.message_id || null,
    thread_id: b.thread_id || null,
    from: b.from || '',
    subject: b.subject || '',
    date: b.date || '',
    snippet: b.snippet || '',
    body: b.body || '',
  };
  // Append to the day's emails, deduping by message_id (or thread_id).
  const existing = Array.isArray(event.emails) ? event.emails : [];
  const isDup = existing.some(
    (e) =>
      (email.message_id && e.message_id === email.message_id) ||
      (email.thread_id && e.thread_id === email.thread_id),
  );
  const emails = isDup ? existing : [...existing, email];
  events.update(event.id, { emails, updated_at: now() });
  const base = process.env.APP_BASE_URL || '';
  res.status(201).json({ event_id: event.id, url: `${base}/day/${event.id}` });
});

// --- Does a day already exist for this email thread? ----------------------
router.get('/event-by-thread', (req, res) => {
  const threadId = req.query.thread_id;
  if (!threadId) return res.json({ exists: false });
  const matches = events
    .where((e) => (e.emails || []).some((m) => m.thread_id === threadId))
    .slice()
    .sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(
        String(a.updated_at || a.created_at || '')
      )
    );
  const event = matches[0];
  if (!event) return res.json({ exists: false });
  res.json({ exists: true, id: event.id, title: event.title || '' });
});

// --- Proposal PDF (no prices) for an event --------------------------------
router.get('/proposal-pdf', async (req, res) => {
  const { event_id: eventId, thread_id: threadId } = req.query;

  let event = null;
  if (eventId) {
    event = events.find(eventId);
  } else if (threadId) {
    event = events.where((e) => (e.emails || []).some((m) => m.thread_id === threadId))[0] || null;
  }
  if (!event) return res.status(404).json({ error: 'not found' });

  let pdfBuffer;
  try {
    pdfBuffer = await generateProposalPdf(withItems(event), { prices: false });
  } catch (err) {
    return res
      .status(503)
      .json({ error: 'pdf_unavailable', message: String(err.message || err) });
  }

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'attachment; filename="proposal.pdf"');
  res.send(pdfBuffer);
});

export default router;
