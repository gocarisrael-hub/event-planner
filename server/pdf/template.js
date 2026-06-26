// Server-side proposal HTML, mirroring client/src/pages/ProposalPreview.jsx.
// Self-contained: RTL, lang=he, embedded CSS, Heebo via Google Fonts.
// When { prices:false } no prices/totals are rendered (reply PDF is always
// prices=false).
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

export function proposalHtml(event, { prices, photos, logo, cover } = { prices: false, photos: {}, logo: null, cover: null }) {
  const photoMap = photos || {};
  const logoUri = logo || null;
  const showPrices = Boolean(prices);
  const allItems = event.items || [];
  const optionsMode = event.options_mode === true;
  const groupSize = event.group_size > 0 ? event.group_size : 0;

  // Hero image for the cover band: explicit `cover` data URI wins, else derive
  // one from the photo map (cover_photo → first activity photo).
  const heroUri = cover || pickHero(event, photoMap);

  // Cover meta line: client · {N} משתתפים · month/date · location
  const coverMetaParts = [
    event.client_name ? esc(event.client_name) : '',
    event.group_size ? `<bdi>${esc(event.group_size)}</bdi> משתתפים` : '',
    whenLabel(event) ? `<bdi>${esc(whenLabel(event))}</bdi>` : '',
    event.location ? esc(event.location) : '',
  ].filter(Boolean);
  const coverMetaHtml = coverMetaParts.length
    ? `<div class="cover-meta">${coverMetaParts.join('<span class="meta-dot">·</span>')}</div>`
    : '';

  // The wordmark lockup, reused on the photo hero (white) and branded cover.
  const wordmarkLockup = (variant) => `
    <div class="cover-brand cover-brand--${variant}">
      ${logoUri ? `<img class="cover-logo" src="${logoUri}" alt="" />` : ''}
      <span class="cover-word">${esc(BRAND.name)}</span>
    </div>`;

  // COVER / HERO. With a photo → full-width band, dark bottom gradient, the
  // wordmark top corner and the title + meta bottom-aligned in white. With NO
  // photo at all → a tasteful branded ink/red band (never a broken hero).
  const coverHtml = heroUri
    ? `
      <div class="cover cover--photo">
        <img class="cover-img" src="${heroUri}" alt="" />
        <div class="cover-shade"></div>
        ${wordmarkLockup('photo')}
        <div class="cover-text">
          <h1 class="cover-title">${esc(event.title || '')}</h1>
          ${coverMetaHtml}
        </div>
      </div>`
    : `
      <div class="cover cover--brand">
        ${wordmarkLockup('brand')}
        <div class="cover-text">
          <h1 class="cover-title">${esc(event.title || '')}</h1>
          <div class="cover-tag">${esc(BRAND.tagline)}</div>
          ${coverMetaHtml}
        </div>
      </div>`;

  // Body: single schedule (unchanged) OR two stacked, labeled option sections.
  // In prices mode the per-section totals stay inline; in no-prices mode totals
  // are suppressed and replaced by the single closing investment band below.
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

  // --- Closing: investment band + CTA, kept tidy and paired ---------------
  // The closing band is the confident "investment per person" moment near the
  // end. With prices on, it summarises the overall per-person + group total.
  // Without prices, it surfaces the planned per-person goal budget instead
  // (event.budget is already a per-person "לראש" figure). The band and the warm
  // CTA are wrapped TOGETHER in one .closing block with break-inside:avoid, so
  // the budget band can never orphan onto a page by itself or sit half-cut — if
  // it must move to a new page it carries the CTA with it.
  let closingBandHtml = '';
  if (showPrices) {
    // Overall per-person investment across the whole day (single mode) — in
    // options mode each section already shows its own total, so the closing
    // band leads with a headline rather than a duplicate number.
    if (!optionsMode) {
      const { low, high } = total(allItems);
      if (high > 0) {
        closingBandHtml = `
          <div class="invest">
            <div class="invest-cap">ההשקעה ליום</div>
            <div class="invest-row">
              <span class="invest-label">מחיר לאדם</span>
              <span class="invest-value"><bdi>${esc(formatRange(low, high))}</bdi></span>
            </div>
            ${groupSize > 0 ? `
              <div class="invest-group">
                <span>סה״כ לקבוצה (×<bdi>${esc(groupSize)}</bdi>)</span>
                <span class="invest-group-value"><bdi>${esc(formatRange(low * groupSize, high * groupSize))}</bdi></span>
              </div>` : ''}
          </div>`;
      }
    }
  } else {
    const budgetNum = Number(event.budget);
    if (Number.isFinite(budgetNum) && budgetNum > 0) {
      closingBandHtml = `
        <div class="invest budget">
          <div class="invest-cap">ההשקעה ליום</div>
          <div class="invest-row">
            <span class="invest-label">תקציב משוער לאדם</span>
            <span class="invest-value"><bdi>₪${esc(budgetNum.toLocaleString('he-IL'))}</bdi></span>
          </div>
        </div>`;
    }
  }

  // The warm closing CTA + contact — always present, paired with the band.
  const ctaHtml = `
    <div class="cta">
      <div class="cta-line">נשמח לתאם ולצאת לדרך 🎉</div>
      <div class="cta-contact">
        <span class="cta-brand">${esc(BRAND.name)}</span>
        <span class="meta-dot">·</span>
        <bdi>${esc(BRAND.contact)}</bdi>
      </div>
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
    --ink:#141414; --ink-2:#3f3f43; --ink-3:#6b6b70; --ink-4:#9a9aa0;
    --line:#e9e9ec; --line-2:#f3f3f5; --panel:#faf8f6; --paper:#fdfcfb;
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
  .page { background: var(--paper); padding: 40px 44px 48px; }

  /* --- COVER / HERO -------------------------------------------------------
     A full-width hero band with a photo + dark bottom gradient, the wordmark
     top-corner (white) and the day title + meta bottom-aligned (white). When
     no photo exists at all, a branded ink/red band stands in. The cover is a
     self-contained block so it leads page 1 cleanly. */
  .cover {
    position: relative; height: 268px; border-radius: 16px; overflow: hidden;
    margin: 0 0 30px; break-inside: avoid; page-break-inside: avoid;
    box-shadow: 0 1px 0 rgba(0,0,0,.04);
  }
  .cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .cover-shade {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(8,8,10,.86) 0%, rgba(8,8,10,.55) 32%, rgba(8,8,10,.05) 62%, rgba(8,8,10,0) 100%);
  }
  .cover--brand {
    background:
      radial-gradient(120% 140% at 88% 8%, rgba(224,15,25,.55) 0%, rgba(224,15,25,0) 55%),
      linear-gradient(135deg, #1c1c1f 0%, var(--ink) 60%, #050506 100%);
  }
  .cover--brand::after {
    content: ""; position: absolute; inset-inline-start: 0; bottom: 0;
    width: 100%; height: 5px; background: var(--brand);
  }
  .cover-brand {
    position: absolute; top: 22px; inset-inline-start: 26px;
    display: flex; align-items: center; gap: 11px; z-index: 2;
  }
  .cover-logo {
    height: 40px; width: auto; object-fit: contain; border-radius: 8px;
    background: #fff; padding: 4px; box-shadow: 0 2px 10px rgba(0,0,0,.25);
  }
  .cover-word { font-size: 19px; font-weight: 800; color: #fff; letter-spacing: .01em; text-shadow: 0 1px 6px rgba(0,0,0,.4); }
  .cover-text { position: absolute; inset-inline: 28px; bottom: 24px; z-index: 2; }
  .cover-title {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 40px; font-weight: 700; line-height: 1.08; color: #fff; margin: 0;
    text-shadow: 0 2px 14px rgba(0,0,0,.45);
  }
  .cover-tag { color: rgba(255,255,255,.86); font-size: 14px; margin-top: 8px; letter-spacing: .02em; }
  .cover-meta {
    margin-top: 11px; font-size: 13.5px; font-weight: 500;
    color: rgba(255,255,255,.92); text-shadow: 0 1px 8px rgba(0,0,0,.5);
  }
  .cover-meta .meta-dot { color: rgba(255,255,255,.55); }
  .meta-dot { color: var(--ink-4); margin: 0 8px; }

  .sched {
    font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;
    color: var(--brand); margin: 4px 0 20px;
    break-after: avoid; page-break-after: avoid;
    display: flex; align-items: center; gap: 12px;
  }
  .sched::after { content: ""; flex: 1; height: 1px; background: var(--line); }

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
    position: absolute; inset-inline-start: -1px; top: 5px;
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--brand); box-shadow: 0 0 0 3px #fff, 0 0 0 4px rgba(224,15,25,.22);
  }
  .item-row { display: flex; gap: 18px; align-items: flex-start; }
  .item-time { min-width: 70px; padding-top: 1px; }
  .time-label { font-size: 16px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
  .time-dur { font-size: 11px; color: var(--ink-4); margin-top: 2px; }
  .item-photo {
    height: 104px; width: 156px; border-radius: 12px; object-fit: cover; flex-shrink: 0;
    box-shadow: 0 2px 10px rgba(0,0,0,.10), inset 0 0 0 1px rgba(0,0,0,.05);
    break-inside: avoid; page-break-inside: avoid;
  }
  /* No image should ever split across a page break. */
  img { break-inside: avoid; page-break-inside: avoid; }
  .item-main { flex: 1; min-width: 0; padding-top: 1px; }
  .item-title { font-size: 18px; font-weight: 700; color: var(--ink); line-height: 1.25; }
  .item-desc { font-size: 13px; line-height: 1.62; color: var(--ink-2); word-break: break-word; margin-top: 4px; }
  .item-contact { font-size: 12px; color: var(--ink-3); margin-top: 7px; }
  .contact-label { font-size: 10.5px; letter-spacing: .04em; color: var(--ink-4); }
  .item-price {
    font-size: 14px; font-weight: 700; white-space: nowrap; color: var(--ink);
    font-variant-numeric: tabular-nums; align-self: flex-start;
    background: var(--brand-wash); color: var(--brand-deep);
    padding: 4px 10px; border-radius: 999px;
  }

  /* --- Options / choice block --- */
  .options {
    margin-top: 16px; padding: 14px 16px; padding-inline-start: 88px;
    background: linear-gradient(180deg, #fff 0%, var(--panel) 100%);
    border: 1px solid var(--line); border-radius: 14px;
    break-inside: avoid; page-break-inside: avoid;
  }
  .options-label {
    font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
    color: var(--brand); margin-bottom: 10px;
    break-after: avoid; page-break-after: avoid;
  }
  .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .opt {
    border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; gap: 12px; background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,.04);
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

  /* --- Inline per-section totals (prices mode, inside the schedule) -------- */
  .totals {
    margin-top: 24px; padding: 14px 18px; border-radius: 12px;
    background: var(--brand-wash); border-inline-start: 4px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
  }
  .totals-row { display: flex; justify-content: space-between; align-items: baseline; }
  .totals-label { font-weight: 700; font-size: 14px; color: var(--ink); }
  .totals-value { font-weight: 800; font-size: 19px; color: var(--brand-deep); font-variant-numeric: tabular-nums; }
  .totals-group { display: flex; justify-content: space-between; align-items: baseline; color: var(--ink-3); font-size: 13px; margin-top: 8px; }
  .totals-group-value { font-weight: 600; color: var(--ink-2); font-variant-numeric: tabular-nums; }

  /* --- A/B option sections: stacked, each with a labeled header band --- */
  .option-section { margin-bottom: 36px; }
  .option-section:last-of-type { margin-bottom: 0; }
  .option-head {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 21px; font-weight: 700; color: var(--ink);
    padding: 9px 16px; margin: 0 0 20px; border-radius: 10px;
    background: var(--brand-wash); border-inline-start: 4px solid var(--brand);
    break-inside: avoid; page-break-inside: avoid;
    break-after: avoid; page-break-after: avoid;
  }

  /* --- CLOSING: investment band + CTA, paired so the band never orphans ----
     .closing wraps the band and CTA together with break-inside:avoid; if it
     can't fit it moves to the next page as a unit — the no-prices budget band
     never strands or sits half-cut on its own. */
  .closing {
    margin-top: 40px; break-inside: avoid; page-break-inside: avoid;
  }
  .invest {
    padding: 24px 26px; border-radius: 16px; color: #fff;
    background:
      radial-gradient(120% 160% at 92% 0%, rgba(224,15,25,.6) 0%, rgba(224,15,25,0) 58%),
      linear-gradient(135deg, #1f1f22 0%, var(--ink) 62%, #050506 100%);
    break-inside: avoid; page-break-inside: avoid;
  }
  .invest-cap {
    font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
    color: rgba(255,255,255,.6); margin-bottom: 10px;
  }
  .invest-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
  .invest-label { font-weight: 600; font-size: 18px; color: #fff; }
  .invest-value { font-weight: 800; font-size: 34px; color: #fff; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
  .invest-group {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.16);
    color: rgba(255,255,255,.78); font-size: 13.5px;
  }
  .invest-group-value { font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }

  .cta {
    margin-top: 16px; padding: 22px 24px; border-radius: 16px; text-align: center;
    background: var(--paper); border: 1px solid var(--line);
    break-inside: avoid; page-break-inside: avoid;
  }
  .cta-line {
    font-family: 'Frank Ruhl Libre', 'Heebo', serif;
    font-size: 22px; font-weight: 700; color: var(--ink); margin-bottom: 8px;
  }
  .cta-contact { font-size: 13.5px; color: var(--ink-3); }
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
