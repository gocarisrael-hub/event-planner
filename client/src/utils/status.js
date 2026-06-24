// Shared event status model: ordered keys + Hebrew labels + badge colors.
// Helpers default to the first entry (draft) for unknown/empty keys.
// Each entry carries a soft pill palette (bg/text/ring) + a matching dot color
// for the StatusSelect control.

export const STATUSES = [
  {
    key: 'draft',
    label: 'טיוטה',
    badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    dotClass: 'bg-slate-400',
  },
  {
    key: 'proposal_sent',
    label: 'הצעה נשלחה',
    badgeClass: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
    dotClass: 'bg-sky-500',
  },
  {
    key: 'coordinating',
    label: 'בתיאום ספקים ומועד',
    badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
    dotClass: 'bg-amber-500',
  },
  {
    key: 'sealed',
    label: 'נסגר',
    badgeClass: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  {
    key: 'done',
    label: 'בוצע',
    badgeClass: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
    dotClass: 'bg-violet-500',
  },
  {
    key: 'cancelled',
    label: 'בוטל',
    badgeClass: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
    dotClass: 'bg-rose-500',
  },
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

export function statusDotClass(key) {
  return entry(key).dotClass;
}
