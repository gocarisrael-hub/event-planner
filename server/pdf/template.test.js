import { test } from 'node:test';
import assert from 'node:assert';
import { proposalHtml } from './template.js';

test('item contact name and phone appear when set', () => {
  const event = {
    title: 'אירוע',
    items: [{ title: 'טיול', contact_name: 'דנה', contact_phone: '050-1234567' }],
  };
  const html = proposalHtml(event, { prices: false, photos: {}, logo: null });
  assert.ok(html.includes('דנה'), 'expected contact_name in output');
  assert.ok(html.includes('050-1234567'), 'expected contact_phone in output');
  assert.ok(html.includes('דנה · 050-1234567'), 'expected name and phone joined with " · "');
  assert.ok(html.includes('איש קשר:'), 'expected the contact label');
});

test('only the present contact field is shown (blank omitted)', () => {
  const nameOnly = proposalHtml(
    { title: 'א', items: [{ title: 'טיול', contact_name: 'דנה', contact_phone: '' }] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(nameOnly.includes('איש קשר: דנה'), 'name-only contact should render');
  assert.ok(!nameOnly.includes('איש קשר: דנה · '), 'no separator when phone is blank');
});

test('contact line omitted when item has no contact', () => {
  const html = proposalHtml(
    { title: 'א', items: [{ title: 'טיול' }] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(!html.includes('איש קשר:'), 'no contact label when no contact present');
});

test("option's contact still appears", () => {
  const event = {
    title: 'א',
    items: [
      {
        title: 'ארוחה',
        options: [
          { title: 'מסעדה', contact_name: 'יוסי', contact_phone: '03-9999999' },
        ],
      },
    ],
  };
  const html = proposalHtml(event, { prices: false, photos: {}, logo: null });
  assert.ok(html.includes('יוסי'), 'expected option contact_name');
  assert.ok(html.includes('03-9999999'), 'expected option contact_phone');
  assert.ok(html.includes('יוסי · 03-9999999'), 'expected option contact joined');
});

test('contact values are HTML-escaped', () => {
  const html = proposalHtml(
    { title: 'א', items: [{ title: 'x', contact_name: '<b>&"', contact_phone: '1' }] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(html.includes('&lt;b&gt;&amp;&quot;'), 'expected escaped contact name');
  assert.ok(!html.includes('<b>&"'), 'raw unescaped value must not appear');
});

test('goal budget per person shown when prices=false and budget positive', () => {
  const html = proposalHtml(
    { title: 'א', budget: 250, items: [] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(html.includes('תקציב לאדם'), 'expected budget label');
  assert.ok(html.includes('250'), 'expected budget value');
});

test('goal budget NOT shown when prices=true', () => {
  const html = proposalHtml(
    { title: 'א', budget: 250, items: [] },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(!html.includes('תקציב לאדם'), 'budget must not appear when prices=true');
});

test('goal budget NOT shown when budget is missing or non-positive', () => {
  for (const budget of [undefined, 0, -5, 'abc']) {
    const html = proposalHtml(
      { title: 'א', budget, items: [] },
      { prices: false, photos: {}, logo: null },
    );
    assert.ok(!html.includes('תקציב לאדם'), `budget must not appear for ${budget}`);
  }
});

test('options_mode:true renders both A and B section headers with their items', () => {
  const event = {
    title: 'יום',
    options_mode: true,
    items: [
      { title: 'פעילות איי', option: 'A', approx_start: '09:00' },
      { title: 'פעילות בי', option: 'B', approx_start: '10:00' },
    ],
  };
  const html = proposalHtml(event, { prices: false, photos: {}, logo: null });
  assert.ok(html.includes('אופציה א'), 'expected option A header');
  assert.ok(html.includes('אופציה ב'), 'expected option B header');
  assert.ok(html.includes('פעילות איי'), 'expected A item under its section');
  assert.ok(html.includes('פעילות בי'), 'expected B item under its section');
});

test('options_mode:true shows a per-option total under each option when prices on', () => {
  const event = {
    title: 'יום',
    options_mode: true,
    group_size: 10,
    items: [
      { title: 'A', option: 'A', price: 100 },
      { title: 'B', option: 'B', price: 200 },
    ],
  };
  const html = proposalHtml(event, { prices: true, photos: {}, logo: null });
  assert.ok(html.includes('מחיר לאדם · אופציה א'), 'expected per-option A total label');
  assert.ok(html.includes('מחיר לאדם · אופציה ב'), 'expected per-option B total label');
  assert.ok(html.includes('₪100'), 'expected A total value');
  assert.ok(html.includes('₪200'), 'expected B total value');
});

test('options_mode:false (or absent) renders single schedule, no A/B labels', () => {
  for (const event of [
    { title: 'יום', items: [{ title: 'פעילות', option: 'A' }] },
    { title: 'יום', options_mode: false, items: [{ title: 'פעילות', option: 'A' }] },
  ]) {
    const html = proposalHtml(event, { prices: false, photos: {}, logo: null });
    assert.ok(!html.includes('אופציה א'), 'no option A label in single mode');
    assert.ok(!html.includes('אופציה ב'), 'no option B label in single mode');
    assert.ok(html.includes('פעילות'), 'item still renders in single mode');
    assert.ok(html.includes('הלו״ז ליום'), 'single schedule header present');
  }
});

test('price_type:total contributes a FLAT amount to the group total', () => {
  // One flat total-priced ₪1000 item over a group of 10 → group ₪1000,
  // per-person ₪100 (1000 / 10). The total-priced item is tagged סה״כ.
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [{ title: 'אולם', price: 1000, price_type: 'total' }],
    },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('₪1000'), 'expected the flat item price ₪1000');
  assert.ok(html.includes('₪100'), 'expected per-person ₪100 (1000/10)');
  assert.ok(html.includes('class="price-tag"'), 'expected the סה״כ price tag on a total item');
});

test('per_person price contributes price×N to the group total', () => {
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [{ title: 'פעילות', price: 50, price_type: 'per_person' }],
    },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('₪500'), 'expected group total ₪500 (50×10)');
});

test('mixed types: flat total + per_person sum correctly per group and per head', () => {
  // ₪1000 flat + ₪50/head over 10 → group 1000 + 500 = 1500, per-head 150.
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [
        { title: 'אולם', price: 1000, price_type: 'total' },
        { title: 'פעילות', price: 50, price_type: 'per_person' },
      ],
    },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('₪1500'), 'expected group total ₪1500');
  assert.ok(html.includes('₪150'), 'expected per-person ₪150');
});

test('fixed_cost is added ONCE to the group total, not per head', () => {
  // ₪50/head × 10 = ₪500, plus a flat ₪800 → group ₪1300, per head ₪130.
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [{ title: 'סדנה', price: 50, price_type: 'per_person', fixed_cost: 800 }],
    },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('₪1300'), 'expected group total ₪1300 (50×10 + 800)');
  assert.ok(html.includes('₪130'), 'expected per-person ₪130');
  assert.ok(!html.includes('₪8000'), 'fixed cost must not be multiplied by the group');
});

test('fixed_cost is itemised with its note when prices are on', () => {
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [{ title: 'סדנה', price: 50, fixed_cost: 800, fixed_cost_note: 'שכירות מקום' }],
    },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('₪800'), 'expected the flat extra amount');
  assert.ok(html.includes('שכירות מקום'), 'expected the note saying what it covers');
  assert.ok(html.includes('class="act-fixed"'), 'expected the flat-extra line');
});

