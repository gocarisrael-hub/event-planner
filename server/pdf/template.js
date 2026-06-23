// Server-side proposal HTML, mirroring client/src/pages/ProposalPreview.jsx.
// Self-contained: RTL, lang=he, embedded CSS, Heebo via Google Fonts.
// When { prices:false } no prices/totals are rendered (reply PDF is always
// prices=false).
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve uploads the same way server/routes/uploads.js does so a stored photo
// path like "/uploads/<file>" maps to "<UPLOADS_DIR>/<basename>".
const UPLOAD_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// Read a stored photo path off disk and return a base64 data URI, or '' if the
// file is missing/unreadable. Puppeteer's setContent has no base URL, so
// relative "/uploads/..." paths never load — embedding the bytes is robust.
function dataUri(src) {
  if (!src) return '';
  const mime = MIME_BY_EXT[extname(src).toLowerCase()];
  if (!mime) return '';
  try {
    const buf = readFileSync(join(UPLOAD_DIR, basename(src)));
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

const BRAND = {
  name: 'Ocar',
  tagline: 'בונים ימי כיף וימי גיבוש',
  primary: '#e00f19',
  dark: '#141414',
};

// --- timing/format helpers (reimplemented from client/src/utils/format.js) ---

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return '';
  return `₪${price}`;
}

function formatRange(low, high) {
  if (low === high) return formatPrice(low);
  return `₪${low}–₪${high}`;
}

function addHours(timeStr, hours) {
  if (timeStr === null || timeStr === undefined || timeStr === '') return '';
  const parts = String(timeStr).trim().split(':');
  const h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const t = h * 60 + m + Math.round(Number(hours) * 60);
  if (!Number.isFinite(t)) return '';
  const wrapped = ((t % 1440) + 1440) % 1440;
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatDuration(hours) {
  if (hours === null || hours === undefined || hours === '' || Number(hours) === 0) return '';
  const h = Number(hours);
  if (h === 1) return 'שעה';
  if (h === 2) return 'שעתיים';
  return `${h} שעות`;
}

function timingLabel(item) {
  if (item.approx_start && item.approx_duration_hours) {
    const end = addHours(item.approx_start, item.approx_duration_hours);
    return end ? `${item.approx_start}–${end}` : item.approx_start;
  }
  if (item.approx_start) return item.approx_start;
  if (item.time_note) return item.time_note;
  if (item.approx_duration_hours) return `~${formatDuration(item.approx_duration_hours)}`;
  return '';
}

function startMinutes(timeStr) {
  if (timeStr === null || timeStr === undefined || timeStr === '') return null;
  const parts = String(timeStr).trim().split(':');
  const h = Number(parts[0]);
  const m = parts.length > 1 ? Number(parts[1]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

// Items ordered by start time; items without a start sink to the end.
function sortByStart(list) {
  return [...list].sort((a, b) => {
    const am = startMinutes(a.approx_start);
    const bm = startMinutes(b.approx_start);
    if (am === null && bm === null) return (a.order_index ?? 0) - (b.order_index ?? 0);
    if (am === null) return 1;
    if (bm === null) return -1;
    return am - bm;
  });
}

function total(items) {
  let low = 0;
  let high = 0;
  for (const it of items) {
    if (it.options?.length) {
      const ps = it.options.map((o) => Number(o.price) || 0);
      low += Math.min(...ps);
      high += Math.max(...ps);
    } else {
      const p = Number(it.price) || 0;
      low += p;
      high += p;
    }
  }
  return { low, high };
}

function whenLabel(ev) {
  if (ev.target_date) return new Date(ev.target_date).toLocaleDateString('he-IL');
  if (ev.target_month) return ev.target_month;
  if (ev.target_season) return ev.target_season;
  return '';
}

// --- HTML escaping ----------------------------------------------------------
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Photo paths are stored as "/uploads/x.jpg". Puppeteer's setContent has no
// base URL, so we embed each photo as a base64 data URI read from disk. If the
// file is missing/unreadable, omit the <img> entirely (no crash, no blank box).
function img(src, cls) {
  const uri = dataUri(src);
  if (!uri) return '';
  return `<img class="${cls}" src="${uri}" alt="" />`;
}

export function proposalHtml(event, { prices } = { prices: false }) {
  const items = sortByStart(event.items || []);
  const { low, high } = total(items);
  const showPrices = Boolean(prices);

  const headerMeta = [
    event.client_name ? `<div class="hm-name">${esc(event.client_name)}</div>` : '',
    whenLabel(event) ? `<div>${esc(whenLabel(event))}</div>` : '',
    event.group_size ? `<div>${esc(event.group_size)} משתתפים</div>` : '',
  ].join('');

  const itemsHtml = items.map((it) => {
    const tl = timingLabel(it) || '—';
    const dur = formatDuration(it.approx_duration_hours);
    const hasOptions = it.options?.length > 0;

    const mainPhoto = !hasOptions && it.photos?.[0]
      ? img(it.photos[0], 'item-photo')
      : '';

    // Choice-block items have a price RANGE (cheapest–priciest option), mirroring
    // the client `total`/`formatRange`. Plain items show their single price.
    let slotPrice = '';
    if (showPrices) {
      if (hasOptions) {
        const ps = it.options.map((o) => Number(o.price) || 0);
        const lo = Math.min(...ps);
        const hi = Math.max(...ps);
        slotPrice = `<div class="item-price">${esc(formatRange(lo, hi))}</div>`;
      } else if (formatPrice(it.price)) {
        slotPrice = `<div class="item-price">${esc(formatPrice(it.price))}</div>`;
      }
    }

    let optionsHtml = '';
    if (hasOptions) {
      const opts = it.options.map((o) => {
        const oPrice = showPrices && formatPrice(o.price)
          ? `<div class="opt-price">${esc(formatPrice(o.price))}</div>`
          : '';
        const oPhoto = o.photos?.[0] ? img(o.photos[0], 'opt-photo') : '';
        const contact = [o.contact_name, o.contact_phone].filter(Boolean).join(' · ');
        return `
          <div class="opt">
            ${oPhoto}
            <div class="opt-body">
              <div class="opt-head">
                <div class="opt-title">${esc(o.title)}</div>
                ${oPrice}
              </div>
              ${o.description ? `<div class="opt-desc">${esc(o.description)}</div>` : ''}
              ${contact ? `<div class="opt-contact">${esc(contact)}</div>` : ''}
            </div>
          </div>`;
      }).join('');
      optionsHtml = `
        <div class="options">
          <div class="options-label">בחירה בין:</div>
          <div class="options-grid">${opts}</div>
        </div>`;
    }

    return `
      <div class="item">
        <div class="item-row">
          <div class="item-time">
            <div class="time-label"><bdi>${esc(tl)}</bdi></div>
            ${dur ? `<div class="time-dur">${esc(dur)}</div>` : ''}
          </div>
          ${mainPhoto}
          <div class="item-main">
            <div class="item-title">${esc(it.title)}</div>
            ${it.description ? `<div class="item-desc">${esc(it.description)}</div>` : ''}
          </div>
          ${slotPrice}
        </div>
        ${optionsHtml}
      </div>`;
  }).join('');

  const totalsHtml = showPrices && high > 0
    ? `
      <div class="totals">
        <div class="totals-row">
          <span class="totals-label">מחיר לאדם</span>
          <span class="totals-value">${esc(formatRange(low, high))}</span>
        </div>
        ${event.group_size > 0 ? `
          <div class="totals-group">
            <span>סה״כ לקבוצה (×${esc(event.group_size)})</span>
            <span class="totals-group-value">${esc(formatRange(low * event.group_size, high * event.group_size))}</span>
          </div>` : ''}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<title>${esc(event.title || 'הצעה')}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Heebo', system-ui, Arial, sans-serif;
    color: ${BRAND.dark};
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 40px; }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 2px solid ${BRAND.primary}; padding-bottom: 16px; margin-bottom: 24px;
  }
  .wordmark { font-size: 30px; font-weight: 800; color: ${BRAND.primary}; line-height: 1; }
  .tagline { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .header-meta { text-align: left; font-size: 13px; color: #64748b; }
  .header-meta .hm-name { font-weight: 600; color: #334155; }
  h1.title { font-size: 28px; font-weight: 800; color: ${BRAND.dark}; margin: 0 0 8px; }
  .requests { color: #475569; margin: 0 0 24px; }
  h2.sched { font-size: 18px; font-weight: 700; color: ${BRAND.primary}; margin: 0 0 12px; }
  .item { border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; margin-bottom: 12px; page-break-inside: avoid; }
  .item-row { display: flex; gap: 16px; align-items: flex-start; }
  .item-time { min-width: 90px; text-align: center; }
  .time-label { font-weight: 700; color: ${BRAND.primary}; }
  .time-dur { font-size: 12px; color: #94a3b8; }
  .item-photo { height: 80px; width: 96px; border-radius: 8px; object-fit: cover; }
  .item-main { flex: 1; }
  .item-title { font-weight: 600; }
  .item-desc { font-size: 13px; color: #64748b; word-break: break-word; }
  .item-price { font-size: 13px; font-weight: 500; white-space: nowrap; }
  .options { margin-top: 12px; padding-right: 106px; }
  .options-label { font-size: 12px; font-weight: 500; color: #94a3b8; margin-bottom: 8px; }
  .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .opt { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; gap: 12px; }
  .opt-photo { height: 64px; width: 64px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
  .opt-body { flex: 1; min-width: 0; }
  .opt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .opt-title { font-weight: 600; }
  .opt-price { font-size: 13px; font-weight: 500; white-space: nowrap; }
  .opt-desc { font-size: 13px; color: #64748b; word-break: break-word; }
  .opt-contact { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .totals { margin-top: 24px; padding-top: 16px; border-top: 2px solid ${BRAND.primary}; }
  .totals-row { display: flex; justify-content: space-between; align-items: center; }
  .totals-label { font-weight: 700; font-size: 18px; }
  .totals-value { font-weight: 800; font-size: 18px; color: ${BRAND.primary}; }
  .totals-group { display: flex; justify-content: space-between; align-items: center; color: #64748b; margin-top: 4px; }
  .totals-group-value { font-weight: 500; }
  .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="wordmark">${esc(BRAND.name)}</div>
        <div class="tagline">${esc(BRAND.tagline)}</div>
      </div>
      <div class="header-meta">${headerMeta}</div>
    </div>

    <h1 class="title">${esc(event.title || '')}</h1>
    ${event.requests ? `<p class="requests">${esc(event.requests)}</p>` : ''}

    <h2 class="sched">הלו״ז ליום</h2>
    <div class="items">${itemsHtml}</div>

    ${totalsHtml}

    <div class="footer">${esc(BRAND.name)} · ${esc(BRAND.tagline)}</div>
  </div>
</body>
</html>`;
}
