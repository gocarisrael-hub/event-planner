// Server-side proposal HTML, mirroring client/src/pages/ProposalPreview.jsx.
// Self-contained: RTL, lang=he, embedded CSS, Heebo via Google Fonts.
// When { prices:false } no prices/totals are rendered (reply PDF is always
// prices=false).
const BRAND = {
  name: 'star הפקות',
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

// Price range for a single item: spans the item's OWN price AND option prices
// (skipping blank/zero). Plain item → low===high===price. Mirrors
// client/src/utils/format.js priceRange.
function priceRange(item) {
  const prices = [];
  if (Number(item.price) > 0) prices.push(Number(item.price));
  for (const o of item.options || []) {
    if (Number(o.price) > 0) prices.push(Number(o.price));
  }
  if (!prices.length) return { low: 0, high: 0 };
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

function total(items) {
  let low = 0;
  let high = 0;
  for (const it of items) {
    const r = priceRange(it);
    low += r.low;
    high += r.high;
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
// base URL, so each photo is pre-resized/encoded into a base64 data URI by
// generate.js and passed in via the `photos` map (keyed by the original stored
// path). If a path isn't in the map, omit the <img> entirely.
function img(src, cls, photos) {
  const uri = src && photos ? photos[src] : '';
  if (!uri) return '';
  return `<img class="${cls}" src="${uri}" alt="" />`;
}

// Render one schedule item's HTML block. Shared by single- and two-option
// modes so the activity-block markup stays identical everywhere.
function itemHtml(it, { showPrices, photoMap }) {
    const tl = timingLabel(it) || '—';
    const dur = formatDuration(it.approx_duration_hours);
    const hasOptions = it.options?.length > 0;

    const mainPhoto = !hasOptions && it.photos?.[0]
      ? img(it.photos[0], 'item-photo', photoMap)
      : '';

    // Choice-block items have a price RANGE spanning item.price + option prices
    // (skipping blank/zero), mirroring the client `priceRange`/`formatRange`.
    // Plain items show their single price.
    let slotPrice = '';
    if (showPrices) {
      if (hasOptions) {
        const { low: lo, high: hi } = priceRange(it);
        slotPrice = `<div class="item-price"><bdi>${esc(formatRange(lo, hi))}</bdi></div>`;
      } else if (formatPrice(it.price)) {
        slotPrice = `<div class="item-price"><bdi>${esc(formatPrice(it.price))}</bdi></div>`;
      }
    }

    const itemContact = [it.contact_name, it.contact_phone].filter(Boolean).join(' · ');

    let optionsHtml = '';
    if (hasOptions) {
      const opts = it.options.map((o) => {
        const oPrice = showPrices && formatPrice(o.price)
          ? `<div class="opt-price"><bdi>${esc(formatPrice(o.price))}</bdi></div>`
          : '';
        const oPhoto = o.photos?.[0] ? img(o.photos[0], 'opt-photo', photoMap) : '';
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
              ${contact ? `<div class="opt-contact"><span class="contact-label">איש קשר</span> <bdi>${esc(contact)}</bdi></div>` : ''}
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
        <span class="dot" aria-hidden="true"></span>
        <div class="item-row">
          <div class="item-time">
            <div class="time-label"><bdi>${esc(tl)}</bdi></div>
            ${dur ? `<div class="time-dur">${esc(dur)}</div>` : ''}
          </div>
          ${mainPhoto}
          <div class="item-main">
            <div class="item-title">${esc(it.title)}</div>
            ${it.description ? `<div class="item-desc">${esc(it.description)}</div>` : ''}
            ${itemContact ? `<div class="item-contact">איש קשר: ${esc(itemContact)}</div>` : ''}
          </div>
          ${slotPrice}
        </div>
        ${optionsHtml}
      </div>`;
}

// The totals band (per-person + group) for a given price range. Only rendered
// by the caller when showPrices and high > 0.
function totalsBand(low, high, groupSize, label = 'מחיר לאדם') {
  return `
      <div class="totals">
        <div class="totals-row">
          <span class="totals-label">${esc(label)}</span>
          <span class="totals-value"><bdi>${esc(formatRange(low, high))}</bdi></span>
        </div>
        ${groupSize > 0 ? `
          <div class="totals-group">
            <span>סה״כ לקבוצה (×<bdi>${esc(groupSize)}</bdi>)</span>
            <span class="totals-group-value"><bdi>${esc(formatRange(low * groupSize, high * groupSize))}</bdi></span>
          </div>` : ''}
      </div>`;
}

// One schedule section: its items (sorted by start) plus, when prices are on,
// its own totals band. Used per-option in two-option mode, and once overall in
// single mode (with no section header).
function scheduleSection(rawItems, { showPrices, photoMap, groupSize, totalsLabel }) {
  const items = sortByStart(rawItems);
  const itemsHtml = items.map((it) => itemHtml(it, { showPrices, photoMap })).join('');
  const { low, high } = total(items);
  const totalsHtml = showPrices && high > 0
    ? totalsBand(low, high, groupSize, totalsLabel)
    : '';
  return `<div class="items">${itemsHtml}</div>${totalsHtml}`;
}

export function proposalHtml(event, { prices, photos, logo } = { prices: false, photos: {}, logo: null }) {
  const photoMap = photos || {};
  const logoUri = logo || null;
  const showPrices = Boolean(prices);
  const allItems = event.items || [];
  const optionsMode = event.options_mode === true;
  const groupSize = event.group_size > 0 ? event.group_size : 0;

  // Middot meta strip under the title: {date} · {N} משתתפים · {location}
  const metaParts = [
    whenLabel(event) ? `<bdi>${esc(whenLabel(event))}</bdi>` : '',
    event.group_size ? `<bdi>${esc(event.group_size)}</bdi> משתתפים` : '',
    event.location ? esc(event.location) : '',
  ].filter(Boolean);
  const metaHtml = metaParts.length
    ? `<div class="meta">${metaParts.join('<span class="meta-dot">·</span>')}</div>`
    : '';

  // Body: single schedule (unchanged) OR two stacked, labeled option sections.
  let bodyHtml;
  if (optionsMode) {
    const aItems = allItems.filter((it) => it.option !== 'B');
    const bItems = allItems.filter((it) => it.option === 'B');
    bodyHtml = `
      <div class="sched">הלו״ז ליום</div>
      <div class="option-section">
        <div class="option-head">אופציה א</div>
        ${scheduleSection(aItems, { showPrices, photoMap, groupSize, totalsLabel: 'מחיר לאדם · אופציה א' })}
      </div>
      <div class="option-section">
        <div class="option-head">אופציה ב</div>
        ${scheduleSection(bItems, { showPrices, photoMap, groupSize, totalsLabel: 'מחיר לאדם · אופציה ב' })}
      </div>`;
  } else {
    bodyHtml = `
      <div class="sched">הלו״ז ליום</div>
      ${scheduleSection(allItems, { showPrices, photoMap, groupSize })}`;
  }

  // When prices are hidden, surface the planned per-person goal budget instead
  // of real totals. event.budget is already a per-person ("לראש") figure.
  // Option-independent → shown once at the end in both modes.
  const budgetNum = Number(event.budget);
  const budgetHtml = !showPrices && Number.isFinite(budgetNum) && budgetNum > 0
    ? `
      <div class="totals budget">
        <div class="totals-row">
          <span class="totals-label">תקציב משוער לאדם</span>
          <span class="totals-value"><bdi>₪${esc(budgetNum.toLocaleString('he-IL'))}</bdi></span>
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Frank+Ruhl+Libre:wght@500;700&display=swap" rel="stylesheet" />
<title>${esc(event.title || 'הצעה')}</title>
<style>
  :root {
    --brand:#e00f19; --brand-wash:#fdecec;
    --ink:#141414; --ink-2:#3f3f43; --ink-3:#6b6b70; --ink-4:#9a9aa0;
    --line:#e9e9ec; --line-2:#f3f3f5; --panel:#fafafa;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Heebo', system-ui, Arial, sans-serif;
    color: var(--ink-2);
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  bdi { font-variant-numeric: tabular-nums; }
  .page { max-width: 760px; margin: 0 auto; background: #fff; padding: 44px 40px; }

  /* --- Header: black ink wordmark + a single small red "signature" tick --- */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--line); padding-bottom: 18px; margin-bottom: 28px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { height: 46px; width: auto; object-fit: contain; }
  .wordmark {
    font-size: 22px; font-weight: 800; color: var(--ink); line-height: 1.05;
    display: flex; align-items: center; gap: 8px;
  }
  .tick { display: inline-block; width: 18px; height: 3px; border-radius: 2px; background: var(--brand); }
  .tagline { font-size: 11px; color: var(--ink-4); margin-top: 5px; letter-spacing: .02em; }

  /* --- Title + middot meta strip --- */
  .title {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 30px; font-weight: 700; color: var(--ink); margin: 0 0 8px; line-height: 1.15;
    break-after: avoid; page-break-after: avoid;
  }
  .meta { font-size: 13px; color: var(--ink-3); margin: 0 0 26px; }
  .meta-dot { color: var(--ink-4); margin: 0 8px; }

  .sched {
    font-size: 13px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
    color: var(--ink-3); margin: 0 0 16px;
    break-after: avoid; page-break-after: avoid;
  }

  /* --- Timeline: hairline spine on the start (RTL-right) edge + red dots ---
     The spine is drawn PER ITEM (each .item paints its own segment via
     ::before) instead of one continuous absolutely-positioned line over the
     whole .items container. A single container-spanning line would not
     paginate — it would get clipped/misaligned across A4 page breaks — so each
     activity carries its own segment + dot, which survives page breaks cleanly
     while keeping the same hairline-spine + red-dot look on a single page. */
  .items { position: relative; }
  .item {
    position: relative; padding-inline-start: 26px;
    padding-bottom: 18px; margin-bottom: 18px;
    border-bottom: 1px solid var(--line-2);
    break-inside: avoid; page-break-inside: avoid;
  }
  /* Per-item spine segment: a vertical hairline on the start edge spanning the
     full height of this item, so the spine reconstructs continuously down the
     page yet never spans (and thus never gets cut at) a page boundary. */
  .item::before {
    content: ""; position: absolute; inset-inline-start: 5px;
    top: 0; bottom: 0; width: 2px; background: var(--line);
  }
  .item:first-child::before { top: 6px; }
  .item:last-child::before { bottom: auto; height: 6px; }
  .item:last-child { border-bottom: 0; margin-bottom: 0; }
  .dot {
    position: absolute; inset-inline-start: 0; top: 5px;
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--brand); box-shadow: 0 0 0 3px #fff, 0 0 0 4px var(--line);
  }
  .item-row { display: flex; gap: 16px; align-items: flex-start; }
  .item-time { min-width: 78px; }
  .time-label { font-size: 15px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
  .time-dur { font-size: 11px; color: var(--ink-4); margin-top: 2px; }
  .item-photo {
    height: 80px; width: 120px; border-radius: 10px; object-fit: cover; flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
    break-inside: avoid; page-break-inside: avoid;
  }
  /* No image should ever split across a page break. */
  img { break-inside: avoid; page-break-inside: avoid; }
  .item-main { flex: 1; min-width: 0; }
  .item-title { font-size: 16px; font-weight: 600; color: var(--ink); }
  .item-desc { font-size: 13px; line-height: 1.6; color: var(--ink-2); word-break: break-word; margin-top: 3px; }
  .item-contact { font-size: 12px; color: var(--ink-3); margin-top: 6px; }
  .contact-label { font-size: 10.5px; letter-spacing: .04em; color: var(--ink-4); }
  .item-price { font-size: 13px; font-weight: 600; white-space: nowrap; color: var(--ink); font-variant-numeric: tabular-nums; }

  /* --- Options / choice block --- */
  .options { margin-top: 14px; padding-inline-start: 94px; break-inside: avoid; page-break-inside: avoid; }
  .options-label {
    font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--ink-4); margin-bottom: 8px;
    break-after: avoid; page-break-after: avoid;
  }
  .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .opt {
    border: 1px solid var(--line); border-radius: 10px; padding: 12px; display: flex; gap: 12px; background: var(--panel);
    break-inside: avoid; page-break-inside: avoid;
  }
  .opt-photo {
    height: 64px; width: 64px; border-radius: 10px; object-fit: cover; flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
    break-inside: avoid; page-break-inside: avoid;
  }
  .opt-body { flex: 1; min-width: 0; }
  .opt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .opt-title { font-weight: 600; color: var(--ink); }
  .opt-price { font-size: 13px; font-weight: 600; white-space: nowrap; color: var(--ink); font-variant-numeric: tabular-nums; }
  .opt-desc { font-size: 13px; line-height: 1.6; color: var(--ink-2); word-break: break-word; margin-top: 2px; }
  .opt-contact { font-size: 12px; color: var(--ink-3); margin-top: 6px; }

  /* --- Totals / budget band: soft-red wash, 2px red top edge, red value --- */
  .totals {
    margin-top: 28px; padding: 16px 18px; border-radius: 12px;
    background: var(--brand-wash); border-top: 2px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
  }
  .totals-row { display: flex; justify-content: space-between; align-items: baseline; }
  .totals-label { font-weight: 700; font-size: 15px; color: var(--ink); }
  .totals-value { font-weight: 800; font-size: 20px; color: var(--brand); font-variant-numeric: tabular-nums; }
  .totals-group { display: flex; justify-content: space-between; align-items: baseline; color: var(--ink-3); font-size: 13px; margin-top: 8px; }
  .totals-group-value { font-weight: 600; color: var(--ink-2); font-variant-numeric: tabular-nums; }

  /* --- A/B option sections: stacked, each with a labeled header band --- */
  .option-section { margin-bottom: 36px; }
  .option-section:last-of-type { margin-bottom: 0; }
  .option-head {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 20px; font-weight: 700; color: var(--ink);
    padding: 8px 14px; margin: 0 0 18px; border-radius: 10px;
    background: var(--brand-wash); border-inline-start: 4px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
    break-after: avoid; page-break-after: avoid;
  }

  /* --- Footer: slim, centered, hairline above --- */
  .footer {
    margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line);
    text-align: center; font-size: 10px; color: var(--ink-4); letter-spacing: .02em;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${logoUri ? `<img class="logo" src="${logoUri}" alt="" />` : ''}
        <div>
          <div class="wordmark"><span class="tick" aria-hidden="true"></span>${esc(BRAND.name)}</div>
          <div class="tagline">${esc(BRAND.tagline)}</div>
        </div>
      </div>
    </div>

    <h1 class="title">${esc(event.title || '')}</h1>
    ${metaHtml}

    ${bodyHtml}

    ${budgetHtml}

    <div class="footer">${esc(BRAND.name)} · ${esc(BRAND.tagline)}</div>
  </div>
</body>
</html>`;
}
