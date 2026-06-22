import { useCatalogStore } from '../store/useCatalogStore.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// Pick a category from the defined list. Choosing "➕ קטגוריה חדשה…"
// prompts for a name, adds it to the list, and selects it.
export default function CategorySelect({ value, onChange, className }) {
  const categories = useCatalogStore((s) => s.categories);
  const addCategory = useCatalogStore((s) => s.addCategory);

  const handle = async (e) => {
    if (e.target.value === '__new__') {
      const name = window.prompt('שם הקטגוריה החדשה:');
      if (name && name.trim()) {
        const row = await addCategory(name.trim());
        onChange(row.name);
      }
      return;
    }
    onChange(e.target.value);
  };

  // Allow showing a value that isn't in the list yet (e.g. legacy data).
  const known = categories.some((c) => c.name === value);

  return (
    <select className={className || field} value={value || ''} onChange={handle}>
      <option value="">קטגוריה…</option>
      {!known && value ? <option value={value}>{value}</option> : null}
      {categories.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
      <option value="__new__">➕ קטגוריה חדשה…</option>
    </select>
  );
}
