// Word (.docx) proposal export — the editable sibling of server/pdf/generate.js.
//
// Why a hand-built document instead of feeding the PDF's HTML to Word: Word's
// HTML importer decides bidi on its own and routinely flips prices, times and
// punctuation in Hebrew text. Here every paragraph carries w:bidi and every run
// carries an explicit direction, so RTL is stated, never inferred.
//
// RTL RULES OBSERVED THROUGHOUT THIS FILE:
//   1. Every paragraph is `bidirectional: true` (w:bidi) — RTL base direction.
//   2. Every Hebrew run is `rightToLeft: true` (w:rtl).
//   3. Every run that is purely numeric/Latin — prices, times, phone numbers,
//      dates, "(×40)", the e-mail address — is emitted as its OWN run with
//      `rightToLeft: false`, which isolates it exactly like <bdi> does in the
//      HTML template. Without this, "₪120–₪150" and "09:00–10:30" render with
//      the two halves swapped.
//   4. Every table is `visuallyRightToLeft: true` (w:bidiVisual) so column one
//      is the RIGHTMOST column, matching the PDF's photo-then-text order.
//   5. Alignment uses START/END (not LEFT/RIGHT) so it follows the RTL flow.
//
// The schedule/price/total numbers come from the PDF template's own helpers, so
// the two exports can never disagree about money.
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { jpegViaChromium } from '../pdf/generate.js';
import {
  BRAND,
  fixedCost,
  formatDuration,
  formatPrice,
  formatRange,
  groupTotal,
  hasPricing,
  perPerson,
  priceRange,
  sortByStart,
  timingLabel,
  whenLabel,
} from '../pdf/template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same resolution as server/routes/uploads.js and the PDF generator: a stored
// "/uploads/<file>" maps to "<UPLOADS_DIR>/<basename>".
const UPLOAD_DIR = process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
const LOGO_PATH = join(__dirname, '..', 'assets', 'star-logo.jpeg');
const DEFAULT_HERO_PATH = join(__dirname, '..', 'assets', 'default-hero.jpg');

// --- palette (mirrors the PDF's CSS custom properties, minus the "#") -------
const RED = 'e00f19';
const RED_DEEP = 'b30c14';
const INK = '141414';
const INK_2 = '3d3d42';
const INK_3 = '6b6b72';
const INK_4 = '9a9aa2';
const LINE = 'e9e9ec';

// --- geometry ---------------------------------------------------------------
// A4 is 11906 twips wide. 1cm = 567 twips; 1 inch = 1440 twips = 96 px.
const MARGIN = 850; // ~1.5cm
const CONTENT = 11906 - MARGIN * 2; // usable width in twips
const twipsToPx = (t) => Math.round((t / 1440) * 96);

// Item row columns (RTL: first column renders rightmost) — photo | body | price.
const COL_PHOTO = 1900;
const COL_PRICE = 1700;
const COL_BODY = CONTENT - COL_PHOTO - COL_PRICE;
// Option cards: a thumbnail beside the option's text.
const OPT_COL_PHOTO = 1500;

