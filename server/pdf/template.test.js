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
  assert.ok(html.includes('תקציב משוער לאדם'), 'expected budget label');
  assert.ok(html.includes('250'), 'expected budget value');
});

test('goal budget NOT shown when prices=true', () => {
  const html = proposalHtml(
    { title: 'א', budget: 250, items: [] },
    { prices: true, photos: {}, logo: null },
  );
  assert.ok(!html.includes('תקציב משוער לאדם'), 'budget must not appear when prices=true');
});

test('goal budget NOT shown when budget is missing or non-positive', () => {
  for (const budget of [undefined, 0, -5, 'abc']) {
    const html = proposalHtml(
      { title: 'א', budget, items: [] },
      { prices: false, photos: {}, logo: null },
    );
    assert.ok(!html.includes('תקציב משוער לאדם'), `budget must not appear for ${budget}`);
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
