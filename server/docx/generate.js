// Word (.docx) proposal export — the editable sibling of server/pdf/generate.js.
//
// Why a hand-built document instead of feeding the PDF's HTML to Word: Word's
// HTML importer decides bidi on its own and routinely flips prices, times and
// punctuation in Hebrew text. Here every paragraph carries w:bidi and every run
// carries an explicit direction, so RTL is stated, never inferred.
//
// RTL RULES OBSERVED THROUGHOUT THIS FILE:
//   1. Every Hebrew paragraph is `bidirectional: true` (w:bidi) and carries NO
//      explicit alignment. In a bidi paragraph w:jc is LOGICAL, not visual:
//      "right" means "end", which puts the text on the visual LEFT. The default
//      (start) is the right edge, and omitting w:jc is what Word itself writes
//      for a Hebrew document. Do not "fix" a left-hugging paragraph by adding
//      w:jc right — that is what caused it.
//   2. Every Hebrew run is `rightToLeft: true` (w:rtl).
//   3. Every purely numeric/Latin fragment — prices, times, phone numbers,
//      dates, "(×40)", the e-mail address — is emitted as its OWN run, wrapped
//      in LRE…PDF so it is genuinely isolated, exactly like <bdi> in the HTML
//      template. `rightToLeft: false` alone does NOT do this: it marks letters
//      LTR but leaves digits and neutrals to resolve against the paragraph, so
//      "₪120–₪150" comes out as "120₪–150₪". This applies to free text too (see
//      `richHe`): a planner writing "7:30-10:30" in a description would
//      otherwise read it back as "10:30-7:30".
//   4. Money VALUES sit in LTR paragraphs pinned to the left edge, so the
//      figure lands on the opposite side from its Hebrew label under every
//      renderer's reading of the alignment attributes.
//   5. Every table is `visuallyRightToLeft: true` (w:bidiVisual) so column one
//      is the RIGHTMOST column, matching the PDF's photo-then-text order.
//
// The schedule/price/total numbers come from the PDF template's own helpers, so
// the two formats can never disagree about money.
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
const COL_PHOTO = 2050;
const COL_PRICE = 1750;
const COL_BODY = CONTENT - COL_PHOTO - COL_PRICE;
// Option cards: a thumbnail beside the option's text.
const OPT_INDENT = 400;
const OPT_COL_PHOTO = 1600;

