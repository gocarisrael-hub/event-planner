import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { formatDuration, formatPrice, timingLabel } from '../utils/format.js';
import PhotoUploader from './PhotoUploader.jsx';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

// A schedule block. Collapsed = a row in the day; expanded = inline editor.
export default function TimelineItem({ item, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const vendors = useCatalogStore((s) => s.vendors);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const set = (patch) => onChange(item.id, patch);

  return (
    <div ref={setNodeRef} style={style} className="bg-white rounded-xl border border-slate-200 print-break">
      {/* Collapsed header row */}
      <div className="flex items-center gap-3 p-3">
        <button {...attributes} {...listeners} className="cursor-grab text-slate-300 hover:text-slate-500 px-1" title="גרור לסידור">
          ⠿
        </button>
        <div className="text-center min-w-[72px]">
          <div className="text-sm font-bold text-ocar">{timingLabel(item) || '—'}</div>
          {item.approx_duration_min ? (
            <div className="text-[11px] text-slate-400">{formatDuration(item.approx_duration_min)}</div>
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{item.title}</div>
          {item.description && <div className="text-xs text-slate-500 truncate">{item.description}</div>}
        </div>
        {item.photos?.length > 0 && (
          <img src={item.photos[0]} alt="" className="h-10 w-10 rounded object-cover" />
        )}
        <div className="text-sm text-slate-600 whitespace-nowrap">
          {item.show_price === false ? (
            <span className="text-slate-300">ללא מחיר</span>
          ) : (
            formatPrice(item.price_min, item.price_max) || '—'
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
          <textarea className={field} rows={2} value={item.description || ''}
            onChange={(e) => set({ description: e.target.value })} placeholder="תיאור" />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500">
              שעה משוערת
              <input className={field} value={item.approx_start || ''} placeholder="למשל 09:00"
                onChange={(e) => set({ approx_start: e.target.value })} />
            </label>
            <label className="text-xs text-slate-500">
              משך (דקות)
              <input type="number" className={field} value={item.approx_duration_min ?? ''}
                onChange={(e) => set({ approx_duration_min: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="text-xs text-slate-500">
              ספק
              <select className={field} value={item.vendor_id || ''}
                onChange={(e) => set({ vendor_id: e.target.value || null })}>
                <option value="">—</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          </div>

          <label className="text-xs text-slate-500 block">
            הערת זמן חופשית (אם לא בטוח בשעה)
            <input className={field} value={item.time_note || ''} placeholder="למשל: בוקר, בערך 8–10"
              onChange={(e) => set({ time_note: e.target.value })} />
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <label className="text-xs text-slate-500">
              מחיר מ־ (₪)
              <input type="number" className={field} value={item.price_min ?? ''}
                onChange={(e) => set({ price_min: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="text-xs text-slate-500">
              מחיר עד (₪)
              <input type="number" className={field} value={item.price_max ?? ''}
                onChange={(e) => set({ price_max: e.target.value ? Number(e.target.value) : null })} />
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
