// Dynamic event statuses. The status list itself lives on the server and is
// edited via the Settings page; this module only owns the COLOR PALETTE and a
// set of pure helpers that resolve a status key against a given list.
//
// IMPORTANT: Tailwind only keeps classes it can see as complete literal
// strings, so COLOR_MAP must spell out every class in full. Never build a
// color class by concatenating a color name at runtime.

export const COLOR_MAP = {
  slate: { badge: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200', dot: 'bg-slate-400' },
  sky: { badge: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200', dot: 'bg-sky-500' },
  amber: { badge: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200', dot: 'bg-amber-500' },
  emerald: { badge: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  violet: { badge: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200', dot: 'bg-violet-500' },
  rose: { badge: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200', dot: 'bg-rose-500' },
  red: { badge: 'bg-red-100 text-red-700 ring-1 ring-red-200', dot: 'bg-red-500' },
  blue: { badge: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200', dot: 'bg-blue-500' },
  teal: { badge: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200', dot: 'bg-teal-500' },
  orange: { badge: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200', dot: 'bg-orange-500' },
  pink: { badge: 'bg-pink-100 text-pink-700 ring-1 ring-pink-200', dot: 'bg-pink-500' },
  indigo: { badge: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200', dot: 'bg-indigo-500' },
};

// Color names available in the picker.
export const COLORS = Object.keys(COLOR_MAP);

// Neutral fallback for unknown colors/keys.
const FALLBACK = COLOR_MAP.slate;

function color(name) {
  return COLOR_MAP[name] || FALLBACK;
}

// Find a status object in a list by its key/id. Returns undefined if missing.
export function findStatus(statuses, key) {
  return (statuses || []).find((s) => s.id === key);
}

export function statusLabel(statuses, key) {
  const s = findStatus(statuses, key);
  return s ? s.label : '—';
}

export function statusBadgeClass(statuses, key) {
  const s = findStatus(statuses, key);
  return color(s?.color).badge;
}

export function statusDotClass(statuses, key) {
  const s = findStatus(statuses, key);
  return color(s?.color).dot;
}
