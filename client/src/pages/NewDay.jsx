import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { MONTHS, SEASONS } from '../utils/format.js';

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ocar';

export default function NewDay() {
  const navigate = useNavigate();
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

  const submit = async (e) => {
    e.preventDefault();
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
            <input className={field} value={form.client_name} onChange={(e) => set('client_name', e.target.value)}
              placeholder="שם החברה / היחידה" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">גודל הקבוצה</span>
            <input type="number" className={field} value={form.group_size}
              onChange={(e) => set('group_size', e.target.value)} placeholder="למשל 40" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">תקציב (₪)</span>
            <input type="number" className={field} value={form.budget}
              onChange={(e) => set('budget', e.target.value)} placeholder="סה״כ או לראש" />
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
            <input type="date" className={field} value={form.target_date}
              onChange={(e) => set('target_date', e.target.value)} />
          )}
          {whenMode === 'month' && (
            <select className={field} value={form.target_month} onChange={(e) => set('target_month', e.target.value)}>
              <option value="">בחר חודש…</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {whenMode === 'season' && (
            <select className={field} value={form.target_season} onChange={(e) => set('target_season', e.target.value)}>
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
