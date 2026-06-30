// Server-side proposal HTML, mirroring client/src/pages/ProposalPreview.jsx.
// Self-contained: RTL, lang=he, embedded CSS, Heebo + Frank Ruhl Libre via
// Google Fonts. When { prices:false } no prices/totals are rendered (reply PDF
// is always prices=false).
//
// DESIGN SYSTEM: premium, minimal, editorial, spacious. Each activity is a
// self-contained card with one CONSISTENT vertical order everywhere —
//   1) title  2) image  3) time & duration  4) description  5) contact
// — separated by generous whitespace, never split across a page. Restrained
// palette (white / light neutrals) with the brand red used sparingly to flag
// the most important info (times, prices, totals). PRINT-SAFE: no CSS
// gradients and no blurred/banding box-shadows anywhere (they render as ugly
// gray bands in a printed PDF); separation comes from flat fills + 1px
// hairline borders only.
const BRAND = {
  name: 'star הפקות',
  tagline: 'בונים ימי כיף וימי גיבוש',
  contact: 'gocarisrael@gmail.com',
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

// Group total accounting for each item's price TYPE (mirrors
// client/src/utils/format.js groupTotal): choice blocks and per_person items
// contribute priceRange×N, while a plain price_type==='total' item contributes
// a FLAT amount (not ×N).
function groupTotal(items, groupSize) {
  const n = Number(groupSize) > 0 ? Number(groupSize) : 0;
  let low = 0;
  let high = 0;
  for (const it of items) {
    const hasOptions = (it.options || []).length > 0;
    const r = priceRange(it);
    if (!hasOptions && it.price_type === 'total') {
      low += r.low;
      high += r.high;
    } else {
      low += r.low * n;
      high += r.high * n;
    }
  }
  return { low, high };
}

// Per-person range: groupTotal/N (rounded whole ₪) with a group size; else the
// sum of per-head priceRanges. Mirrors client/src/utils/format.js perPerson.
function perPerson(items, groupSize) {
  const n = Number(groupSize) > 0 ? Number(groupSize) : 0;
  if (n > 0) {
    const g = groupTotal(items, n);
    return { low: Math.round(g.low / n), high: Math.round(g.high / n) };
  }
  return total(items);
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

// Render one schedule item as a self-contained activity card. The vertical
// order is IDENTICAL for every activity regardless of length:
//   1) title (+ price chip, prices mode)  2) image  3) time & duration
//   4) description  5) contact            then any choice/option block.
// Shared by single- and two-option modes so the markup stays identical.
function itemHtml(it, { showPrices, photoMap }) {
    const tl = timingLabel(it) || '—';
    const dur = formatDuration(it.approx_duration_hours);
    const hasOptions = it.options?.length > 0;

    const mainPhoto = !hasOptions && it.photos?.[0]
      ? img(it.photos[0], 'act-photo', photoMap)
      : '';

    // Choice-block items have a price RANGE spanning item.price + option prices
    // (skipping blank/zero), mirroring the client `priceRange`/`formatRange`.
    // Plain items show their single price.
    let slotPrice = '';
    if (showPrices) {
      if (hasOptions) {
        const { low: lo, high: hi } = priceRange(it);
        slotPrice = `<div class="act-price"><bdi>${esc(formatRange(lo, hi))}</bdi></div>`;
      } else if (formatPrice(it.price)) {
        // A flat total-priced item (e.g. venue rental) is tagged סה״כ so it's
        // not mistaken for a per-head figure.
        const tag = it.price_type === 'total'
          ? ' <span class="price-tag">סה״כ</span>'
          : '';
        slotPrice = `<div class="act-price"><bdi>${esc(formatPrice(it.price))}</bdi>${tag}</div>`;
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

    const durHtml = dur ? `<span class="act-dur">${esc(dur)}</span>` : '';

    return `
      <article class="act">
        <div class="act-row">
          ${mainPhoto ? `<div class="act-thumb">${mainPhoto}</div>` : ''}
          <div class="act-body">
            <header class="act-head">
              <h3 class="act-title">${esc(it.title)}</h3>
              ${slotPrice}
            </header>
            <div class="act-time">
              <span class="act-time-dot" aria-hidden="true"></span>
              <span class="act-time-val"><bdi>${esc(tl)}</bdi></span>
              ${durHtml}
            </div>
            ${it.description ? `<p class="act-desc">${esc(it.description)}</p>` : ''}
            ${itemContact ? `<div class="act-contact">איש קשר: ${esc(itemContact)}</div>` : ''}
          </div>
        </div>
        ${optionsHtml}
      </article>`;
}

// The totals band (per-person + group) for a set of items, accounting for each
// item's price TYPE. Only rendered by the caller when showPrices and the
// schedule has any priced item.
function totalsBand(items, groupSize, label = 'מחיר לאדם') {
  const pp = perPerson(items, groupSize);
  const g = groupTotal(items, groupSize);
  return `
      <div class="totals">
        <div class="totals-row">
          <span class="totals-label">${esc(label)}</span>
          <span class="totals-value"><bdi>${esc(formatRange(pp.low, pp.high))}</bdi></span>
        </div>
        ${groupSize > 0 ? `
          <div class="totals-group">
            <span>סה״כ לקבוצה (×<bdi>${esc(groupSize)}</bdi>)</span>
            <span class="totals-group-value"><bdi>${esc(formatRange(g.low, g.high))}</bdi></span>
          </div>` : ''}
      </div>`;
}

// One schedule section: its items (sorted by start) plus, when prices are on,
// its own totals band. Used per-option in two-option mode, and once overall in
// single mode (with no section header).
function scheduleSection(rawItems, { showPrices, photoMap, groupSize, totalsLabel }) {
  const items = sortByStart(rawItems);
  const itemsHtml = items.map((it) => itemHtml(it, { showPrices, photoMap })).join('');
  const { high } = total(items);
  const totalsHtml = showPrices && high > 0
    ? totalsBand(items, groupSize, totalsLabel)
    : '';
  return `<div class="items">${itemsHtml}</div>${totalsHtml}`;
}

// Find the first usable hero photo embedded in the photo map. Prefers
// event.cover_photo; otherwise falls back to the first activity's first photo
// (in schedule order). Returns a data URI or null. The hero must be a base64
// data URI (Puppeteer has no base URL) — generate.js embeds cover_photo into the
// photo map and passes it through here.
function pickHero(event, photoMap) {
  if (event.cover_photo && photoMap[event.cover_photo]) return photoMap[event.cover_photo];
  const sorted = sortByStart(event.items || []);
  for (const it of sorted) {
    const p = it.photos?.[0];
    if (p && photoMap[p]) return photoMap[p];
    for (const o of it.options || []) {
      const op = o.photos?.[0];
      if (op && photoMap[op]) return photoMap[op];
    }
  }
  return null;
}

export function proposalHtml(event, { prices, budget, photos, logo, cover } = { prices: false, budget: true, photos: {}, logo: null, cover: null }) {
  const photoMap = photos || {};
  const logoUri = logo || null;
  const showPrices = Boolean(prices);
  // In no-prices mode, the per-person budget band shows unless explicitly off.
  const showBudget = budget !== false;
  const allItems = event.items || [];
  const optionsMode = event.options_mode === true;
  const groupSize = event.group_size > 0 ? event.group_size : 0;

  // Hero image for the cover band: explicit `cover` data URI wins, else derive
  // one from the photo map (cover_photo → first activity photo).
  const heroUri = cover || pickHero(event, photoMap);

  // Cover metadata: client / participants / when / location rendered as an
  // elegant labeled strip, each cell separated by a SUBTLE hairline divider.
  // Only cells with a value render.
  const metaCells = [
    ['לקוח', event.client_name ? esc(event.client_name) : ''],
    ['משתתפים', event.group_size ? `<bdi>${esc(event.group_size)}</bdi>` : ''],
    ['מועד', whenLabel(event) ? `<bdi>${esc(whenLabel(event))}</bdi>` : ''],
    ['מיקום', event.location ? esc(event.location) : ''],
  ].filter(([, v]) => v);
  const coverMetaHtml = metaCells.length
    ? `<div class="cover-meta">${metaCells
        .map(([l, v]) => `<div class="meta-cell"><div class="meta-label">${l}</div><div class="meta-value">${v}</div></div>`)
        .join('')}</div>`
    : '';

  // The wordmark lockup, reused on the branded (no-photo) cover.
  const wordmarkLockup = (variant) => `
    <div class="cover-brand cover-brand--${variant}">
      ${logoUri ? `<img class="cover-logo" src="${logoUri}" alt="" />` : ''}
      <span class="cover-word">${esc(BRAND.name)}</span>
    </div>`;

  // COVER / HERO. With a photo → a quiet top wordmark, a prominent hero photo,
  // then the title + metadata below it on white (a magazine-feature opener). No
  // text-over-photo overlay → no shaded box and nothing to band in print, and
  // the title is always legible. With NO photo at all → a tasteful branded ink
  // band with a white title (still flat fills only, never a broken hero).
  const coverHtml = heroUri
    ? `
      <div class="topbar">
        ${logoUri ? `<img class="topbar-logo" src="${logoUri}" alt="" />` : ''}
        <span class="topbar-word">${esc(BRAND.name)}</span>
      </div>
      <div class="hero"><img class="hero-img" src="${heroUri}" alt="" /></div>
      <div class="cover-eyebrow">${esc(BRAND.tagline)}</div>
      <h1 class="hero-title">${esc(event.title || '')}</h1>
      <div class="hero-rule"></div>
      ${coverMetaHtml}`
    : `
      <div class="cover cover--brand">
        ${wordmarkLockup('brand')}
        <div class="cover-text">
          <div class="cover-eyebrow cover-eyebrow--on-dark">${esc(BRAND.tagline)}</div>
          <h1 class="cover-title">${esc(event.title || '')}</h1>
        </div>
      </div>
      ${coverMetaHtml}`;

  // Body: single schedule OR two stacked, labeled option sections. In prices
  // mode the per-section totals stay inline; in no-prices mode totals are
  // suppressed and replaced by the single closing investment band below.
  let bodyHtml;
  if (optionsMode) {
    const aItems = allItems.filter((it) => it.option !== 'B');
    const bItems = allItems.filter((it) => it.option === 'B');
    bodyHtml = `
      <div class="sched">הלו״ז ליום</div>
      <section class="option-section">
        <div class="option-head">אופציה א</div>
        ${scheduleSection(aItems, { showPrices, photoMap, groupSize, totalsLabel: 'מחיר לאדם · אופציה א' })}
      </section>
      <section class="option-section">
        <div class="option-head">אופציה ב</div>
        ${scheduleSection(bItems, { showPrices, photoMap, groupSize, totalsLabel: 'מחיר לאדם · אופציה ב' })}
      </section>`;
  } else {
    bodyHtml = `
      <div class="sched">הלו״ז ליום</div>
      ${scheduleSection(allItems, { showPrices, photoMap, groupSize })}`;
  }

  // --- Closing: investment band + CTA, kept tidy and paired ---------------
  // With prices on, the closing band summarises the overall per-person + group
  // total (single mode only — options mode already shows a per-section total).
  // Without prices, it surfaces the planned per-person goal budget instead
  // (event.budget is a per-person "לראש" figure). The band + warm CTA are
  // wrapped TOGETHER in one .closing block so the band can never orphan.
  let closingBandHtml = '';
  if (showPrices) {
    if (!optionsMode) {
      const { high } = total(allItems);
      if (high > 0) {
        const pp = perPerson(allItems, groupSize);
        const g = groupTotal(allItems, groupSize);
        closingBandHtml = `
          <div class="invest">
            <div class="invest-row">
              <span class="invest-label">מחיר לאדם</span>
              <span class="invest-value"><bdi>${esc(formatRange(pp.low, pp.high))}</bdi></span>
            </div>
            ${groupSize > 0 ? `
              <div class="invest-group">
                <span>סה״כ לקבוצה (×<bdi>${esc(groupSize)}</bdi>)</span>
                <span class="invest-group-value"><bdi>${esc(formatRange(g.low, g.high))}</bdi></span>
              </div>` : ''}
          </div>`;
      }
    }
  } else {
    const budgetNum = Number(event.budget);
    if (showBudget && Number.isFinite(budgetNum) && budgetNum > 0) {
      closingBandHtml = `
        <div class="invest budget">
          <div class="invest-row">
            <span class="invest-label">תקציב לאדם</span>
            <span class="invest-value"><bdi>₪${esc(budgetNum.toLocaleString('he-IL'))}</bdi></span>
          </div>
        </div>`;
    }
  }

  // The warm closing CTA + contact — always present, paired with the band.
  const ctaHtml = `
    <div class="cta">
      <span class="cta-line">נשמח לתאם ולצאת לדרך 🎉</span>
      <span class="meta-dot">·</span>
      <span class="cta-contact"><span class="cta-brand">${esc(BRAND.name)}</span> <bdi>${esc(BRAND.contact)}</bdi></span>
    </div>`;

  const closingHtml = `
    <div class="closing">
      ${closingBandHtml}
      ${ctaHtml}
    </div>`;

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
    --brand:#e00f19; --brand-deep:#b30c14; --brand-wash:#fdecec;
    --ink:#141414; --ink-2:#3d3d42; --ink-3:#6b6b72; --ink-4:#9a9aa2;
    --line:#e9e9ec; --line-2:#f1f1f3; --card:#ffffff; --paper:#fbfbfa;
  }
  @page { margin: 0; }
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
  /* Generous page margins; the puppeteer footer band lives below the bottom
     padding so nothing clips. */
  .page { background: var(--paper); padding: 20px 38px 22px; }

  /* ====================================================================
     COVER  — quiet wordmark, prominent hero photo, then the title + an
     elegant labeled metadata strip below it on white. No overlay text on
     the photo → always legible, nothing to band in print. */
  .topbar { display: flex; align-items: center; gap: 11px; margin: 0 0 12px; }
  .topbar-logo { height: 30px; width: auto; object-fit: contain; border-radius: 6px; }
  .topbar-word { font-size: 17px; font-weight: 800; color: var(--ink); letter-spacing: -.01em; }
  .hero {
    height: 78px; border-radius: 12px; overflow: hidden; background: var(--line-2);
    break-inside: avoid; page-break-inside: avoid;
  }
  .hero-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase;
    color: var(--brand); margin: 16px 0 0;
  }
  .hero-title {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 26px; font-weight: 700; line-height: 1.1; color: var(--ink);
    margin: 6px 0 0; break-after: avoid; page-break-after: avoid;
  }
  .hero-rule { width: 48px; height: 3px; background: var(--brand); border-radius: 2px; margin: 8px 0 10px; }

  /* BRANDED COVER (no photo at all): a tasteful flat ink band, white title. */
  .cover {
    position: relative; min-height: 300px; border-radius: 18px; overflow: hidden;
    margin: 0 0 26px; padding: 30px 34px; display: flex; flex-direction: column;
    justify-content: flex-end;
    break-inside: avoid; page-break-inside: avoid;
  }
  .cover--brand { background: var(--ink); }
  .cover--brand::after {
    content: ""; position: absolute; inset-inline-start: 0; bottom: 0;
    width: 100%; height: 6px; background: var(--brand);
  }
  .cover-brand {
    position: absolute; top: 28px; inset-inline-start: 34px;
    display: flex; align-items: center; gap: 11px; z-index: 2;
  }
  .cover-logo {
    height: 38px; width: auto; object-fit: contain; border-radius: 8px;
    background: #fff; padding: 4px;
  }
  .cover-word { font-size: 18px; font-weight: 800; color: #fff; letter-spacing: .01em; }
  .cover-text { position: relative; z-index: 2; }
  .cover-eyebrow--on-dark { color: #ff6068; margin: 0 0 8px; }
  .cover-title {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 42px; font-weight: 700; line-height: 1.08; color: #fff; margin: 0;
  }

  /* Metadata strip: labeled cells separated by SUBTLE hairline dividers. */
  .cover-meta {
    display: flex; flex-wrap: wrap; gap: 0 26px;
    padding: 2px 0; margin-bottom: 8px;
  }
  .meta-cell {
    padding-inline-end: 30px; border-inline-end: 1px solid var(--line);
  }
  .meta-cell:last-child { border-inline-end: 0; padding-inline-end: 0; }
  .meta-label {
    font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: var(--ink-4); margin-bottom: 3px;
  }
  .meta-value { font-size: 15px; font-weight: 600; color: var(--ink); }
  .cover--brand + .cover-meta .meta-cell { border-color: var(--line); }
  .meta-dot { color: var(--ink-4); margin: 0 7px; }

  /* ====================================================================
     SCHEDULE — section label */
  .sched {
    font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase;
    color: var(--brand); margin: 2px 0 8px;
    break-after: avoid; page-break-after: avoid;
    display: flex; align-items: center; gap: 14px;
  }
  .sched::after { content: ""; flex: 1; height: 1px; background: var(--line); }

  .items { display: block; }

  /* ====================================================================
     ACTIVITY CARD — one self-contained block, identical vertical order
     everywhere: title → image → time → description → contact. Separation
     comes from generous spacing + a single hairline border (no shadow, no
     heavy frame). The whole card never splits across a page. */
  /* Compact activity ROW: a small thumbnail beside the text, so days stay
     dense (ideally one page). Card never splits across a page. */
  .act {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 8px 12px;
    margin-bottom: 5px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .act:last-child { margin-bottom: 0; }
  .act-row { display: flex; gap: 12px; align-items: flex-start; }
  .act-thumb {
    flex-shrink: 0; border-radius: 10px; overflow: hidden; background: var(--line-2);
    break-inside: avoid; page-break-inside: avoid;
  }
  /* Small fixed-size thumbnail; object-fit:cover keeps aspect ratio, no stretch. */
  .act-photo {
    width: 92px; height: 70px; object-fit: cover; display: block;
    break-inside: avoid; page-break-inside: avoid;
  }
  img { break-inside: avoid; page-break-inside: avoid; }
  .act-body { flex: 1; min-width: 0; }
  .act-head {
    display: flex; justify-content: space-between; align-items: baseline; gap: 14px;
    break-after: avoid; page-break-after: avoid;
  }
  .act-title {
    font-size: 16px; font-weight: 700; color: var(--ink); line-height: 1.25; margin: 0;
    letter-spacing: -.01em;
  }
  .act-price {
    font-size: 15px; font-weight: 800; white-space: nowrap; flex-shrink: 0;
    color: var(--brand-deep); font-variant-numeric: tabular-nums; align-self: flex-start;
  }
  /* Tiny suffix flagging a flat total-priced item (e.g. venue rental). */
  .price-tag {
    font-size: 9.5px; font-weight: 600; color: var(--ink-4);
    letter-spacing: .04em; margin-inline-start: 3px;
  }
  /* TIME — scannable: red marker + bold tabular time + muted duration. */
  .act-time {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 4px;
  }
  .act-time-dot {
    width: 7px; height: 7px; border-radius: 50%; background: var(--brand); flex-shrink: 0;
  }
  .act-time-val {
    font-size: 14px; font-weight: 800; color: var(--ink);
    font-variant-numeric: tabular-nums; letter-spacing: -.01em;
  }
  .act-dur { font-size: 11.5px; font-weight: 600; color: var(--ink-3); }
  .act-dur::before { content: "·"; margin-inline-end: 6px; color: var(--ink-4); }

  .act-desc {
    font-size: 11px; line-height: 1.4; color: var(--ink-2);
    margin: 4px 0 0; word-break: break-word;
  }
  .act-contact { font-size: 11px; color: var(--ink-3); margin-top: 5px; }

  /* --- Choice / option block (inside an activity card) --- */
  .options {
    margin-top: 18px; padding: 16px 18px;
    background: var(--paper);
    border: 1px solid var(--line); border-radius: 14px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .options-label {
    font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: var(--brand); margin-bottom: 12px;
    break-after: avoid; page-break-after: avoid;
  }
  .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .opt {
    border: 1px solid var(--line); border-radius: 12px; padding: 13px; display: flex; gap: 12px;
    background: var(--card);
    break-inside: avoid; page-break-inside: avoid;
  }
  .opt-photo {
    height: 66px; width: 66px; border-radius: 10px; object-fit: cover; flex-shrink: 0;
    border: 1px solid var(--line);
    break-inside: avoid; page-break-inside: avoid;
  }
  .opt-body { flex: 1; min-width: 0; }
  .opt-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .opt-title { font-weight: 700; color: var(--ink); font-size: 14px; }
  .opt-price { font-size: 13px; font-weight: 700; white-space: nowrap; color: var(--brand-deep); font-variant-numeric: tabular-nums; }
  .opt-desc { font-size: 12.5px; line-height: 1.6; color: var(--ink-2); word-break: break-word; margin-top: 4px; }
  .opt-contact { font-size: 11.5px; color: var(--ink-3); margin-top: 7px; }
  .contact-label { font-size: 10px; letter-spacing: .04em; color: var(--ink-4); }

  /* --- Inline per-section totals (prices mode, inside the schedule) -------- */
  .totals {
    margin-top: 22px; padding: 16px 4px 0;
    border-top: 2px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
  }
  .totals-row { display: flex; justify-content: space-between; align-items: baseline; }
  .totals-label { font-weight: 700; font-size: 14px; color: var(--ink); }
  .totals-value { font-weight: 800; font-size: 20px; color: var(--brand-deep); font-variant-numeric: tabular-nums; }
  .totals-group { display: flex; justify-content: space-between; align-items: baseline; color: var(--ink-3); font-size: 13px; margin-top: 9px; }
  .totals-group-value { font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }

  /* --- A/B option sections: stacked, each with a labeled header band --- */
  .option-section { margin-bottom: 40px; }
  .option-section:last-of-type { margin-bottom: 0; }
  .option-head {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 24px; font-weight: 700; color: var(--ink);
    padding: 0 0 10px; margin: 0 0 20px;
    border-bottom: 2px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
    break-after: avoid; page-break-after: avoid;
  }

  /* ====================================================================
     CLOSING — investment band + CTA. Open editorial block: a strong red top
     rule + dark label + a big red value reads premium and prints perfectly
     clean (no filled box, no shadow). The .invest band keeps break-inside
     avoid so the budget never splits. */
  .closing { margin-top: 32px; }
  .invest {
    padding: 9px 4px 0; border-top: 3px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
  }
  .invest-cap {
    font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase;
    color: var(--ink-4); margin-bottom: 6px;
  }
  .invest-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
  .invest-label { font-weight: 700; font-size: 18px; color: var(--ink); }
  .invest-value { font-weight: 800; font-size: 24px; color: var(--brand-deep); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
  .invest-group {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line);
    color: var(--ink-3); font-size: 12.5px;
  }
  .invest-group-value { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }

  /* One compact centered line so it never orphans onto a new page. */
  .cta {
    margin-top: 10px; padding: 0; text-align: center;
    display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 8px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .cta-line {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 16px; font-weight: 700; color: var(--ink);
  }
  .cta-contact { font-size: 12px; color: var(--ink-3); }
  .cta-brand { font-weight: 700; color: var(--ink); }
</style>
</head>
<body>
  <div class="page">
    ${coverHtml}

    ${bodyHtml}

    ${closingHtml}
  </div>
</body>
</html>`;
}
