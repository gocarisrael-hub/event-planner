import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useRef, useState } from 'react';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { useEventStore } from '../store/useEventStore.js';
import { formatDuration, formatPrice, formatRange, timingLabel } from '../utils/format.js';
import CategorySelect from './CategorySelect.jsx';
import PhotoUploader from './PhotoUploader.jsx';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// Per-head price range contributed by a single choice block.
function optionRange(options) {
  const prices = options.map((o) => Number(o.price) || 0);
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

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

// A schedule block. Collapsed = a row in the day; expanded = inline editor.
export default function TimelineItem({ item, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const set = (patch) => onChange(item.id, patch);

  const addOption = useEventStore((s) => s.addOption);
  const updateOption = useEventStore((s) => s.updateOption);
  const removeOption = useEventStore((s) => s.removeOption);

  const options = item.options || [];
  const hasOptions = options.length > 0;
  const range = hasOptions ? optionRange(options) : null;

  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-xl border border-slate-200 print-break">
      {/* Collapsed header row */}
      <div className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-slate-300 hover:text-slate-500 px-1" title="גרור לסידור">
          ⠿
        </button>
        <div className="text-center min-w-[72px]">
          <div className="text-sm font-bold text-ocar"><bdi>{timingLabel(item) || '—'}</bdi></div>
          {item.approx_duration_hours ? (
            <div className="text-[11px] text-slate-400">{formatDuration(item.approx_duration_hours)}</div>
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate flex items-center gap-2">
            {item.title}
            {hasOptions && (
              <span className="text-[11px] font-medium bg-ocar-soft text-ocar rounded-full px-2 py-0.5 whitespace-nowrap">
                אפשרויות: {options.length}
              </span>
            )}
          </div>
          {item.description && <div className="text-xs text-slate-500 line-clamp-2 break-words">{item.description}</div>}
        </div>
        {!hasOptions && item.photos?.length > 0 && (
          <img src={item.photos[0]} alt="" className="h-10 w-10 rounded object-cover" />
        )}
        <div className="text-sm text-slate-600 whitespace-nowrap">
          {item.show_price === false ? (
            <span className="text-slate-300">ללא מחיר</span>
          ) : hasOptions ? (
            formatRange(range.low, range.high)
          ) : (
            formatPrice(item.price) || '—'
          )}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-ocar text-sm px-2">
          {open ? 'סגור' : 'ערוך'}
        </button>
      </div>

      {/* Expanded inline editor */}
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          <input className={field} value={item.title} onChange={(e) => set({ title: e.target.value })} placeholder="שם הפעילות" />
          <textarea className={field} rows={4} value={item.description || ''}
            onChange={(e) => set({ description: e.target.value })} placeholder="תיאור" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-xs text-slate-500">
              שעת התחלה
              <input className={field} value={item.approx_start || ''} placeholder="למשל 09:00"
                onChange={(e) => set({ approx_start: e.target.value })} />
            </label>
            <label className="text-xs text-slate-500">
              שעת סיום
              <input className={field} value={item.approx_end || ''} placeholder="למשל 14:00"
                onChange={(e) => set({ approx_end: e.target.value })} />
            </label>
            <label className="text-xs text-slate-500">
              משך (שעות)
              <input type="number" step="0.5" min="0" className={field} value={item.approx_duration_hours ?? ''}
                onChange={(e) => set({ approx_duration_hours: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="text-xs text-slate-500">
              קטגוריה
              <CategorySelect value={item.category} onChange={(category) => set({ category })} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500 sm:col-span-1">
              הערת זמן חופשית (אם לא בטוח בשעה)
              <input className={field} value={item.time_note || ''} placeholder="למשל: בוקר, בערך 8–10"
                onChange={(e) => set({ time_note: e.target.value })} />
            </label>
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <label className="text-xs text-slate-500">
              מחיר (₪)
              <input type="number" className={field} value={item.price ?? ''}
                onChange={(e) => set({ price: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-2 pb-1">
              <input type="checkbox" checked={item.show_price !== false}
                onChange={(e) => set({ show_price: e.target.checked })} />
              הצג מחיר בלו״ז/PDF
            </label>
          </div>

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

          <div className="flex justify-between pt-1">
            <button onClick={() => onRemove(item.id)} className="text-red-500 text-sm hover:underline">
              מחק פעילות
            </button>
            <button onClick={() => setOpen(false)} className="text-ocar text-sm font-medium">סיום</button>
          </div>
        </div>
      )}
    </div>
  );
}