// Content type by extension, so a file Jimp can't decode can still be handed to
// Chromium with the right MIME (mirrors the map in server/pdf/generate.js).
const MIME_BY_EXT = {
  '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

// Thumbnails are cover-cropped to a square, like the PDF's object-fit: cover.
const THUMB_PX = 280;
// The hero is a full-bleed BAND: it always spans the content width and is
// cover-cropped to this height, rather than being scaled down to fit a height
// cap (which left portrait-ish photos occupying a third of the page).
const HERO_W_PX = twipsToPx(CONTENT);
const HERO_H_PX = 250;
const LOGO_W_PX = 44;

// --- type scale (half-points: 24 = 12pt) ------------------------------------
// Deliberately larger than the PDF's: the PDF is a dense fixed A4 layout read
// at full-page zoom, while this is a document people read and edit at 100%.
const SZ = {
  wordmark: 22,
  eyebrow: 20,
  title: 52,
  optionBadge: 24,
  metaLabel: 17,
  metaValue: 24,
  heading: 34,
  optionHeading: 30,
  itemTitle: 30,
  time: 24,
  desc: 24,
  contact: 20,
  choiceLabel: 20,
  optTitle: 26,
  optDesc: 22,
  price: 28,
  priceTag: 18,
  fixed: 22,
  fixedTag: 17,
  notesLabel: 19,
  notes: 23,
  totalsLabel: 26,
  totalsValue: 30,
  investLabel: 30,
  investValue: 40,
  groupRow: 21,
  cta: 28,
  ctaContact: 20,
  footer: 17,
};

// --- run helpers ------------------------------------------------------------
// Bidi controls.
//
// LRE…POP wraps an LTR fragment as an independent embedding — the <bdi>
// equivalent. `rightToLeft: false` alone would not do it: it marks the run's
// LETTERS as LTR but leaves digits and neutrals — "₪" is a currency terminator
// with no strong direction — to resolve against the paragraph.
//
// RLM is a zero-width strong RTL character. Every Hebrew run opens with one so
// that leading neutrals (" · ", "+ ") anchor to RTL instead of joining whatever
// preceded them. Without it, "10:30–14:30" followed by "   ·   4 שעות" rendered
// with the "4" torn off its Hebrew word and pulled next to the time: the
// neutrals between them resolved LTR, so the bare digit joined the time's chunk.
//
// Embedding the Hebrew runs too (RLE…POP) is NOT the answer — it reorders the
// runs themselves, putting the time on the wrong side of its own line.
const LRE = '‪'; // U+202A start an LTR embedding
const POP = '‬'; // U+202C end the embedding
const RLM = '‏'; // U+200F zero-width strong RTL

// Hebrew/RTL run. Everything that is prose goes through here.
const he = (text, opts = {}) =>
  new TextRun({ text: `${RLM}${text}`, rightToLeft: true, font: 'Arial', ...opts });

// LTR run — the <bdi> equivalent. Use for prices, times, dates, phone numbers
// and any parenthesised number.
const ltr = (text, opts = {}) =>
  new TextRun({ text: `${LRE}${text}${POP}`, rightToLeft: false, font: 'Arial', ...opts });

// Latin/numeric fragments inside otherwise-Hebrew free text: a token starts on a
// letter or digit and may carry internal separators, so "7:30-10:30", "3.8.2026"
// and "Royal Beach" each stay one unit. Trailing separators are handed back to
// the Hebrew side so a sentence-final "." isn't dragged into the LTR run.
const LTR_TOKEN = /[0-9A-Za-z][0-9A-Za-z:.,\-–+/'’&%]*/g;

// Split free text into runs, LTR-isolating every Latin/numeric fragment. This is
// what keeps a planner's own "7:30-10:30" from rendering as "10:30-7:30".
function richHe(text, opts = {}) {
  const s = String(text ?? '');
  if (!s) return [he('', opts)];
  const runs = [];
  let last = 0;
  let m;
  LTR_TOKEN.lastIndex = 0;
  while ((m = LTR_TOKEN.exec(s)) !== null) {
    const token = m[0].replace(/[.,:\-–+/'’&%]+$/, '');
    if (!token) {
      LTR_TOKEN.lastIndex = m.index + m[0].length;
      continue;
    }
    if (m.index > last) runs.push(he(s.slice(last, m.index), opts));
    runs.push(ltr(token, opts));
    last = m.index + token.length;
    LTR_TOKEN.lastIndex = last;
  }
  if (last < s.length) runs.push(he(s.slice(last), opts));
  return runs.length ? runs : [he(s, opts)];
}

// Hebrew paragraph: RTL base direction, no explicit alignment. See rule 1 — in
// a bidi paragraph w:jc is LOGICAL, so "right" means "end", which lands the text
// on the visual LEFT. Omitting it leaves the default (start = the right edge in
// RTL), which is exactly what Word itself writes for a Hebrew document.
const p = (children, opts = {}) =>
  new Paragraph({ bidirectional: true, children, ...opts });

// LTR paragraph pinned to the left edge — used for money values, which must land
// on the opposite side of the row from their Hebrew label. Here the paragraph is
// NOT bidi, so w:jc "left" means the visual left under both the logical and the
// absolute reading of the attribute.
const pLtr = (children, opts = {}) =>
  new Paragraph({ bidirectional: false, alignment: AlignmentType.LEFT, children, ...opts });

const spacer = (points) => p([], { spacing: { after: points * 20 } });

// Free text the planner typed: blank lines are dropped and each remaining line
// becomes its own paragraph, so pasted multi-line descriptions read as a list
// instead of one run-on block with stray gaps.
function textParagraphs(text, runOpts = {}, paraOpts = {}) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => p(richHe(line, runOpts), paraOpts));
}

const noBorders = TableBorders.NONE;

// A borderless cell; `width` in twips.
const cell = (children, width, opts = {}) =>
  new TableCell({
    children: children.length ? children : [p([])],
    width: { size: width, type: WidthType.DXA },
    borders: noBorders,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
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
// `square` cover-crops to a THUMB_PX box the way the PDF's thumbnails do, and
// `cover` cover-crops to an explicit {w,h} band (the hero).
// A .docx can only carry jpg/png/gif/bmp/svg, so everything is normalised to
// JPEG here. When Jimp can't decode the file (notably WebP), Chromium is asked
// to do it — the same fallback the PDF export uses — and only if THAT fails too
// is the photo dropped, so one odd format never breaks the export.
async function loadImage(src, { square = false, cover = null, maxWidthPx = 0 } = {}) {
  if (!src) return null;
  const file = src.startsWith('/') && !src.startsWith('/uploads')
    ? src
    : join(UPLOAD_DIR, basename(src));
  try {
    const img = await Jimp.read(file);
    if (cover) {
      img.cover({ w: cover.w, h: cover.h });
    } else if (square) {
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
        cover,
        maxWidthPx,
      });
    } catch (err) {
      console.warn(`DOCX: dropping image "${src}" — ${jimpErr.message} / ${err.message}`);
      return null;
    }
  }
}

// Build the map of every activity/option thumbnail, keyed by stored path, in one
// pass so each file is read and re-encoded exactly once.
async function buildImageMap(event) {
  const map = new Map();
  const wanted = [];
  const want = (src) => {
    if (src && !map.has(src)) {
      map.set(src, null);
      wanted.push(src);
    }
  };
  for (const it of event.items || []) {
    for (const src of it.photos || []) want(src);
    for (const o of it.options || []) {
      for (const src of o.photos || []) want(src);
    }
  }
  await Promise.all(
    wanted.map(async (src) => {
      map.set(src, await loadImage(src, { square: true }));
    }),
  );
  return map;
}

// The hero, loaded at BAND geometry from its original file (not from the square
// thumbnail map): explicit cover photo, else the first activity/option photo in
// schedule order, else the bundled default hero. Mirrors the PDF's pickHero plus
// generate.js's default-hero fallback.
async function loadHero(event) {
  const candidates = [];
  if (event.cover_photo) candidates.push(event.cover_photo);
  for (const it of sortByStart(event.items || [])) {
    if (it.photos?.[0]) candidates.push(it.photos[0]);
    for (const o of it.options || []) {
      if (o.photos?.[0]) candidates.push(o.photos[0]);
    }
  }
  candidates.push(DEFAULT_HERO_PATH);
  for (const src of candidates) {
    const img = await loadImage(src, { cover: { w: HERO_W_PX * 2, h: HERO_H_PX * 2 } });
    if (img) return img;
  }
  return null;
}

const heroRun = (hero) =>
  new ImageRun({
    data: hero.data,
    type: 'jpg',
    transformation: { width: HERO_W_PX, height: HERO_H_PX },
  });

function thumbRun(image, widthTwips) {
  const w = twipsToPx(widthTwips) - 10;
  const h = Math.round((image.height / image.width) * w);
  return new ImageRun({ data: image.data, type: 'jpg', transformation: { width: w, height: h } });
}

// --- blocks -----------------------------------------------------------------

// Cover: the wordmark lockup, a full-width hero band, an optional "אופציה X"
// badge, the tagline eyebrow, the title under a red rule, then the metadata
// strip. Everything is right-aligned so the whole opener reads as one RTL block.
function coverBlocks(event, { hero, logo, option }) {
  const out = [];

  const brandRuns = [];
  if (logo) {
    brandRuns.push(
      new ImageRun({
        data: logo.data,
        type: 'jpg',
        transformation: {
          width: LOGO_W_PX,
          height: Math.round((logo.height / logo.width) * LOGO_W_PX),
        },
      }),
      he('   '),
    );
  }
  brandRuns.push(he(BRAND.name, { bold: true, size: SZ.wordmark, color: INK }));
  out.push(p(brandRuns, { spacing: { after: 160 } }));

  if (hero) out.push(p([heroRun(hero)], { spacing: { after: 240 } }));

  if (option) {
    out.push(
      p([he(`אופציה ${option}`, { bold: true, size: SZ.optionBadge, color: RED })], {
        spacing: { after: 80 },
      }),
    );
  }

  out.push(
    p([he(BRAND.tagline, { size: SZ.eyebrow, color: INK_4, characterSpacing: 40 })], {
      spacing: { after: 80 },
      keepNext: true,
    }),
  );
  out.push(
    p([he(event.title || 'הצעה', { bold: true, size: SZ.title, color: INK })], {
      spacing: { after: 140 },
      // A red rule under the title, matching the PDF's .hero-rule.
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 8 } },
      keepNext: true,
    }),
  );

  // Metadata strip: label above value, one cell per populated field, laid out
  // right-to-left so "לקוח" sits on the right like the PDF.
  const metaCells = [
    ['לקוח', event.client_name],
    ['משתתפים', event.group_size || ''],
    ['מועד', whenLabel(event)],
    ['מיקום', event.location],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined);

  if (metaCells.length) {
    const width = Math.floor(CONTENT / metaCells.length);
    out.push(
      layoutTable(
        [
          new TableRow({
            cantSplit: true,
            children: metaCells.map(([label, value]) =>
              cell(
                [
                  p([he(label, { size: SZ.metaLabel, color: INK_4, characterSpacing: 30 })], {
                    spacing: { after: 40 },
                  }),
                  // richHe picks the direction per fragment, so a numeric date
                  // ("3.8.2026") and a Hebrew month ("נובמבר") both come out right.
                  p(richHe(value, { size: SZ.metaValue, color: INK, bold: true })),
                ],
                width,
              ),
            ),
          }),
        ],
        metaCells.map(() => width),
      ),
    );
  }
  return out;
}

