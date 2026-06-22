// Shared formatting helpers for prices, durations and approximate times.

export function formatPrice(price) {
  if (price === null || price === undefined || price === '') return '';
  return `₪${price}`;
}

// Add `hours` (may be fractional) to an "H:MM"/"HH:MM"/"HH" time string.
// Returns "HH:MM" zero-padded, wrapping past 24h. '' for empty/invalid input.
export function addHours(timeStr, hours) {
  if (timeStr === null || timeStr === undefined || timeStr === '') return '';
  const parts = String(timeStr).trim().split(':');
  const h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const total = h * 60 + m + Math.round(Number(hours) * 60);
  if (!Number.isFinite(total)) return '';
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatDuration(hours) {
  if (hours === null || hours === undefined || hours === '' || Number(hours) === 0) return '';
  const h = Number(hours);
  if (h === 1) return 'שעה';
  if (h === 2) return 'שעתיים';
  return `${h} שעות`;
}

// What to show on the timeline for an item's timing.
export function timingLabel(item) {
  if (item.approx_start && item.approx_end) return `${item.approx_start}–${item.approx_end}`;
  if (item.approx_start && item.approx_duration_hours)
    return `${item.approx_start}–${addHours(item.approx_start, item.approx_duration_hours)}`;
  if (item.approx_start) return item.approx_start;
  if (item.time_note) return item.time_note;
  if (item.approx_duration_hours) return `~${formatDuration(item.approx_duration_hours)}`;
  return '';
}

// Sum the schedule into a single per-head total (only items with show_price).
export function total(items) {
  let sum = 0;
  for (const it of items) {
    if (it.show_price === false) continue;
    sum += Number(it.price ?? 0) || 0;
  }
  return sum;
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
