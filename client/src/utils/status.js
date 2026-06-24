// Shared event status model: ordered keys + Hebrew labels + badge colors.
// Helpers default to the first entry (draft) for unknown/empty keys.

export const STATUSES = [
  { key: 'draft', label: 'טיוטה', badgeClass: 'bg-slate-100 text-slate-700' },
  { key: 'proposal_sent', label: 'הצעה נשלחה', badgeClass: 'bg-blue-100 text-blue-700' },
  { key: 'coordinating', label: 'בתיאום ספקים ומועד', badgeClass: 'bg-amber-100 text-amber-800' },
  { key: 'sealed', label: 'נסגר', badgeClass: 'bg-green-100 text-green-700' },
  { key: 'done', label: 'בוצע', badgeClass: 'bg-slate-700 text-white' },
  { key: 'cancelled', label: 'בוטל', badgeClass: 'bg-red-100 text-red-700' },
];

function entry(key) {
  return STATUSES.find((s) => s.key === key) || STATUSES[0];
}

export function statusLabel(key) {
  return entry(key).label;
}

export function statusBadgeClass(key) {
  return entry(key).badgeClass;
}