// A section heading with the brand underline ("הלו״ז ליום", "אופציה א"…).
const sectionHeading = (text, { size = SZ.heading } = {}) =>
  p([he(text, { bold: true, size, color: INK })], {
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 6 } },
    keepNext: true,
  });

// The price cell for one activity: the per-head price (or the option range),
// then any flat extra itemised beneath it with what it covers — same content
// and same wording as the PDF. These live in their own column and can carry a
// Hebrew tag ("סה״כ · הסעה"), so they stay RTL paragraphs; only the big totals
// figures below are LTR-pinned, where the figure must sit opposite its label.
function priceParagraphs(it) {
  const out = [];
  const hasOptions = it.options?.length > 0;
  if (hasOptions) {
    const { low, high } = priceRange(it);
    const text = formatRange(low, high);
    if (text) out.push(p([ltr(text, { bold: true, size: SZ.price, color: RED_DEEP })]));
  } else if (formatPrice(it.price)) {
    const runs = [ltr(formatPrice(it.price), { bold: true, size: SZ.price, color: RED_DEEP })];
    // A flat total-priced item (e.g. venue rental) is tagged סה״כ so it isn't
    // mistaken for a per-head figure.
    if (it.price_type === 'total') runs.push(he(' סה״כ', { size: SZ.priceTag, color: INK_4 }));
    out.push(p(runs));
  }
  const fc = fixedCost(it);
  if (fc > 0) {
    out.push(
      p(
        [
          ltr(`+ ${formatPrice(fc)}`, { bold: true, size: SZ.fixed, color: INK_2 }),
          he(` ${String(it.fixed_cost_note || '').trim() ? `סה״כ · ${String(it.fixed_cost_note).trim()}` : 'סה״כ'}`, {
            size: SZ.fixedTag,
            color: INK_4,
          }),
        ],
        { spacing: { before: 60 } },
      ),
    );
  }
  return out;
}

