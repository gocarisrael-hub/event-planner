import { useCatalogStore } from '../store/useCatalogStore.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// Pick a space (מרחב) from the defined list. Choosing "➕ מרחב חדש…"
// prompts for a name, adds it to the list, and selects it.
export default function SpaceSelect({ value, onChange, className }) {
  const spaces = useCatalogStore((s) => s.spaces);
  const addSpace = useCatalogStore((s) => s.addSpace);

  const handle = async (e) => {
    if (e.target.value === '__new__') {
      const name = window.prompt('שם המרחב החדש:');
      if (name && name.trim()) {
        const row = await addSpace(name.trim());
        onChange(row.name);
      }
      return;
    }
    onChange(e.target.value);
  };

  // Allow showing a value that isn't in the list yet (e.g. legacy data).
  const known = spaces.some((s) => s.name === value);

  return (
    <select className={className || field} value={value || ''} onChange={handle}>
      <option value="">מרחב…</option>
      {!known && value ? <option value={value}>{value}</option> : null}
      {spaces.map((s) => (
        <option key={s.id} value={s.name}>
          {s.name}
        </option>
      ))}
      <option value="__new__">➕ מרחב חדש…</option>
    </select>
  );
}