// Content type by extension, so a file Jimp can't decode can still be handed to
// Chromium with the right MIME (mirrors the map in server/pdf/generate.js).
const MIME_BY_EXT = {
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

// Thumbnails are cover-cropped to a square, like the PDF's object-fit: cover.
const THUMB_PX = 260;
const HERO_MAX_H_PX = 300;

// --- run helpers ------------------------------------------------------------
// Hebrew/RTL run. Everything that is prose goes through here.
const he = (text, opts = {}) => new TextRun({ text, rightToLeft: true, font: 'Arial', ...opts });
// LTR-isolated run — the <bdi> equivalent. Use for prices, times, dates, phone
// numbers and any parenthesised number, so bidi reordering can't scramble them.
const ltr = (text, opts = {}) => new TextRun({ text, rightToLeft: false, font: 'Arial', ...opts });
// For free-text values that may be EITHER Hebrew or Latin/numeric — a date is
// "12.9.2026" but a month is "נובמבר", and both arrive through whenLabel().
// Picking the wrong direction reorders the text, so pick it from the content.
const auto = (text, opts = {}) =>
  (/[֐-׿]/.test(String(text)) ? he : ltr)(text, opts);

// Every paragraph in the document is built here so `bidirectional` is never
// forgotten.
const p = (children, opts = {}) =>
  new Paragraph({ bidirectional: true, alignment: AlignmentType.START, children, ...opts });

const spacer = (points) => p([], { spacing: { after: points * 20 } });

const noBorders = TableBorders.NONE;

// A borderless cell; `width` in twips.
const cell = (children, width, opts = {}) =>
  new TableCell({
    children: children.length ? children : [p([])],
    width: { size: width, type: WidthType.DXA },
    borders: noBorders,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    ...opts,
  });

// A full-width borderless layout table. `cantSplit` keeps a row whole across a
// page break, mirroring the PDF's break-inside: avoid on activity cards.
const layoutTable = (rows, columnWidths) =>
  new Table({
    rows,
    columnWidths,
    width: { size: CONTENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    borders: noBorders,
    visuallyRightToLeft: true,
  });

// --- images -----------------------------------------------------------------
// Load one photo as a JPEG buffer plus its pixel dimensions (docx needs both).
// `square` cover-crops to a THUMB_PX box the way the PDF's thumbnails do.
// A .docx can only carry jpg/png/gif/bmp/svg, so everything is normalised to
// JPEG here. When Jimp can't decode the file (notably WebP), Chromium is asked
// to do it — the same fallback the PDF export uses — and only if THAT fails too
// is the photo dropped, so one odd format never breaks the export.
async function loadImage(src, { square = false, maxWidthPx = 0 } = {}) {
  if (!src) return null;
  const file = join(UPLOAD_DIR, basename(src));
  try {
    const img = await Jimp.read(file);
    if (square) {
      img.cover({ w: THUMB_PX, h: THUMB_PX });
    } else if (maxWidthPx && img.width > maxWidthPx) {
      img.resize({ w: maxWidthPx });
    }
    const data = await img.getBuffer('image/jpeg', { quality: 80 });
    return { data, width: img.width, height: img.height };
  } catch (jimpErr) {
    try {
      const raw = await readFile(file);
      const mime = MIME_BY_EXT[extname(file).toLowerCase()] || 'image/jpeg';
      return await jpegViaChromium(raw, mime, {
        square: square ? THUMB_PX : 0,
        maxWidthPx,
      });
    } catch (err) {
      console.warn(`DOCX: dropping image "${src}" — ${jimpErr.message} / ${err.message}`);
      return null;
    }
  }
}

async function loadFile(path) {
  try {
    const data = await readFile(path);
    const img = await Jimp.read(path);
    return { data, width: img.width, height: img.height };
  } catch {
    return null;
  }
}

// Build the map of every photo the document needs, keyed by stored path, in one
// pass so each file is read and re-encoded exactly once.
async function buildImageMap(event) {
  const map = new Map();
  const wanted = [];
  const want = (src, opts) => {
    if (src && !map.has(src)) {
      map.set(src, null);
      wanted.push([src, opts]);
    }
  };
  if (event.cover_photo) want(event.cover_photo, { maxWidthPx: twipsToPx(CONTENT) });
  for (const it of event.items || []) {
    for (const src of it.photos || []) want(src, { square: true });
    for (const o of it.options || []) {
      for (const src of o.photos || []) want(src, { square: true });
    }
  }
  await Promise.all(
    wanted.map(async ([src, opts]) => {
      map.set(src, await loadImage(src, opts));
    }),
  );
  return map;
}

// The hero: explicit cover photo, else the first usable activity/option photo
// in schedule order, else the bundled default hero. Mirrors the PDF's pickHero
// plus generate.js's default-hero fallback.
async function pickHero(event, images) {
  if (event.cover_photo && images.get(event.cover_photo)) {
    return images.get(event.cover_photo);
  }
  for (const it of sortByStart(event.items || [])) {
    const own = it.photos?.[0] && images.get(it.photos[0]);
    if (own) return own;
    for (const o of it.options || []) {
      const op = o.photos?.[0] && images.get(o.photos[0]);
      if (op) return op;
    }
  }
  return loadFile(DEFAULT_HERO_PATH);
}

// Fit an image into the content width, capped in height, preserving aspect.
function heroRun(hero) {
  const maxW = twipsToPx(CONTENT);
  const scale = Math.min(maxW / hero.width, HERO_MAX_H_PX / hero.height, 1);
  return new ImageRun({
    data: hero.data,
    type: 'jpg',
    transformation: {
      width: Math.round(hero.width * scale),
      height: Math.round(hero.height * scale),
    },
  });
}

function thumbRun(image, widthTwips) {
  const w = twipsToPx(widthTwips) - 8;
  const h = Math.round((image.height / image.width) * w);
  return new ImageRun({ data: image.data, type: 'jpg', transformation: { width: w, height: h } });
}

// --- blocks -----------------------------------------------------------------

// Cover: quiet wordmark, hero photo, optional "אופציה X" badge, tagline eyebrow,
// title, brand rule, then the labelled metadata strip.
function coverBlocks(event, { hero, logo, option }) {
  const out = [];

  const brandRuns = [];
  if (logo) {
    brandRuns.push(
      new ImageRun({
        data: logo.data,
        type: 'jpg',
        transformation: { width: 26, height: Math.round((logo.height / logo.width) * 26) },
      }),
      he('  '),
    );
  }
  brandRuns.push(he(BRAND.name, { bold: true, size: 18, color: INK_3 }));
  out.push(p(brandRuns, { spacing: { after: 140 } }));

  if (hero) {
    out.push(p([heroRun(hero)], { spacing: { after: 200 } }));
  }

  if (option) {
    out.push(
      p([he(`אופציה ${option}`, { bold: true, size: 20, color: RED })], {
        spacing: { after: 60 },
      }),
    );
  }

  out.push(
    p([he(BRAND.tagline, { size: 17, color: INK_4, characterSpacing: 30 })], {
      spacing: { after: 60 },
    }),
  );
  out.push(
    p([he(event.title || 'הצעה', { bold: true, size: 46, color: INK })], {
      spacing: { after: 100 },
      // A red rule under the title, matching the PDF's .hero-rule.
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 6 } },
      keepNext: true,
    }),
  );

  // Metadata strip: label above value, one cell per populated field, laid out
  // right-to-left so "לקוח" sits on the right like the PDF.
  const cells = [
    ['לקוח', event.client_name ? he(String(event.client_name), { size: 19, color: INK_2, bold: true }) : null],
    ['משתתפים', event.group_size ? ltr(String(event.group_size), { size: 19, color: INK_2, bold: true }) : null],
    ['מועד', whenLabel(event) ? auto(whenLabel(event), { size: 19, color: INK_2, bold: true }) : null],
    ['מיקום', event.location ? he(String(event.location), { size: 19, color: INK_2, bold: true }) : null],
  ].filter(([, v]) => v);

  if (cells.length) {
    const width = Math.floor(CONTENT / cells.length);
    out.push(
      layoutTable(
        [
          new TableRow({
            cantSplit: true,
            children: cells.map(([label, valueRun]) =>
              cell(
                [
                  p([he(label, { size: 15, color: INK_4, characterSpacing: 20 })], {
                    spacing: { after: 20 },
                  }),
                  p([valueRun]),
                ],
                width,
              ),
            ),
          }),
        ],
        cells.map(() => width),
      ),
    );
  }
  return out;
}

