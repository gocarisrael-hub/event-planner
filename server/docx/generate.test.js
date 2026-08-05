// Word export tests. The bulk of these assert the RTL invariants of the
// generated OOXML, because that is what silently breaks a Hebrew .docx: Word
// will happily render a document whose paragraphs lack w:bidi, and the reader
// then sees prices and times with their halves swapped.
import { test } from 'node:test';
import assert from 'node:assert';
import JSZip from 'jszip';
import { generateProposalDocx } from './generate.js';

// Build a document and return its word/document.xml.
async function docXml(event, opts = {}) {
  const buffer = await generateProposalDocx(event, opts);
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

// Split the XML into paragraph chunks (the trailing chunk after the last
// </w:p> is section properties, not a paragraph).
const paragraphs = (xml) => xml.split('</w:p>').slice(0, -1);

// Runs that actually carry text — image runs have no direction of their own.
const textRuns = (xml) =>
  [...xml.matchAll(/<w:r>(.*?)<\/w:r>/gs)].map((m) => m[1]).filter((r) => r.includes('<w:t'));

const runText = (run) =>
  [...run.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

const isLtrRun = (run) => run.includes('<w:rtl w:val="false"/>');

const baseEvent = {
  title: 'יום גיבוש',
  client_name: 'אלביט',
  group_size: 27,
  target_month: 'נובמבר',
  location: 'ים המלח',
  budget: 300,
  client_notes: 'המחיר כולל הסעות.\nלא כולל ארוחת ערב.',
  items: [
    {
      id: '1',
      title: 'עגלת קפה',
      approx_start: '09:00',
      approx_duration_hours: 1,
      description: 'קפה ומאפה',
      price: 50,
      price_type: 'per_person',
      fixed_cost: 800,
      fixed_cost_note: 'הסעה',
      contact_name: 'אלכס',
      contact_phone: '055-9649757',
      photos: [],
    },
    {
      id: '2',
      title: 'שייט קייקים',
      approx_start: '10:30',
      price: 250,
      photos: [],
      options: [
        { id: 'a', title: 'קייקים', price: 250, description: 'שייט מודרך' },
        { id: 'b', title: 'סיור בולענים', price: 180 },
      ],
    },
  ],
};

test('every paragraph declares RTL base direction (w:bidi)', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  const missing = paragraphs(xml).filter((p) => !p.includes('<w:bidi/>'));
  assert.strictEqual(missing.length, 0, `${missing.length} paragraph(s) without w:bidi`);
});

test('every text run states its direction explicitly', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  const undirected = textRuns(xml).filter(
    (r) => !r.includes('<w:rtl/>') && !isLtrRun(r),
  );
  assert.strictEqual(undirected.length, 0, `${undirected.length} run(s) with no direction`);
});

test('every table is laid out right-to-left (w:bidiVisual)', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  const tables = xml.split('</w:tbl>').slice(0, -1);
  assert.ok(tables.length > 0, 'expected the document to use tables');
  const missing = tables.filter((t) => !t.includes('<w:bidiVisual/>'));
  assert.strictEqual(missing.length, 0, `${missing.length} table(s) without w:bidiVisual`);
});

test('prices, times, dates and phone numbers are LTR-isolated', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  const runs = textRuns(xml);
  // Anything holding digits must be an LTR run, or bidi reordering will swap
  // the halves of "₪120–₪150" and "09:00–10:30".
  const numeric = runs.filter((r) => /\d/.test(runText(r)));
  assert.ok(numeric.length > 0, 'expected numeric runs');
  const wrong = numeric.filter((r) => !isLtrRun(r));
  assert.deepStrictEqual(wrong.map(runText), [], 'numeric runs must be LTR-isolated');
});

test('Hebrew prose runs are marked RTL', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  const hebrew = textRuns(xml).filter((r) => /[֐-׿]/.test(runText(r)));
  assert.ok(hebrew.length > 0, 'expected Hebrew runs');
  const wrong = hebrew.filter((r) => !r.includes('<w:rtl/>'));
  assert.deepStrictEqual(wrong.map(runText), [], 'Hebrew runs must carry w:rtl');
});

