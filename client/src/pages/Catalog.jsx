import { useEffect, useMemo, useState } from 'react';
import CategorySelect from '../components/CategorySelect.jsx';
import PhotoUploader from '../components/PhotoUploader.jsx';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { formatDuration, formatPrice } from '../utils/format.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';
const blank = {
  title: '', description: '', category: '',
  default_duration_hours: '', default_price: '',
  contact_name: '', contact_phone: '', location: '', photos: [],
};

export default function Catalog() {
  const { catalog, categories, loaded, load, addCatalog, updateCatalog, removeCatalog } =
    useCatalogStore();
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null); // id
  const [filter, setFilter] = useState(''); // category filter
  const [locFilter, setLocFilter] = useState(''); // location (מרחב) filter

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const numify = (d) => ({
    ...d,
    default_duration_hours: d.default_duration_hours ? Number(d.default_duration_hours) : null,
    default_price: d.default_price ? Number(d.default_price) : null,
  });

  const save = async () => {
    if (!draft.title.trim()) return;
    await addCatalog(numify(draft));
    setDraft(blank);
  };

  const locations = useMemo(
    () => [...new Set(catalog.map((c) => c.location).filter((l) => l && l.trim()))].sort((a, b) => a.localeCompare(b)),
    [catalog]
  );

  const shown = useMemo(
    () =>
      catalog.filter(
        (c) => (!filter || c.category === filter) && (!locFilter || c.location === locFilter)
      ),
    [catalog, filter, locFilter]
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">קטלוג פעילויות</h1>
      <p className="text-slate-500 mb-6 text-sm">
        כל פעילות שתוסיף ביום נשמרת כאן אוטומטית. אפשר גם להוסיף ידנית עם איש קשר, טלפון, מחיר, משך ותמונות.
      </p>

      {/* Add new */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input className={field} placeholder="שם פעילות" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <CategorySelect value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
        </div>
        <textarea className={field} rows={3} placeholder="תיאור" value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <input type="number" step="0.5" min="0" className={field} placeholder="משך (שעות)" value={draft.default_duration_hours}
            onChange={(e) => setDraft({ ...draft, default_duration_hours: e.target.value })} />
          <input type="number" className={field} placeholder="מחיר (₪)" value={draft.default_price}
            onChange={(e) => setDraft({ ...draft, default_price: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className={field} placeholder="איש קשר" value={draft.contact_name}
            onChange={(e) => setDraft({ ...draft, contact_name: e.target.value })} />
          <input className={field} placeholder="טלפון" value={draft.contact_phone}
            onChange={(e) => setDraft({ ...draft, contact_phone: e.target.value })} />
        </div>
        <input className={field} placeholder="מרחב" value={draft.location}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
        <PhotoUploader photos={draft.photos} onChange={(photos) => setDraft({ ...draft, photos })} small />
        <button onClick={save} className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          + הוסף לקטלוג
        </button>
      </div>

      {/* Filter by category */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-sm text-slate-500">סינון:</span>
        <button onClick={() => setFilter('')}
          className={`px-3 py-1 rounded-full text-sm ${filter === '' ? 'bg-ocar text-white' : 'bg-white border border-slate-200'}`}>
          הכל
        </button>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setFilter(c.name)}
            className={`px-3 py-1 rounded-full text-sm ${filter === c.name ? 'bg-ocar text-white' : 'bg-white border border-slate-200'}`}>
            {c.name}
          </button>
        ))}
      </div>

      {/* Filter by location (מרחב) */}
      {locations.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-slate-500">מרחב:</span>
          <button onClick={() => setLocFilter('')}
            className={`px-3 py-1 rounded-full text-sm ${locFilter === '' ? 'bg-ocar text-white' : 'bg-white border border-slate-200'}`}>
            הכל
          </button>
          {locations.map((loc) => (
            <button key={loc} onClick={() => setLocFilter(loc)}
              className={`px-3 py-1 rounded-full text-sm ${locFilter === loc ? 'bg-ocar text-white' : 'bg-white border border-slate-200'}`}>
              {loc}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
            {editing === c.id ? (
              <div className="space-y-2">
                <input className={field} value={c.title} onChange={(e) => updateCatalog(c.id, { title: e.target.value })} />
                <textarea className={field} rows={3} value={c.description || ''} placeholder="תיאור"
                  onChange={(e) => updateCatalog(c.id, { description: e.target.value })} />
                <CategorySelect value={c.category} onChange={(category) => updateCatalog(c.id, { category })} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.5" min="0" className={field} value={c.default_duration_hours ?? ''} placeholder="שעות"
                    onChange={(e) => updateCatalog(c.id, { default_duration_hours: e.target.value ? Number(e.target.value) : null })} />
                  <input type="number" className={field} value={c.default_price ?? ''} placeholder="מחיר (₪)"
                    onChange={(e) => updateCatalog(c.id, { default_price: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={field} value={c.contact_name || ''} placeholder="איש קשר"
                    onChange={(e) => updateCatalog(c.id, { contact_name: e.target.value })} />
                  <input className={field} value={c.contact_phone || ''} placeholder="טלפון"
                    onChange={(e) => updateCatalog(c.id, { contact_phone: e.target.value })} />
                </div>
                <input className={field} value={c.location || ''} placeholder="מרחב"
                  onChange={(e) => updateCatalog(c.id, { location: e.target.value })} />
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
                  {formatDuration(c.default_duration_hours) && <span>{formatDuration(c.default_duration_hours)}</span>}
                  {formatPrice(c.default_price) && <span>{formatPrice(c.default_price)}</span>}
                  {c.contact_name && <span>· {c.contact_name}</span>}
                  {c.contact_phone && <span>· {c.contact_phone}</span>}
                  {c.location && <span>· 📍 {c.location}</span>}
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
