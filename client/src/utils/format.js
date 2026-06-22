// Shared formatting helpers for prices, durations and approximate times.

export function formatPrice(min, max) {
  const has = (v) => v !== null && v !== undefined && v !== '';
  if (!has(min) && !has(max)) return '';
  if (has(min) && has(max) && Number(min) !== Number(max)) return `₪${min}–₪${max}`;
  return `₪${has(min) ? min : max}`;
}

export function formatDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} ש' ${m} דק'`;
  if (h) return `${h} ש'`;
  return `${m} דק'`;
}

// What to show on the timeline for an item's timing.
export function timingLabel(item) {
  if (item.approx_start) return item.approx_start;
  if (item.time_note) return item.time_note;
  if (item.approx_duration_min) return `~${formatDuration(item.approx_duration_min)}`;
  return '';
}

// Sum the schedule into a low/high range (only items with show_price).
export function totalRange(items) {
  let low = 0;
  let high = 0;
  for (const it of items) {
    if (it.show_price === false) continue;
    const lo = Number(it.price_min ?? it.price_max ?? 0) || 0;
    const hi = Number(it.price_max ?? it.price_min ?? 0) || 0;
    low += lo;
    high += hi;
  }
  return { low, high };
}

export const SEASONS = ['אביב', 'קיץ', 'סתיו', 'חורף'];
export const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// Human label for an event's date/month/season ("מתי").
export function whenLabel(ev) {
  if (ev.target_date) return new Date(ev.target_date).toLocaleDateString('he-IL');
  if (ev.target_month) return ev.target_month;
  if (ev.target_season) return ev.target_season;
  return '';
}