// A section heading with the brand underline ("הלו״ז ליום", "אופציה א"…).
const sectionHeading = (text, { size = 30 } = {}) =>
  p([he(text, { bold: true, size, color: INK })], {
    spacing: { before: 320, after: 140 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 4 } },
    keepNext: true,
  });

// The price cell for one activity: the per-head price (or the option range),
// then any flat extra itemised beneath it with what it covers — same content
// and same wording as the PDF.
function priceParagraphs(it) {
  const out = [];
  const hasOptions = it.options?.length > 0;
  if (hasOptions) {
    const { low, high } = priceRange(it);
    const text = formatRange(low, high);
    if (text) out.push(p([ltr(text, { bold: true, size: 24, color: RED_DEEP })], { alignment: AlignmentType.END }));
  } else if (formatPrice(it.price)) {
    const runs = [ltr(formatPrice(it.price), { bold: true, size: 24, color: RED_DEEP })];
    // A flat total-priced item (e.g. venue rental) is tagged סה״כ so it isn't
    // mistaken for a per-head figure.
    if (it.price_type === 'total') runs.push(he(' סה״כ', { size: 15, color: INK_4 }));
    out.push(p(runs, { alignment: AlignmentType.END }));
  }
  const fc = fixedCost(it);
  if (fc > 0) {
    const what = String(it.fixed_cost_note || '').trim();
    out.push(
      p(
        [
          ltr(`+ ${formatPrice(fc)}`, { bold: true, size: 18, color: INK_2 }),
          he(` ${what ? `סה״כ · ${what}` : 'סה״כ'}`, { size: 15, color: INK_4 }),
        ],
        { alignment: AlignmentType.END, spacing: { before: 40 } },
      ),
    );
  }
  return out;
}

