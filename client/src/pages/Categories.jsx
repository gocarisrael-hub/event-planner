import { useEffect, useState } from 'react';
import { useCatalogStore } from '../store/useCatalogStore.js';

const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ocar';

export default function Categories() {
  const { categories, catalog, loaded, load, addCategory, removeCategory } = useCatalogStore();
  const [name, setName] = useState('');

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  const add = async () => {
    if (!name.trim()) return;
    await addCategory(name.trim());
    setName('');
  };

  const countFor = (catName) => catalog.filter((c) => c.category === catName).length;

  const remove = async (cat) => {
    const used = countFor(cat.name);
    const msg = used
      ? `הקטגוריה "${cat.name}" משויכת ל-${used} פעילויות. למחוק את הקטגוריה? (הפעילויות יישארו)`
      : `למחוק את הקטגוריה "${cat.name}"?`;
    if (confirm(msg)) removeCategory(cat.id);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">קטגוריות</h1>
      <p className="text-slate-500 mb-6 text-sm">
        הרשימה המוגדרת לבחירה בפעילויות — ולסינון הקטלוג. אפשר להוסיף ולהסיר.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex gap-2">
        <input className={`${field} flex-1`} placeholder="שם קטגוריה חדשה" value={name}
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button onClick={add} className="bg-ocar text-white px-4 rounded-lg text-sm font-medium hover:opacity-90">
          + הוסף
        </button>
      </div>

      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <span className="flex-1 font-medium">{cat.name}</span>
            <span className="text-xs text-slate-400">{countFor(cat.name)} פעילויות</span>
            <button onClick={() => remove(cat)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
          </div>
        ))}
        {categories.length === 0 && <p className="text-slate-400 text-sm">עוד אין קטגוריות.</p>}
      </div>
    </div>
  );
}