// "איש קשר: <name> · <phone>" — the phone is its own LTR run so the digits and
// dashes never reorder inside the RTL line.
function contactParagraph(name, phone, { size = SZ.contact } = {}) {
  if (!name && !phone) return null;
  const runs = [he('איש קשר: ', { size, color: INK_3, bold: true })];
  if (name) runs.push(...richHe(String(name), { size, color: INK_4 }));
  if (name && phone) runs.push(he(' · ', { size, color: INK_4 }));
  if (phone) runs.push(ltr(String(phone), { size, color: INK_4 }));
  return p(runs, { spacing: { before: 60 } });
}

// One activity: photo | body | price, as a single non-splitting table row,
// followed by its choice-block options (if any).
function itemBlocks(it, { showPrices, images }) {
  const blocks = [];
  const hasOptions = it.options?.length > 0;
  const photo = !hasOptions && it.photos?.[0] ? images.get(it.photos[0]) : null;

  const body = [
    p(richHe(it.title, { bold: true, size: SZ.itemTitle, color: INK })),
  ];

  // Time & duration — the time itself is LTR-isolated ("09:00–10:30").
  const dur = formatDuration(it.approx_duration_hours);
  const timeRuns = [ltr(timingLabel(it) || '—', { bold: true, size: SZ.time, color: RED })];
  if (dur) timeRuns.push(he(`   ·   ${dur}`, { size: SZ.time, color: INK_3 }));
  body.push(p(timeRuns, { spacing: { before: 80 } }));

  if (it.description) {
    body.push(
      ...textParagraphs(
        it.description,
        { size: SZ.desc, color: INK_2 },
        { spacing: { before: 80, after: 40 } },
      ),
    );
  }
  const contact = contactParagraph(it.contact_name, it.contact_phone);
  if (contact) body.push(contact);

  blocks.push(
    layoutTable(
      [
        new TableRow({
          cantSplit: true,
          children: [
            cell(photo ? [p([thumbRun(photo, COL_PHOTO)])] : [], COL_PHOTO),
            cell(body, COL_BODY),
            cell(showPrices ? priceParagraphs(it) : [], COL_PRICE),
          ],
        }),
      ],
      [COL_PHOTO, COL_BODY, COL_PRICE],
    ),
  );

  if (hasOptions) {
    blocks.push(
      p([he('בחירה בין:', { size: SZ.choiceLabel, color: INK_4, bold: true })], {
        spacing: { before: 160, after: 80 },
        indent: { end: OPT_INDENT },
        keepNext: true,
      }),
    );
    for (const o of it.options) blocks.push(...optionBlocks(o, { showPrices, images }));
  }

  blocks.push(spacer(10));
  return blocks;
}

