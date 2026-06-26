import { useCatalogStore } from '../store/useCatalogStore.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// Pick a client (לקוח) from the defined list. Choosing "➕ לקוח חדש…"
// prompts for a name, adds it to the list, and selects it.
export default function ClientSelect({ value, onChange, className }) {
  const clients = useCatalogStore((s) => s.clients);
  const addClient = useCatalogStore((s) => s.addClient);

  const handle = async (e) => {
    if (e.target.value === '__new__') {
      const name = window.prompt('שם הלקוח החדש:');
      if (name && name.trim()) {
        const row = await addClient(name.trim());
        onChange(row.name);
      }
      return;
    }
    onChange(e.target.value);
  };

  // Allow showing a value that isn't in the list yet (e.g. legacy data).
  const known = clients.some((c) => c.name === value);

  return (
    <select className={className || field} value={value || ''} onChange={handle}>
      <option value="">לקוח…</option>
      {!known && value ? <option value={value}>{value}</option> : null}
      {clients.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
      <option value="__new__">➕ לקוח חדש…</option>
    </select>
  );
}
