import { useMemo, useRef, useState } from 'react';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { formatDuration, formatPrice } from '../utils/format.js';

// Inline "add activity" row that sits inside the schedule.
// - Type a title → matching catalog items appear (scroll to see all); pick one to reuse it.
// - Or type something new and press Enter → it's added (and saved to the catalog,
//   unless "חד-פעמי" is checked → added to this day only).
export default function AddActivityRow({ onAdd }) {
  const catalog = useCatalogStore((s) => s.catalog);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return catalog;
    return catalog.filter((c) => c.title.toLowerCase().includes(t));
  }, [q, catalog]);

  const addNew = () => {
    const title = q.trim();
    if (!title) return;
    // save_to_catalog:false → one-time activity, added to this day only.
    onAdd({ title, save_to_catalog: !oneTime });
    setQ('');
    setOpen(false);
  };

  const addFromCatalog = (c) => {
    onAdd({ from_catalog_id: c.id });
    setQ('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          onKeyDown={(e) => e.key === 'Enter' && addNew()}
          placeholder="הוסף פעילות… (למשל: ארוחת בוקר, טיול ים המלח)"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ocar"
        />
        <button
          onClick={addNew}
          className="bg-ocar text-white px-4 rounded-lg font-medium hover:opacity-90 whitespace-nowrap"
        >
          + הוסף
        </button>
      </div>

      <label className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={oneTime}
          onChange={(e) => setOneTime(e.target.checked)}
          className="accent-ocar"
        />
        חד-פעמי — לא להוסיף לקטלוג
      </label>

      {open && matches.length > 0 && (
        <ul
          className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
          onMouseDown={() => clearTimeout(blurTimer.current)}
        >
          <li className="px-3 py-1 text-xs text-slate-400 bg-slate-50 sticky top-0">מהקטלוג שלך</li>
          {matches.map((c) => (
            <li key={c.id}>
              <button
                onMouseDown={() => addFromCatalog(c)}
                className="w-full text-right px-3 py-2 hover:bg-ocar-soft flex justify-between items-center"
              >
                <span className="font-medium">{c.title}</span>
                <span className="text-xs text-slate-400">
                  {[formatDuration(c.default_duration_hours), formatPrice(c.default_price)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
