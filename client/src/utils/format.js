// Shared formatting helpers for prices, durations and approximate times.

export function formatPrice(price) {
  if (price === null || price === undefined || price === '') return '';
  return `₪${price}`;
}

// Format a price range. Single value when low===high; otherwise a span.
export function formatRange(low, high) {
  if (low === high) return formatPrice(low);
  return `₪${low}–₪${high}`;
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
  if (item.approx_start && item.approx_duration_hours) {
    const end = addHours(item.approx_start, item.approx_duration_hours);
    return end ? `${item.approx_start}–${end}` : item.approx_start;
  }
  if (item.approx_start) return item.approx_start;
  if (item.time_note) return item.time_note;
  if (item.approx_duration_hours) return `~${formatDuration(item.approx_duration_hours)}`;
  return '';
}

// Minutes since midnight for an "HH:MM" start string, or null if unset/invalid.
export function startMinutes(timeStr) {
  if (timeStr === null || timeStr === undefined || timeStr === '') return null;
  const parts = String(timeStr).trim().split(':');
  const h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// Items ordered by their start time. Items without a start sink to the end
// (keeping their relative order_index). Does not mutate the input.
export function sortByStart(items) {
  return [...items].sort((a, b) => {
    const am = startMinutes(a.approx_start);
    const bm = startMinutes(b.approx_start);
    if (am === null && bm === null) return (a.order_index ?? 0) - (b.order_index ?? 0);
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  });
}

// Price range for a single item. Spans the item's OWN price AND its option
// prices (skipping blank/zero). A plain item (no options) → low===high===price.
// A choice block → cheapest–priciest over item.price + option prices.
export function priceRange(item) {
  const prices = [];
  if (Number(item.price) > 0) prices.push(Number(item.price));
  for (const o of item.options || []) {
    if (Number(o.price) > 0) prices.push(Number(o.price));
  }
  if (!prices.length) return { low: 0, high: 0 };
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

// Sum the schedule into a per-head price range by summing each item's
// priceRange (so choice blocks span item.price + option prices).
export function total(items) {
  let low = 0;
  let high = 0;
  for (const it of items) {
    const r = priceRange(it);
    low += r.low;
    high += r.high;
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
