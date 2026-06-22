import { useEffect, useState } from 'react';
import { useCatalogStore } from '../store/useCatalogStore.js';

const field = 'w-full border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-ocar';

export default function Vendors() {
  const { vendors, loaded, load, addVendor, updateVendor, removeVendor } = useCatalogStore();
  const [draft, setDraft] = useState({ name: '', contact: '', notes: '' });

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const save = async () => {
    if (!draft.name.trim()) return;
    await addVendor(draft);
    setDraft({ name: '', contact: '', notes: '' });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">ספקים</h1>
      <p className="text-slate-500 mb-6 text-sm">ספקים שאפשר לשייך לפעילויות בקטלוג ובלו״ז.</p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 grid sm:grid-cols-3 gap-3 items-end">
        <input className={field} placeholder="שם ספק" value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className={field} placeholder="איש קשר / טלפון" value={draft.contact}
          onChange={(e) => setDraft({ ...draft, contact: e.target.value })} />
        <button onClick={save} className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          + הוסף ספק
        </button>
      </div>

      <div className="space-y-2">
        {vendors.map((v) => (
          <div key={v.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <input className={`${field} flex-1`} value={v.name} onChange={(e) => updateVendor(v.id, { name: e.target.value })} />
            <input className={`${field} flex-1`} value={v.contact || ''} placeholder="איש קשר"
              onChange={(e) => updateVendor(v.id, { contact: e.target.value })} />
            <button onClick={() => removeVendor(v.id)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
