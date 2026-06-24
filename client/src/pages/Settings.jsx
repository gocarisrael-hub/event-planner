import { useEffect, useState } from 'react';
import Categories from './Categories.jsx';
import { useStatusStore } from '../store/useStatusStore.js';
import { COLORS, COLOR_MAP, statusBadgeClass, statusDotClass } from '../utils/status.js';

const field = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ocar';

// Row of color swatches; calls onPick(name) when one is chosen.
function ColorPicker({ value, onPick }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {COLORS.map((name) => (
        <button
          key={name}
          type="button"
          aria-label={name}
          title={name}
          onClick={() => onPick(name)}
          className={`w-5 h-5 rounded-full ${COLOR_MAP[name].dot} transition ${
            value === name ? 'ring-2 ring-offset-1 ring-slate-500' : 'hover:scale-110'
          }`}
        />
      ))}
    </div>
  );
}

function StatusRow({ status, index, total, onMove }) {
  const update = useStatusStore((s) => s.update);
  const remove = useStatusStore((s) => s.remove);
  const [label, setLabel] = useState(status.label);

  useEffect(() => setLabel(status.label), [status.label]);

  const saveLabel = () => {
    const next = label.trim();
    if (next && next !== status.label) update(status.id, { label: next });
    else setLabel(status.label);
  };

  const del = () => {
    if (total <= 1) {
      alert('חייב להישאר לפחות סטטוס אחד.');
      return;
    }
    if (confirm(`למחוק את הסטטוס "${status.label}"?`)) remove(status.id);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 flex-wrap">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${statusBadgeClass(
          [status],
          status.id
        )}`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDotClass([status], status.id)}`} />
        {status.label || '—'}
      </span>

      <input
        className={`${field} flex-1 min-w-[10rem]`}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={saveLabel}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />

      <ColorPicker value={status.color} onPick={(color) => update(status.id, { color })} />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          className="text-slate-400 hover:text-ocar disabled:opacity-30 disabled:hover:text-slate-400 px-1"
          aria-label="העלה"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          className="text-slate-400 hover:text-ocar disabled:opacity-30 disabled:hover:text-slate-400 px-1"
          aria-label="הורד"
        >
          ▼
        </button>
      </div>

      <button onClick={del} className="text-slate-300 hover:text-red-500 px-2" aria-label="מחק">
        ✕
      </button>
    </div>
  );
}

function StatusesSection() {
  const { statuses, loaded, load, add, update } = useStatusStore();
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const addStatus = async () => {
    if (!newLabel.trim()) return;
    await add(newLabel.trim(), newColor);
    setNewLabel('');
    setNewColor(COLORS[0]);
  };

  // Reorder by swapping the `order` values of two adjacent statuses.
  const move = async (index, dir) => {
    const a = statuses[index];
    const b = statuses[index + dir];
    if (!a || !b) return;
    await Promise.all([update(a.id, { order: b.order }), update(b.id, { order: a.order })]);
  };

  return (
    <div className="space-y-2">
      {statuses.map((s, i) => (
        <StatusRow key={s.id} status={s} index={i} total={statuses.length} onMove={move} />
      ))}
      {statuses.length === 0 && <p className="text-slate-400 text-sm">עוד אין סטטוסים.</p>}

      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-3 flex items-center gap-3 flex-wrap">
        <input
          className={`${field} flex-1 min-w-[10rem]`}
          placeholder="שם סטטוס חדש"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStatus()}
        />
        <ColorPicker value={newColor} onPick={setNewColor} />
        <button
          onClick={addStatus}
          className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          + הוסף סטטוס
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <div dir="rtl" className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">הגדרות</h1>

      <section className="mb-12">
        <Categories />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-1">סטטוסים</h2>
        <p className="text-slate-500 mb-4 text-sm">
          הסטטוסים שאפשר לשייך לימים. אפשר לערוך שם, צבע, סדר, להוסיף ולמחוק.
        </p>
        <StatusesSection />
      </section>
    </div>
  );
}
