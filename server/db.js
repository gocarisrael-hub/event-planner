// Tiny JSON-file data store. No native deps — safe to install/run anywhere.
// Collections: categories (defined list), catalog (reusable activities),
// events (days), items (schedule blocks).
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'app.json');

const EMPTY = { categories: [], catalog: [], events: [], items: [] };

const DEFAULT_CATEGORIES = [
  'אוכל',
  'אטרקציה',
  'פעילות שטח',
  'סדנה',
  'הרצאה',
  'לינה',
  'הסעות',
];

function seed() {
  return {
    categories: DEFAULT_CATEGORIES.map((name) => ({ id: randomUUID(), name })),
    catalog: [
      {
        id: randomUUID(),
        title: 'ארוחת בוקר',
        description: 'ארוחת בוקר בופה עשירה לפתיחת היום',
        category: 'אוכל',
        default_duration_hours: 1,
        default_price: 45,
        contact_name: 'קייטרינג בוקר טוב',
        contact_phone: '',
        photos: [],
        tags: [],
      },
      {
        id: randomUUID(),
        title: 'טיול ים המלח',
        description: 'טיול מודרך עם ציפה בים המלח',
        category: 'אטרקציה',
        default_duration_hours: 3,
        default_price: 120,
        contact_name: 'סיורי ים המלח',
        contact_phone: '',
        photos: [],
        tags: [],
      },
    ],
    events: [],
    items: [],
  };
}

// In-place migration of legacy price-range fields to a single price.
// Returns true if anything changed.
function migrate(d) {
  let changed = false;
  for (const c of d.catalog || []) {
    if ('default_price_min' in c || 'default_price_max' in c) {
      if (c.default_price === undefined) {
        c.default_price = c.default_price_min ?? c.default_price_max ?? null;
      }
      delete c.default_price_min;
      delete c.default_price_max;
      changed = true;
    }
  }
  for (const it of d.items || []) {
    if (!Array.isArray(it.options)) {
      it.options = [];
      changed = true;
    }
    if ('price_min' in it || 'price_max' in it) {
      if (it.price === undefined) {
        it.price = it.price_min ?? it.price_max ?? null;
      }
      delete it.price_min;
      delete it.price_max;
      changed = true;
    }
  }
  return changed;
}

function load() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    const initial = seed();
    writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const data = { ...EMPTY, ...parsed };
    if (migrate(data)) {
      writeFileSync(`${DATA_FILE}.bak`, raw);
      writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    }
    return data;
  } catch {
    return seed();
  }
}

let db = load();

function persist() {
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// Generic collection helpers ------------------------------------------------
function col(name) {
  return {
    all: () => db[name],
    find: (id) => db[name].find((r) => r.id === id),
    where: (pred) => db[name].filter(pred),
    insert: (data) => {
      const row = { id: randomUUID(), ...data };
      db[name].push(row);
      persist();
      return row;
    },
    update: (id, patch) => {
      const row = db[name].find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      persist();
      return row;
    },
    remove: (id) => {
      const before = db[name].length;
      db[name] = db[name].filter((r) => r.id !== id);
      if (db[name].length !== before) persist();
      return before !== db[name].length;
    },
  };
}

export const categories = col('categories');
export const catalog = col('catalog');
export const events = col('events');
export const items = col('items');
export { persist };