// "איש קשר: <name> · <phone>" — the phone is its own LTR run so the digits and
// dashes never reorder inside the RTL line.
function contactParagraph(name, phone, { size = 16 } = {}) {
  if (!name && !phone) return null;
  const runs = [he('איש קשר: ', { size, color: INK_3, bold: true })];
  if (name) runs.push(he(String(name), { size, color: INK_4 }));
  if (name && phone) runs.push(he(' · ', { size, color: INK_4 }));
  if (phone) runs.push(ltr(String(phone), { size, color: INK_4 }));
  return p(runs, { spacing: { before: 40 } });
}

// One activity: photo | body | price, as a single non-splitting table row,
// followed by its choice-block options (if any).
function itemBlocks(it, { showPrices, images }) {
  const blocks = [];
  const hasOptions = it.options?.length > 0;
  const photo = !hasOptions && it.photos?.[0] ? images.get(it.photos[0]) : null;

  const body = [];
  body.push(p([he(String(it.title || ''), { bold: true, size: 26, color: INK })]));

  // Time & duration — the time itself is LTR-isolated ("09:00–10:30").
  const tl = timingLabel(it) || '—';
  const dur = formatDuration(it.approx_duration_hours);
  const timeRuns = [ltr(tl, { bold: true, size: 20, color: RED })];
  if (dur) timeRuns.push(he(`  ·  ${dur}`, { size: 19, color: INK_3 }));
  body.push(p(timeRuns, { spacing: { before: 60 } }));

  if (it.description) {
    body.push(p([he(String(it.description), { size: 21, color: INK_2 })], { spacing: { before: 80 } }));
  }
  const contact = contactParagraph(it.contact_name, it.contact_phone);
  if (contact) body.push(contact);

  const priceCells = showPrices ? priceParagraphs(it) : [];

  blocks.push(
    layoutTable(
      [
        new TableRow({
          cantSplit: true,
          children: [
            cell(photo ? [p([thumbRun(photo, COL_PHOTO)])] : [], COL_PHOTO),
            cell(body, COL_BODY),
            cell(priceCells, COL_PRICE),
          ],
        }),
      ],
      [COL_PHOTO, COL_BODY, COL_PRICE],
    ),
  );

  if (hasOptions) {
    blocks.push(
      p([he('בחירה בין:', { size: 17, color: INK_4, bold: true })], {
        spacing: { before: 140, after: 60 },
        indent: { start: 400 },
        keepNext: true,
      }),
    );
    for (const o of it.options) {
      blocks.push(...optionBlocks(o, { showPrices, images }));
    }
  }

  blocks.push(spacer(9));
  return blocks;
}