// One choice option, as a bordered card: thumbnail | title + price + text.
function optionBlocks(o, { showPrices, images }) {
  const photo = o.photos?.[0] ? images.get(o.photos[0]) : null;
  const body = [p(richHe(o.title, { bold: true, size: SZ.optTitle, color: INK }))];
  if (showPrices && formatPrice(o.price)) {
    body.push(
      p([ltr(formatPrice(o.price), { bold: true, size: SZ.optTitle, color: RED_DEEP })], {
        spacing: { before: 60 },
      }),
    );
  }
  if (o.description) {
    body.push(
      ...textParagraphs(o.description, { size: SZ.optDesc, color: INK_2 }, { spacing: { before: 60 } }),
    );
  }
  const contact = contactParagraph(o.contact_name, o.contact_phone, { size: SZ.contact });
  if (contact) body.push(contact);

  const hairline = { style: BorderStyle.SINGLE, size: 4, color: LINE };
  const bordered = { borders: { top: hairline, bottom: hairline, left: hairline, right: hairline } };
  const width = CONTENT - OPT_INDENT;

  return [
    new Table({
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(photo ? [p([thumbRun(photo, OPT_COL_PHOTO)])] : [], OPT_COL_PHOTO, bordered),
            cell(body, width - OPT_COL_PHOTO, bordered),
          ],
        }),
      ],
      columnWidths: [OPT_COL_PHOTO, width - OPT_COL_PHOTO],
      width: { size: width, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      indent: { size: OPT_INDENT, type: WidthType.DXA },
      visuallyRightToLeft: true,
    }),
    spacer(6),
  ];
}

// A two-column money row: Hebrew label pinned right, figure pinned left.
// `label` is either a string or a ready-made array of runs — the group row needs
// the latter, because "(×27)" must be its own LTR run inside a Hebrew label.
function moneyRow(label, valueText, { labelSize, valueSize, valueColor, before = 0, topBorder = null, keepNext = false }) {
  const half = Math.floor(CONTENT / 2);
  const labelRuns = Array.isArray(label)
    ? label
    : [he(label, { bold: true, size: labelSize, color: INK })];
  const borders = topBorder
    ? {
        borders: {
          ...noBorders,
          top: { style: BorderStyle.SINGLE, size: topBorder.size, color: topBorder.color, space: 4 },
        },
      }
    : {};
  return layoutTable(
    [
      new TableRow({
        cantSplit: true,
        children: [
          cell([p(labelRuns, { spacing: { before }, keepNext })], half, borders),
          cell(
            [pLtr([ltr(valueText, { bold: true, size: valueSize, color: valueColor })], { spacing: { before }, keepNext })],
            CONTENT - half,
            borders,
          ),
        ],
      }),
    ],
    [half, CONTENT - half],
  );
}

