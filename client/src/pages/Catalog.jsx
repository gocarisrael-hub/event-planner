import { useEffect, useState } from 'react';
import PhotoUploader from '../components/PhotoUploader.jsx';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { formatDuration, formatPrice } from '../utils/format.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';
const blank = {
  title: '', description: '', category: '',
  default_duration_min: '', default_price_min: '', default_price_max: '', vendor_id: '', photos: [],
};

export default function Catalog() {
  const { catalog, vendors, loaded, load, addCatalog, updateCatalog, removeCatalog, vendorName } =
    useCatalogStore();
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null); // id

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const numify = (d) => ({
    ...d,
    default_duration_min: d.default_duration_min ? Number(d.default_duration_min) : null,
    default_price_min: d.default_price_min ? Number(d.default_price_min) : null,
    default_price_max: d.default_price_max ? Number(d.default_price_max) : null,
    vendor_id: d.vendor_id || null,
  });

  const save = async () => {
    if (!draft.title.trim()) return;
    await addCatalog(numify(draft));
    setDraft(blank);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">קטלוג פעילויות</h1>
      <p className="text-slate-500 mb-6 text-sm">
        כל פעילות שתוסיף ביום נשמרת כאן אוטומטית. אפשר גם להוסיף ידנית עם מחיר, משך ותמונות.
      </p>

      {/* Add new */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input className={field} placeholder="שם פעילות" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className={field} placeholder="קטגוריה (אוכל / אטרקציה…)" value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
        </div>
        <input className={field} placeholder="תיאור" value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <input type="number" className={field} placeholder="משך (דק')" value={draft.default_duration_min}
            onChange={(e) => setDraft({ ...draft, default_duration_min: e.target.value })} />
          <input type="number" className={field} placeholder="מחיר מ־" value={draft.default_price_min}
            onChange={(e) => setDraft({ ...draft, default_price_min: e.target.value })} />
          <input type="number" className={field} placeholder="מחיר עד" value={draft.default_price_max}
            onChange={(e) => setDraft({ ...draft, default_price_max: e.target.value })} />
          <select className={field} value={draft.vendor_id}
            onChange={(e) => setDraft({ ...draft, vendor_id: e.target.value })}>
            <option value="">ספק…</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <PhotoUploader photos={draft.photos} onChange={(photos) => setDraft({ ...draft, photos })} small />
        <button onClick={save} className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          + הוסף לקטלוג
        </button>
      </div>

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2">
        {catalog.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
            {editing === c.id ? (
              <div className="space-y-2">
                <input className={field} value={c.title} onChange={(e) => updateCatalog(c.id, { title: e.target.value })} />
                <input className={field} value={c.description || ''} placeholder="תיאור"
                  onChange={(e) => updateCatalog(c.id, { description: e.target.value })} />
                <div className="grid grid-cols-3 gap-2">
                  <input type="number" className={field} value={c.default_duration_min ?? ''} placeholder="דק'"
                    onChange={(e) => updateCatalog(c.id, { default_duration_min: e.target.value ? Number(e.target.value) : null })} />
                  <input type="number" className={field} value={c.default_price_min ?? ''} placeholder="מ־"
                    onChange={(e) => updateCatalog(c.id, { default_price_min: e.target.value ? Number(e.target.value) : null })} />
                  <input type="number" className={field} value={c.default_price_max ?? ''} placeholder="עד"
                    onChange={(e) => updateCatalog(c.id, { default_price_max: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <PhotoUploader photos={c.photos || []} onChange={(photos) => updateCatalog(c.id, { photos })} small />
                <button onClick={() => setEditing(null)} className="text-ocar text-sm font-medium">סיום</button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{c.title}</h3>
                    {c.category && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{c.category}</span>}
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => setEditing(c.id)} className="text-slate-400 hover:text-ocar">ערוך</button>
                    <button onClick={() => removeCatalog(c.id)} className="text-slate-300 hover:text-red-500">✕</button>
                  </div>
                </div>
                {c.description && <p className="text-sm text-slate-500 mt-1">{c.description}</p>}
                <div className="flex gap-2 mt-2 text-xs text-slate-400 flex-wrap">
                  {formatDuration(c.default_duration_min) && <span>{formatDuration(c.default_duration_min)}</span>}
                  {formatPrice(c.default_price_min, c.default_price_max) && <span>{formatPrice(c.default_price_min, c.default_price_max)}</span>}
                  {c.vendor_id && <span>· {vendorName(c.vendor_id)}</span>}
                </div>
                {c.photos?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {c.photos.slice(0, 4).map((p, i) => (
                      <img key={i} src={p} alt="" className="h-12 w-12 rounded object-cover" />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
