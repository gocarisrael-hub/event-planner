// Authentication + user management.
// Mounted at /api/auth (login/me/logout) and /api/users (admin user mgmt).
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { hashPassword, sessions, users } from '../db.js';

const now = () => new Date().toISOString();

// Public view of a user — never leak the hash/salt.
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    client: u.client || '',
    created_at: u.created_at,
  };
}

// Constant-time hex compare. Returns false on any length mismatch.
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

// Look up the session + user for a Bearer token. Returns null if invalid.
export function sessionFromToken(token) {
  if (!token) return null;
  const session = sessions.all().find((s) => s.token === token);
  if (!session) return null;
  const user = users.find(session.user_id);
  if (!user) return null;
  return { session, user };
}

// --- /api/auth -------------------------------------------------------------
export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = users
    .all()
    .find((u) => String(u.email || '').toLowerCase() === String(email || '').toLowerCase());
  // Always compute a comparison to avoid trivial timing leaks.
  const candidate = user ? hashPassword(password ?? '', user.salt).password_hash : '';
  const ok = user && safeEqualHex(candidate, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const token = randomUUID();
  sessions.insert({ token, user_id: user.id, role: user.role, created_at: now() });
  res.json({ token, email: user.email, role: user.role });
});

authRouter.get('/me', (req, res) => {
  const token = bearer(req);
  const ctx = sessionFromToken(token);
  if (!ctx) return res.status(401).json({ error: 'unauthorized' });
  res.json({ email: ctx.user.email, role: ctx.user.role, client: ctx.user.client || '' });
});

authRouter.post('/logout', (req, res) => {
  const token = bearer(req);
  const session = sessions.all().find((s) => s.token === token);
  if (session) sessions.remove(session.id);
  res.json({ ok: true });
});

// --- /api/users (admin only; guarded by requireAdmin at mount) -------------
export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  res.json(users.all().map(publicUser));
});

usersRouter.post('/', (req, res) => {
  const { email, password, role, client } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'email_and_password_required' });
  }
  if (role !== 'admin' && role !== 'viewer') {
    return res.status(400).json({ error: 'invalid_role' });
  }
  const dup = users.all().some((u) => String(u.email || '').toLowerCase() === cleanEmail);
  if (dup) return res.status(409).json({ error: 'email_exists' });

  // The assigned לקוח is only meaningful for viewers; admins are unrestricted.
  const assignedClient = role === 'viewer' ? String(client || '').trim() : '';

  const { password_hash, salt } = hashPassword(password);
  const user = users.insert({
    email: cleanEmail,
    role,
    client: assignedClient,
    password_hash,
    salt,
    created_at: now(),
  });
  res.status(201).json(publicUser(user));
});

// Update a user's assigned לקוח (admin only). Only `client` is mutable here;
// other sensitive fields (email/role/password) are intentionally ignored.
usersRouter.patch('/:id', (req, res) => {
  const user = users.find(req.params.id);
  if (!user) return res.status(404).json({ error: 'not found' });
  const body = req.body || {};
  if ('client' in body) {
    users.update(user.id, { client: String(body.client || '').trim() });
  }
  res.json(publicUser(users.find(user.id)));
});

usersRouter.delete('/:id', (req, res) => {
  const user = users.find(req.params.id);
  if (!user) return res.status(404).json({ error: 'not found' });
  // Block deleting the last remaining admin.
  if (user.role === 'admin') {
    const admins = users.where((u) => u.role === 'admin');
    if (admins.length <= 1) {
      return res.status(409).json({ error: 'last_admin' });
    }
  }
  // Drop any active sessions for this user too.
  sessions.where((s) => s.user_id === user.id).forEach((s) => sessions.remove(s.id));
  res.json({ ok: users.remove(user.id) });
});

// Extract a Bearer token from the Authorization header.
export function bearer(req) {
  const h = req.get('authorization') || req.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