test('fixed_cost is hidden (but still counted) when prices are off', () => {
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [{ title: 'סדנה', price: 50, fixed_cost: 800, fixed_cost_note: 'מדריך' }],
    },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(!html.includes('₪800'), 'no amount in the no-prices variant');
  assert.ok(!html.includes('מדריך'), 'no note in the no-prices variant');
});

test('a blank/zero/invalid fixed_cost renders nothing and changes no total', () => {
  for (const fixed_cost of [undefined, null, 0, -5, '', 'abc']) {
    const html = proposalHtml(
      {
        title: 'יום',
        group_size: 10,
        items: [{ title: 'סדנה', price: 50, fixed_cost }],
      },
      { prices: true, photos: {}, logo: null },
    );
    assert.ok(!html.includes('class="act-fixed"'), `no flat-extra line for ${fixed_cost}`);
    assert.ok(html.includes('₪500'), `group total stays ₪500 for ${fixed_cost}`);
  }
});

test('an item priced ONLY by a fixed cost still shows the totals band', () => {
  const html = proposalHtml(
    {
      title: 'יום',
      group_size: 10,
      items: [{ title: 'אולם', fixed_cost: 800, fixed_cost_note: 'שכירות' }],
    },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('מחיר לאדם'), 'totals band must render');
  assert.ok(html.includes('₪800'), 'expected the group total ₪800');
  assert.ok(html.includes('₪80'), 'expected per-person ₪80 (800/10)');
});

test('fixed_cost_note is HTML-escaped', () => {
  const html = proposalHtml(
    { title: 'א', items: [{ title: 'x', fixed_cost: 10, fixed_cost_note: '<b>&"' }] },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(html.includes('&lt;b&gt;&amp;&quot;'), 'expected escaped note');
  assert.ok(!html.includes('<b>&"'), 'raw unescaped value must not appear');
});

test('client_notes render in the proposal, in every variant', () => {
  for (const prices of [true, false]) {
    const html = proposalHtml(
      { title: 'א', client_notes: 'המחירים אינם כוללים מע״מ', items: [] },
      { prices, photos: {}, logo: null },
    );
    assert.ok(html.includes('המחירים אינם כוללים מע״מ'), `notes must render (prices=${prices})`);
    assert.ok(html.includes('class="notes"'), `notes block must render (prices=${prices})`);
  }
});

test('client_notes block is omitted when blank or whitespace-only', () => {
  for (const client_notes of [undefined, null, '', '   \n  ']) {
    const html = proposalHtml(
      { title: 'א', client_notes, items: [] },
      { prices: false, photos: {}, logo: null },
    );
    assert.ok(!html.includes('class="notes"'), `no notes block for ${JSON.stringify(client_notes)}`);
  }
});

test('client_notes are HTML-escaped', () => {
  const html = proposalHtml(
    { title: 'א', client_notes: '<script>x</script>&"', items: [] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(!html.includes('<script>'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;'), 'expected escaped notes');
});

test('private event notes never appear in the PDF', () => {
  const html = proposalHtml(
    { title: 'א', notes: 'הערה פנימית סודית', client_notes: 'גלוי', items: [] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(!html.includes('הערה פנימית סודית'), 'internal notes must not render');
  assert.ok(html.includes('גלוי'), 'client notes still render');
});

test('requests text never appears in the PDF', () => {
  const html = proposalHtml(
    { title: 'א', requests: 'אנחנו רוצים משהו מיוחד', items: [] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(!html.includes('אנחנו רוצים משהו מיוחד'), 'requests text must not render');
  assert.ok(!html.includes('class="requests"'), 'requests element must not render');
});
