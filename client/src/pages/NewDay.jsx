import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useUnsavedStore } from '../store/useUnsavedStore.js';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { MONTHS, SEASONS } from '../utils/format.js';
import DatePicker from '../components/DatePicker.jsx';
import ClientSelect from '../components/ClientSelect.jsx';

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ocar';

// Larger, cleaner controls for the "מתי?" section (date / month / season).
const whenField =
  'w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-white text-slate-800 ' +
  'transition-colors focus:outline-none focus:border-ocar focus:ring-2 focus:ring-ocar/30 ' +
  'cursor-pointer [color-scheme:light] [&::-webkit-calendar-picker-indicator]:cursor-pointer ' +
  '[&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:hover:opacity-100';

export default function NewDay() {
  const navigate = useNavigate();
  const setDirty = useUnsavedStore((s) => s.setDirty);
  const loaded = useCatalogStore((s) => s.loaded);
  const loadCatalog = useCatalogStore((s) => s.load);
  const [whenMode, setWhenMode] = useState('date'); // date | month | season
  const [form, setForm] = useState({
    title: '',
    client_name: '',
    group_size: '',
    audience: '',
    requests: '',
    budget: '',
    target_date: '',
    target_month: '',
    target_season: '',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Ensure the defined client (לקוח) list is available for ClientSelect.
  useEffect(() => { if (!loaded) loadCatalog(); }, [loaded, loadCatalog]);

  // Mark the page as dirty whenever any field has content; clear when empty.
  useEffect(() => {
    const hasContent = Object.values(form).some((v) => String(v).trim() !== '');
    setDirty(hasContent);
  }, [form, setDirty]);

  // Leaving the page normally (unmount) clears the flag.
  useEffect(() => () => setDirty(false), [setDirty]);

  const submit = async (e) => {
    e.preventDefault();
    setDirty(false);
    const payload = {
      ...form,
      group_size: form.group_size ? Number(form.group_size) : null,
      budget: form.budget ? Number(form.budget) : null,
      target_date: whenMode === 'date' ? form.target_date || null : null,
      target_month: whenMode === 'month' ? form.target_month || null : null,
      target_season: whenMode === 'season' ? form.target_season || null : null,
      title: form.title || `יום עבור ${form.client_name || 'לקוח'}`,
    };
    const ev = await api.createEvent(payload);
    navigate(`/day/${ev.id}`);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">יום חדש</h1>
      <p className="text-slate-500 mb-6">כמה משפטים על הקבוצה — ואז מתחילים לבנות את הלו״ז.</p>

      <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium">שם היום / כותרת</span>
            <input className={field} value={form.title} onChange={(e) => set('title', e.target.value)}
              placeholder="יום גיבוש לחברת…" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">לקוח</span>
            <ClientSelect className={field} value={form.client_name} onChange={(v) => set('client_name', v)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">גודל הקבוצה</span>
            <input type="number" className={field} value={form.group_size}
              onChange={(e) => set('group_size', e.target.value)} placeholder="למשל 40" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">תקציב לראש (₪)</span>
            <input type="number" className={field} value={form.budget}
              onChange={(e) => set('budget', e.target.value)} placeholder="כמה לאדם" />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">מי הם?</span>
          <input className={field} value={form.audience} onChange={(e) => set('audience', e.target.value)}
            placeholder="צוות פיתוח / יחידה צבאית / הנהלה…" />
        </label>

        <label className="block">
          <span className="text-sm font-medium">מה הם רוצים? (כמה משפטים)</span>
          <textarea className={field} rows={3} value={form.requests}
            onChange={(e) => set('requests', e.target.value)}
            placeholder="אווירה, סוג הפעילויות, אוכל, דגשים…" />
        </label>

        <div>
          <span className="text-sm font-medium">מתי?</span>
          <div className="flex gap-2 mt-1 mb-2">
            {[['date', 'תאריך'], ['month', 'חודש'], ['season', 'עונה']].map(([m, label]) => (
              <button type="button" key={m} onClick={() => setWhenMode(m)}
                className={`px-3 py-1 rounded-lg text-sm ${whenMode === m ? 'bg-ocar text-white' : 'bg-slate-100'}`}>
                {label}
              </button>
            ))}
          </div>
          {whenMode === 'date' && (
            <DatePicker value={form.target_date} onChange={(v) => set('target_date', v)} />
          )}
          {whenMode === 'month' && (
            <select className={whenField} value={form.target_month} onChange={(e) => set('target_month', e.target.value)}>
              <option value="">בחר חודש…</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {whenMode === 'season' && (
            <select className={whenField} value={form.target_season} onChange={(e) => set('target_season', e.target.value)}>
              <option value="">בחר עונה…</option>
              {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="bg-ocar text-white px-5 py-2 rounded-lg font-medium hover:opacity-90">
            בונים את היום →
          </button>
          <button type="button" onClick={() => navigate('/')} className="px-5 py-2 rounded-lg text-slate-500">
            ביטול
          </button>
        </div>
      </form>
    </div>
  );
}