// One choice option, as a bordered card: thumbnail | title + price + text.
function optionBlocks(o, { showPrices, images }) {
  const photo = o.photos?.[0] ? images.get(o.photos[0]) : null;
  const body = [];
  const head = [he(String(o.title || ''), { bold: true, size: 22, color: INK })];
  body.push(p(head));
  if (showPrices && formatPrice(o.price)) {
    body.push(p([ltr(formatPrice(o.price), { bold: true, size: 20, color: RED_DEEP })], { spacing: { before: 40 } }));
  }
  if (o.description) {
    body.push(p([he(String(o.description), { size: 19, color: INK_2 })], { spacing: { before: 40 } }));
  }
  const contact = contactParagraph(o.contact_name, o.contact_phone, { size: 15 });
  if (contact) body.push(contact);

  const hairline = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const bordered = {
    borders: { top: hairline, bottom: hairline, left: hairline, right: hairline },
  };
  const width = CONTENT - 400;
  const photoW = OPT_COL_PHOTO;

  return [
    new Table({
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(photo ? [p([thumbRun(photo, photoW)])] : [], photoW, bordered),
            cell(body, width - photoW, bordered),
          ],
        }),
      ],
      columnWidths: [photoW, width - photoW],
      width: { size: width, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      indent: { size: 400, type: WidthType.DXA },
      visuallyRightToLeft: true,
    }),
    spacer(5),
  ];
}

// A two-column money row: label on the right, value on the left (RTL flow).
// `label` is either a string or a ready-made array of runs — the group row needs
// the latter, because "(×27)" must be its own LTR run inside a Hebrew label.
function moneyRow(label, valueText, { labelSize, valueSize, valueColor, before = 0, topBorder = null }) {
  const border = topBorder
    ? { top: { style: BorderStyle.SINGLE, size: topBorder.size, color: topBorder.color, space: 4 } }
    : undefined;
  const labelRuns = Array.isArray(label)
    ? label
    : [he(label, { bold: true, size: labelSize, color: INK })];
  return layoutTable(
    [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [p(labelRuns, { spacing: { before } })],
            Math.floor(CONTENT / 2),
            border ? { borders: { ...noBorders, ...border } } : {},
          ),
          cell(
            [
              p([ltr(valueText, { bold: true, size: valueSize, color: valueColor })], {
                alignment: AlignmentType.END,
                spacing: { before },
              }),
            ],
            CONTENT - Math.floor(CONTENT / 2),
            border ? { borders: { ...noBorders, ...border } } : {},
          ),
        ],
      }),
    ],
    [Math.floor(CONTENT / 2), CONTENT - Math.floor(CONTENT / 2)],
  );
}

// Per-person + group totals for a set of items.
function totalsBlocks(items, groupSize, label, { strong = false } = {}) {
  const pp = perPerson(items, groupSize);
  const g = groupTotal(items, groupSize);
  const out = [
    moneyRow(label, formatRange(pp.low, pp.high), {
      labelSize: strong ? 26 : 22,
      valueSize: strong ? 32 : 24,
      valueColor: RED_DEEP,
      before: 60,
      topBorder: { size: strong ? 24 : 8, color: strong ? RED : LINE },
    }),
  ];
  if (groupSize > 0) {
    out.push(
      moneyRow(
        [
          he('סה״כ לקבוצה ', { bold: true, size: 18, color: INK }),
          // The multiplier is LTR-isolated so the parentheses don't mirror and
          // the digits don't jump to the wrong side of the "×".
          ltr(`(×${groupSize})`, { bold: true, size: 18, color: INK }),
        ],
        formatRange(g.low, g.high),
        { labelSize: 18, valueSize: 18, valueColor: INK, before: 40 },
      ),
    );
  }
  out.push(spacer(6));
  return out;
}

// One schedule section: its items, then its own totals band when prices are on.
function scheduleBlocks(rawItems, { showPrices, images, groupSize, totalsLabel = 'מחיר לאדם' }) {
  const items = sortByStart(rawItems);
  const out = items.flatMap((it) => itemBlocks(it, { showPrices, images }));
  if (showPrices && hasPricing(items)) {
    out.push(...totalsBlocks(items, groupSize, totalsLabel));
  }
  return out;
}