// Per-person + group totals for a set of items. `strong` is the closing band,
// which is kept with the CTA that follows it so the two can't be split across a
// page break — a lone CTA on an otherwise empty last page looks unfinished.
function totalsBlocks(items, groupSize, label, { strong = false } = {}) {
  const pp = perPerson(items, groupSize);
  const g = groupTotal(items, groupSize);
  const out = [
    moneyRow(label, formatRange(pp.low, pp.high), {
      labelSize: strong ? SZ.investLabel : SZ.totalsLabel,
      valueSize: strong ? SZ.investValue : SZ.totalsValue,
      valueColor: RED_DEEP,
      before: 80,
      topBorder: { size: strong ? 24 : 8, color: strong ? RED : LINE },
      keepNext: strong,
    }),
  ];
  if (groupSize > 0) {
    out.push(
      moneyRow(
        [
          he('סה״כ לקבוצה ', { bold: true, size: SZ.groupRow, color: INK }),
          // The multiplier is LTR-isolated so the parentheses don't mirror and
          // the digits don't jump to the wrong side of the "×".
          ltr(`(×${groupSize})`, { bold: true, size: SZ.groupRow, color: INK }),
        ],
        formatRange(g.low, g.high),
        { labelSize: SZ.groupRow, valueSize: SZ.groupRow, valueColor: INK, before: 60, keepNext: strong },
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
  return [
    p([he('הערות', { bold: true, size: SZ.notesLabel, color: RED, characterSpacing: 40 })], {
      spacing: { before: 340, after: 80 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 10 } },
      keepNext: true,
    }),
    ...textParagraphs(text, { size: SZ.notes, color: INK_2 }, { spacing: { after: 60 } }),
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
          labelSize: SZ.investLabel,
          valueSize: SZ.investValue,
          valueColor: RED_DEEP,
          before: 80,
          topBorder: { size: 24, color: RED },
          keepNext: true,
        }),
        spacer(6),
      );
    }
  }

  out.push(
    p([he('נשמח לעמוד לרשותכם ולצאת יחד לדרך', { bold: true, size: SZ.cta, color: INK })], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 80 },
      keepNext: true,
    }),
  );
  out.push(
    p(
      [
        he(`${BRAND.name}  ·  `, { bold: true, size: SZ.ctaContact, color: INK_3 }),
        ltr(BRAND.contact, { size: SZ.ctaContact, color: INK_3 }),
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

  const [images, hero, logo] = await Promise.all([
    buildImageMap(event),
    loadHero(event),
    loadImage(LOGO_PATH, {}),
  ]);

  const children = [...coverBlocks(event, { hero, logo, option })];

  if (optionsMode) {
    children.push(sectionHeading('הלו״ז ליום'));
    children.push(sectionHeading('אופציה א', { size: SZ.optionHeading }));
    children.push(
      ...scheduleBlocks(allItems.filter((it) => it.option !== 'B'), {
        showPrices,
        images,
        groupSize,
        totalsLabel: 'מחיר לאדם · אופציה א',
      }),
    );
    children.push(sectionHeading('אופציה ב', { size: SZ.optionHeading }));
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
          he(`${BRAND.name} · ${BRAND.tagline}   ·   עמוד `, { size: SZ.footer, color: INK_4 }),
          new TextRun({ children: [PageNumber.CURRENT], rightToLeft: false, size: SZ.footer, color: INK_4, font: 'Arial' }),
          he(' מתוך ', { size: SZ.footer, color: INK_4 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], rightToLeft: false, size: SZ.footer, color: INK_4, font: 'Arial' }),
        ],
      }),
    ],
  });

  const doc = new Document({
    // Document-wide defaults: Arial (present on every machine, good Hebrew
    // coverage), RTL runs and bidi paragraphs, so anything added later inherits
    // the right direction.
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: SZ.desc, color: INK_2, rightToLeft: true },
          paragraph: { bidirectional: true, spacing: { line: 300 } },
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
