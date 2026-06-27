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

test('requests text never appears in the PDF', () => {
  const html = proposalHtml(
    { title: 'א', requests: 'אנחנו רוצים משהו מיוחד', items: [] },
    { prices: false, photos: {}, logo: null },
  );
  assert.ok(!html.includes('אנחנו רוצים משהו מיוחד'), 'requests text must not render');
  assert.ok(!html.includes('class="requests"'), 'requests element must not render');
});