// Client-facing notes. The planner's own line breaks become real paragraphs
// (the HTML relies on white-space: pre-line for the same effect).
function notesBlocks(event) {
  const text = String(event.client_notes || '').trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  return [
    p([he('הערות', { bold: true, size: 17, color: RED, characterSpacing: 28 })], {
      spacing: { before: 300, after: 60 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 8 } },
      keepNext: true,
    }),
    ...lines.map((line) =>
      p([he(line, { size: 20, color: INK_2 })], { spacing: { after: 40 } }),
    ),
  ];
}

// Closing: the investment/budget band (when applicable) + the warm CTA line.
function closingBlocks(event, { showPrices, showBudget, optionsMode, groupSize }) {
  const out = [];
  const items = event.items || [];

  if (showPrices) {
    // In options mode each section already showed its own total.
    if (!optionsMode && hasPricing(items)) {
      out.push(...totalsBlocks(items, groupSize, 'מחיר לאדם', { strong: true }));
    }
  } else {
    const budgetNum = Number(event.budget);
    if (showBudget && Number.isFinite(budgetNum) && budgetNum > 0) {
      out.push(
        moneyRow('תקציב לאדם', `₪${budgetNum.toLocaleString('he-IL')}`, {
          labelSize: 26,
          valueSize: 32,
          valueColor: RED_DEEP,
          before: 60,
          topBorder: { size: 24, color: RED },
        }),
      );
      out.push(spacer(6));
    }
  }

  out.push(
    p([he('נשמח לעמוד לרשותכם ולצאת יחד לדרך', { bold: true, size: 24, color: INK })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 60 },
      keepNext: true,
    }),
  );
  out.push(
    p(
      [
        he(`${BRAND.name}  ·  `, { bold: true, size: 18, color: INK_3 }),
        ltr(BRAND.contact, { size: 18, color: INK_3 }),
      ],
      { alignment: AlignmentType.CENTER },
    ),
  );
  return out;
}

// --- document ---------------------------------------------------------------

export async function generateProposalDocx(
  event,
  { prices = false, budget = true, option = null } = {},
) {
  const showPrices = Boolean(prices);
  const showBudget = budget !== false;
  const optionsMode = event.options_mode === true;
  const groupSize = event.group_size > 0 ? event.group_size : 0;
  const allItems = event.items || [];

  const images = await buildImageMap(event);
  const [hero, logo] = await Promise.all([pickHero(event, images), loadFile(LOGO_PATH)]);

  const children = [...coverBlocks(event, { hero, logo, option })];

  if (optionsMode) {
    children.push(sectionHeading('הלו״ז ליום'));
    children.push(sectionHeading('אופציה א', { size: 26 }));
    children.push(
      ...scheduleBlocks(allItems.filter((it) => it.option !== 'B'), {
        showPrices,
        images,
        groupSize,
        totalsLabel: 'מחיר לאדם · אופציה א',
      }),
    );
    children.push(sectionHeading('אופציה ב', { size: 26 }));
    children.push(
      ...scheduleBlocks(allItems.filter((it) => it.option === 'B'), {
        showPrices,
        images,
        groupSize,
        totalsLabel: 'מחיר לאדם · אופציה ב',
      }),
    );
  } else {
    children.push(sectionHeading('הלו״ז ליום'));
    children.push(...scheduleBlocks(allItems, { showPrices, images, groupSize }));
  }

  children.push(...notesBlocks(event));
  children.push(...closingBlocks(event, { showPrices, showBudget, optionsMode, groupSize }));

  const footer = new Footer({
    children: [
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        children: [
          he(`${BRAND.name} · ${BRAND.tagline}   ·   עמוד `, { size: 15, color: INK_4 }),
          new TextRun({ children: [PageNumber.CURRENT], rightToLeft: false, size: 15, color: INK_4, font: 'Arial' }),
          he(' מתוך ', { size: 15, color: INK_4 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], rightToLeft: false, size: 15, color: INK_4, font: 'Arial' }),
        ],
      }),
    ],
  });

  const doc = new Document({
    // Hebrew as the document language keeps Word's spell-check and default
    // paragraph direction aligned with the content.
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 21, color: INK_2, rightToLeft: true },
          paragraph: { bidirectional: true, spacing: { line: 288 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 portrait, in twips
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
