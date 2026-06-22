// Geometry for the day timeline. The visible day window is 07:00 → 24:00
// (midnight), i.e. 17 hours. A block's vertical position encodes its start
// time; its height encodes its duration.

export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 24 * 60; // 24:00 (midnight)
export const HOUR_PX = 64; // pixels per hour
export const SNAP_MIN = 15; // drag snaps to 15-minute steps
export const MIN_BLOCK_PX = 28; // keep very short blocks readable

// Total height of the track in pixels.
export const TRACK_PX = ((DAY_END_MIN - DAY_START_MIN) / 60) * HOUR_PX;

// Hour marks down the side: 07:00 … 24:00 (rendered as 00:00).
export function hourMarks() {
  const marks = [];
  for (let h = 7; h <= 24; h += 1) {
    const label = `${String(h % 24).padStart(2, '0')}:00`;
    marks.push({ hour: h, label, top: ((h * 60 - DAY_START_MIN) / 60) * HOUR_PX });
  }
  return marks;
}

// "HH:MM" → minutes since midnight (null when empty/invalid).
export function startToMinutes(timeStr) {
  if (timeStr === null || timeStr === undefined || timeStr === '') return null;
  const parts = String(timeStr).trim().split(':');
  const h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// minutes since midnight → "HH:MM" (24:00 shown as 00:00).
export function minutesToStart(min) {
  const clamped = clampMin(min);
  const hh = Math.floor(clamped / 60) % 24;
  const mm = clamped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// Clamp a start time to the day window. Duration (hours) keeps a block's end
// from spilling past midnight when known.
export function clampMin(min, durationHours = 0) {
  const durMin = Math.round((Number(durationHours) || 0) * 60);
  const maxStart = Math.max(DAY_START_MIN, DAY_END_MIN - durMin);
  if (min < DAY_START_MIN) return DAY_START_MIN;
  if (min > maxStart) return maxStart;
  return min;
}

// minutes since midnight → top offset in pixels.
export function minutesToTop(min) {
  return ((min - DAY_START_MIN) / 60) * HOUR_PX;
}

// top offset in pixels → minutes since midnight, snapped to SNAP_MIN.
export function topToMinutes(top) {
  const raw = DAY_START_MIN + (top / HOUR_PX) * 60;
  return Math.round(raw / SNAP_MIN) * SNAP_MIN;
}

// Pixel height for a duration in hours (with a readable minimum).
export function durationToHeight(durationHours) {
  const h = (Number(durationHours) || 1) * HOUR_PX;
  return Math.max(MIN_BLOCK_PX, h);
}
