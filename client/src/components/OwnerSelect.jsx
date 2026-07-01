import { useCatalogStore } from '../store/useCatalogStore.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// Pick an אחראי (person in charge) from the defined list. Choosing
// "➕ אחראי חדש…" prompts for a name, adds it to the list, and selects it.
export default function OwnerSelect({ value, onChange, className }) {
  const owners = useCatalogStore((s) => s.owners);
  const addOwner = useCatalogStore((s) => s.addOwner);

  const handle = async (e) => {
    if (e.target.value === '__new__') {
      const name = window.prompt('שם האחראי החדש:');
      if (name && name.trim()) {
        const row = await addOwner(name.trim());
        onChange(row.name);
      }
      return;
    }
    onChange(e.target.value);
  };

  // Allow showing a value that isn't in the list yet (e.g. legacy data).
  const known = owners.some((o) => o.name === value);

  return (
    <select className={className || field} value={value || ''} onChange={handle}>
      <option value="">אחראי…</option>
      {!known && value ? <option value={value}>{value}</option> : null}
      {owners.map((o) => (
        <option key={o.id} value={o.name}>
          {o.name}
        </option>
      ))}
      <option value="__new__">➕ אחראי חדש…</option>
    </select>
  );
}
