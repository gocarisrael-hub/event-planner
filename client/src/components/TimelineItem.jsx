import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { useEventStore } from '../store/useEventStore.js';
import { formatPrice } from '../utils/format.js';
import { DAY_END_MIN, startToMinutes } from '../utils/timeline.js';
import CategorySelect from './CategorySelect.jsx';
import PhotoUploader from './PhotoUploader.jsx';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// Inline "add option" row with catalog autocomplete (mirrors AddActivityRow).
function AddOptionRow({ onAdd }) {
  const catalog = useCatalogStore((s) => s.catalog);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return catalog.slice(0, 6);
    return catalog.filter((c) => c.title.toLowerCase().includes(t)).slice(0, 6);
  }, [q, catalog]);

  const addNew = () => {
    const title = q.trim();
    if (!title) return;
    onAdd({ title });
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
          placeholder="הוסף אפשרות… (למשל: עגלת קפה, מסעדה)"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ocar"
        />
        <button
          onClick={addNew}
          className="bg-ocar text-white px-4 rounded-lg text-sm font-medium hover:opacity-90 whitespace-nowrap"
        >
          + הוסף
        </button>
      </div>

      {open && matches.length > 0 && (
        <ul
          className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          onMouseDown={() => clearTimeout(blurTimer.current)}
        >
          <li className="px-3 py-1 text-xs text-slate-400 bg-slate-50">מהקטלוג שלך</li>
          {matches.map((c) => (
            <li key={c.id}>
              <button
                onMouseDown={() => addFromCatalog(c)}
                className="w-full text-right px-3 py-2 hover:bg-ocar-soft flex justify-between items-center"
              >
                <span className="font-medium">{c.title}</span>
                <span className="text-xs text-slate-400">{formatPrice(c.default_price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The activity editor. Opened from a timeline block; rendered as a centered
// modal panel. Start time is set by dragging the block on the timeline, so
// there are no start/end fields here — only an explicit duration (which
// resizes the block) plus description, category, contact, price, photos and
// alternatives (choice block).
// Item field → catalog field, for the optional "also update the catalog" sync.
const ITEM_TO_CATALOG = {
  title: 'title',
  description: 'description',
  category: 'category',
  contact_name: 'contact_name',
  contact_phone: 'contact_phone',
  location: 'location',
  price: 'default_price',
  price_type: 'default_price_type',
  approx_duration_hours: 'default_duration_hours',
  photos: 'photos',
};

export default function TimelineItem({ item, onChange, onRemove, onClose }) {
  const addOption = useEventStore((s) => s.addOption);
  const updateOption = useEventStore((s) => s.updateOption);
  const removeOption = useEventStore((s) => s.removeOption);
  const updateCatalog = useCatalogStore((s) => s.updateCatalog);

  // "Also update the linked catalog activity." Local to the editor, off by
  // default, and reset whenever a different item is opened.
  const [syncCatalog, setSyncCatalog] = useState(false);
  const linkedCatalogId = item.catalog_activity_id || null;
  useEffect(() => { setSyncCatalog(false); }, [item.id]);

  const set = (patch) => {
    onChange(item.id, patch);
    // Mirror the edited fields onto the linked catalog activity when asked.
    if (syncCatalog && linkedCatalogId) {
      const cat = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k in ITEM_TO_CATALOG) cat[ITEM_TO_CATALOG[k]] = v;
      }
      // Ignore failures (e.g. the catalog entry was deleted → 404) so the
      // item edit is never blocked.
      if (Object.keys(cat).length) updateCatalog(linkedCatalogId, cat).catch(() => {});
    }
  };

  const options = item.options || [];
  const hasOptions = options.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl my-8"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <div className="font-semibold truncate">{item.title || 'פעילות'}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-ocar text-sm px-2">
            סגור
          </button>
        </div>

        <div className="p-4 space-y-3">
          <input className={field} value={item.title} onChange={(e) => set({ title: e.target.value })} placeholder="שם הפעילות" />
          <textarea className={field} rows={4} value={item.description || ''}
            onChange={(e) => set({ description: e.target.value })} placeholder="תיאור" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-500">
              משך (שעות)
              <input type="number" step="0.5" min="0" className={field} value={item.approx_duration_hours ?? ''}
                onChange={(e) => {
                  let v = e.target.value ? Number(e.target.value) : null;
                  // Don't let a duration push the block past midnight.
                  const s = startToMinutes(item.approx_start);
                  if (v && s !== null) v = Math.min(v, (DAY_END_MIN - s) / 60);
                  set({ approx_duration_hours: v });
                }} />
            </label>
            <label className="text-xs text-slate-500">
              קטגוריה
              <CategorySelect value={item.category} onChange={(category) => set({ category })} />
            </label>
            <label className="text-xs text-slate-500 col-span-2">
              הערת זמן חופשית (לא חובה)
              <input className={field} value={item.time_note || ''} placeholder="למשל: בוקר, גמיש"
                onChange={(e) => set({ time_note: e.target.value })} />
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500">
              איש קשר
              <input className={field} value={item.contact_name || ''} placeholder="שם"
                onChange={(e) => set({ contact_name: e.target.value })} />
            </label>
            <label className="text-xs text-slate-500">
              טלפון
              <input className={field} value={item.contact_phone || ''} placeholder="050-…"
                onChange={(e) => set({ contact_phone: e.target.value })} />
            </label>
            <label className="text-xs text-slate-500">
              מחיר (₪)
              <input type="number" className={field} value={item.price ?? ''}
                onChange={(e) => set({ price: e.target.value ? Number(e.target.value) : null })} />
              {/* Price type — only meaningful for a plain item (no choices). */}
              {!hasOptions && (
                <select
                  className={`${field} mt-1`}
                  value={item.price_type === 'total' ? 'total' : 'per_person'}
                  onChange={(e) => {
                    // Switching to a flat total makes the "extra fixed cost"
                    // meaningless (the whole price is already flat) — clear it
                    // so a hidden field can't keep inflating the group total.
                    const price_type = e.target.value;
                    set(price_type === 'total'
                      ? { price_type, fixed_cost: null, fixed_cost_note: '' }
                      : { price_type });
                  }}
                >
                  <option value="per_person">לאדם</option>
                  <option value="total">סה״כ (לכל הקבוצה)</option>
                </select>
              )}
            </label>
          </div>

          {/* Extra flat cost on top of a PER-PERSON price — e.g. venue rental
              or a guide's fee that's charged once for the whole group. Only
              offered for a plain per-person item; a choice block or an already
              flat price has nothing to add it to. */}
          {!hasOptions && item.price_type !== 'total' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <label className="text-xs text-slate-500">
                תוספת קבועה (₪)
                <input
                  type="number"
                  className={field}
                  value={item.fixed_cost ?? ''}
                  placeholder="למשל 800"
                  onChange={(e) => set({ fixed_cost: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
              <label className="text-xs text-slate-500 col-span-2">
                על מה התוספת?
                <input
                  className={field}
                  value={item.fixed_cost_note || ''}
                  placeholder="למשל: שכירות מקום, מדריך"
                  onChange={(e) => set({ fixed_cost_note: e.target.value })}
                />
              </label>
              <div className="col-span-2 sm:col-span-3 text-xs text-slate-400">
                מחושב פעם אחת לכל הקבוצה (לא כפול מספר המשתתפים), ומופיע בהצעה עם המחירים.
              </div>
            </div>
          )}

          <div>
            <div className="text-xs text-slate-500 mb-1">תמונות</div>
            <PhotoUploader photos={item.photos || []} onChange={(photos) => set({ photos })} small />
          </div>

          {/* Alternatives (choice block) */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-sm font-medium text-slate-700 mb-1">אפשרויות (חלופות)</div>
            {hasOptions && (
              <div className="text-xs text-slate-400 mb-2">
                כשיש אפשרויות, מחיר הסעיף הוא טווח (זול–יקר) ולא המחיר הבודד.
              </div>
            )}
            <div className="space-y-3">
              {options.map((o) => (
                <div key={o.id} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
                  <div className="flex gap-2 items-start">
                    <input
                      className={field}
                      value={o.title || ''}
                      placeholder="שם האפשרות"
                      onChange={(e) => updateOption(item.id, o.id, { title: e.target.value })}
                    />
                    <button
                      onClick={() => removeOption(item.id, o.id)}
                      className="text-red-500 hover:text-red-600 px-1"
                      title="הסר אפשרות"
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    className={field}
                    rows={2}
                    value={o.description || ''}
                    placeholder="תיאור"
                    onChange={(e) => updateOption(item.id, o.id, { description: e.target.value })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-xs text-slate-500">
                      מחיר (₪)
                      <input
                        type="number"
                        className={field}
                        value={o.price ?? ''}
                        onChange={(e) => updateOption(item.id, o.id, { price: e.target.value ? Number(e.target.value) : null })}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      איש קשר
                      <input
                        className={field}
                        value={o.contact_name || ''}
                        placeholder="שם"
                        onChange={(e) => updateOption(item.id, o.id, { contact_name: e.target.value })}
                      />
                    </label>
                    <label className="text-xs text-slate-500">
                      טלפון
                      <input
                        className={field}
                        value={o.contact_phone || ''}
                        placeholder="050-…"
                        onChange={(e) => updateOption(item.id, o.id, { contact_phone: e.target.value })}
                      />
                    </label>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">תמונות</div>
                    <PhotoUploader photos={o.photos || []} onChange={(photos) => updateOption(item.id, o.id, { photos })} small />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <AddOptionRow onAdd={(data) => addOption(item.id, data)} />
            </div>
          </div>

          {/* Optionally mirror edits onto the linked catalog activity. */}
          {linkedCatalogId && (
            <label className="flex items-center gap-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <input
                type="checkbox"
                checked={syncCatalog}
                onChange={(e) => setSyncCatalog(e.target.checked)}
              />
              עדכן גם בקטלוג (השינויים יחולו על הפעילות השמורה)
            </label>
          )}

          <div className="flex justify-between pt-1">
            <button onClick={() => { onRemove(item.id); onClose(); }} className="text-red-500 text-sm hover:underline">
              מחק פעילות
            </button>
            <button onClick={onClose} className="text-ocar text-sm font-medium">סיום</button>
          </div>
        </div>
      </div>
    </div>
  );
}