test('Hebrew keeps its weight and size (complex-script properties)', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  // Word sizes/bolds Hebrew from w:szCs / w:bCs, not w:sz / w:b.
  assert.strictEqual(
    (xml.match(/<w:b\/>/g) || []).length,
    (xml.match(/<w:bCs\/>/g) || []).length,
    'every bold run needs the complex-script bold too',
  );
  assert.strictEqual(
    (xml.match(/<w:sz /g) || []).length,
    (xml.match(/<w:szCs /g) || []).length,
    'every sized run needs the complex-script size too',
  );
});

test('schedule content, contacts and notes are present', async () => {
  const xml = await docXml(baseEvent, { prices: true });
  const text = xml.replace(/<[^>]+>/g, '');
  assert.ok(text.includes('יום גיבוש'), 'title');
  assert.ok(text.includes('הלו״ז ליום'), 'schedule heading');
  assert.ok(text.includes('עגלת קפה'), 'item title');
  assert.ok(text.includes('09:00–10:00'), 'computed time range');
  assert.ok(text.includes('איש קשר'), 'contact label');
  assert.ok(text.includes('055-9649757'), 'contact phone');
  assert.ok(text.includes('בחירה בין:'), 'choice block label');
  assert.ok(text.includes('סיור בולענים'), 'option title');
  // Each notes line becomes its own paragraph.
  assert.ok(text.includes('המחיר כולל הסעות.'), 'first notes line');
  assert.ok(text.includes('לא כולל ארוחת ערב.'), 'second notes line');
});

test('prices mode shows prices, the flat extra and the totals', async () => {
  const text = (await docXml(baseEvent, { prices: true })).replace(/<[^>]+>/g, '');
  assert.ok(text.includes('₪50'), 'per-head price');
  assert.ok(text.includes('+ ₪800'), 'flat extra');
  assert.ok(text.includes('הסעה'), 'what the flat extra covers');
  assert.ok(text.includes('מחיר לאדם'), 'per-person total label');
  assert.ok(text.includes('סה״כ לקבוצה (×27)'), 'group total label');
});

test('no-prices mode hides every price and shows the budget instead', async () => {
  const text = (await docXml(baseEvent, { prices: false, budget: true })).replace(/<[^>]+>/g, '');
  assert.ok(!text.includes('₪50'), 'item price must be hidden');
  assert.ok(!text.includes('₪800'), 'flat extra must be hidden');
  assert.ok(!text.includes('מחיר לאדם'), 'totals must be hidden');
  assert.ok(text.includes('תקציב לאדם'), 'budget label');
  assert.ok(text.includes('₪300'), 'budget value');
});

test('budget=false drops the budget band too', async () => {
  const text = (await docXml(baseEvent, { prices: false, budget: false })).replace(/<[^>]+>/g, '');
  assert.ok(!text.includes('תקציב לאדם'), 'budget band must be hidden');
  assert.ok(text.includes('נשמח לעמוד לרשותכם'), 'the closing CTA still shows');
});

test('a single-option export carries the אופציה badge', async () => {
  const text = (await docXml(baseEvent, { prices: false, option: 'ב' })).replace(/<[^>]+>/g, '');
  assert.ok(text.includes('אופציה ב'), 'option badge');
});

test('options mode stacks a labeled section per option with its own total', async () => {
  const event = {
    ...baseEvent,
    options_mode: true,
    items: [
      { ...baseEvent.items[0], option: 'A' },
      { ...baseEvent.items[1], option: 'B', options: [] },
    ],
  };
  const text = (await docXml(event, { prices: true })).replace(/<[^>]+>/g, '');
  assert.ok(text.includes('אופציה א'), 'section A heading');
  assert.ok(text.includes('אופציה ב'), 'section B heading');
  assert.ok(text.includes('מחיר לאדם · אופציה א'), 'per-section total A');
  assert.ok(text.includes('מחיר לאדם · אופציה ב'), 'per-section total B');
});

test('an event with no items still produces a valid document', async () => {
  const text = (await docXml({ title: 'ריק', items: [] }, { prices: true })).replace(/<[^>]+>/g, '');
  assert.ok(text.includes('ריק'), 'title');
  assert.ok(text.includes('הלו״ז ליום'), 'schedule heading');
});
