import { useEffect, useState } from 'react';
import Categories from './Categories.jsx';
import { api } from '../api/client.js';
import { useCatalogStore } from '../store/useCatalogStore.js';
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

function UsersSection() {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');

  const reload = async () => {
    try {
      setUsers(await api.listUsers());
    } catch {
      // ignore — non-admins never reach this page
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const add = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('יש להזין אימייל וסיסמה.');
      return;
    }
    try {
      await api.createUser({ email: email.trim(), password, role });
      setEmail('');
      setPassword('');
      setRole('viewer');
      reload();
    } catch (e) {
      if (e.serverCode === 'email_exists') setError('האימייל כבר קיים.');
      else setError('יצירת המשתמש נכשלה.');
    }
  };

  const del = async (u) => {
    if (!confirm(`למחוק את המשתמש "${u.email}"?`)) return;
    try {
      await api.deleteUser(u.id);
      reload();
    } catch (e) {
      if (e.serverCode === 'last_admin') alert('לא ניתן למחוק את מנהל המערכת האחרון.');
      else alert('מחיקת המשתמש נכשלה.');
    }
  };

  return (
    <div className="space-y-2">
      {users.map((u) => (
        <div
          key={u.id}
          className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3 flex-wrap"
        >
          <span className="flex-1 min-w-[10rem] text-sm">{u.email}</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              u.role === 'admin' ? 'bg-ocar-soft text-ocar' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {u.role === 'admin' ? 'מנהל' : 'צופה'}
          </span>
          <button
            onClick={() => del(u)}
            className="text-slate-300 hover:text-red-500 px-2"
            aria-label="מחק"
          >
            ✕
          </button>
        </div>
      ))}
      {users.length === 0 && <p className="text-slate-400 text-sm">עוד אין משתמשים.</p>}

      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-3 flex items-center gap-3 flex-wrap">
        <input
          className={`${field} flex-1 min-w-[12rem]`}
          placeholder="אימייל"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={`${field} flex-1 min-w-[10rem]`}
          placeholder="סיסמה"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">צופה</option>
          <option value="admin">מנהל</option>
        </select>
        <button
          onClick={add}
          className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
        >
          + הוסף משתמש
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Small inline manager for a defined list (מרחב / לקוח) — list each item with
// a delete control, plus an add-new input. Mirrors the categories section.
function ListManager({ items, onAdd, onRemove, placeholder, emptyText, confirmText }) {
  const [name, setName] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName('');
  };

  const remove = (item) => {
    if (confirm(confirmText(item.name))) onRemove(item.id);
  };

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex gap-2">
        <input
          className={`${field} flex-1`}
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button onClick={add} className="bg-ocar text-white px-4 rounded-lg text-sm font-medium hover:opacity-90">
          + הוסף
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
            <span className="flex-1 font-medium">{item.name}</span>
            <button onClick={() => remove(item)} className="text-slate-300 hover:text-red-500 px-2">✕</button>
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-400 text-sm">{emptyText}</p>}
      </div>
    </div>
  );
}

function SpacesSection() {
  const { spaces, loaded, load, addSpace, removeSpace } = useCatalogStore();
  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  return (
    <ListManager
      items={spaces}
      onAdd={addSpace}
      onRemove={removeSpace}
      placeholder="שם מרחב חדש"
      emptyText="עוד אין מרחבים."
      confirmText={(n) => `למחוק את המרחב "${n}"?`}
    />
  );
}

function ClientsSection() {
  const { clients, loaded, load, addClient, removeClient } = useCatalogStore();
  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  return (
    <ListManager
      items={clients}
      onAdd={addClient}
      onRemove={removeClient}
      placeholder="שם לקוח חדש"
      emptyText="עוד אין לקוחות."
      confirmText={(n) => `למחוק את הלקוח "${n}"?`}
    />
  );
}

export default function Settings() {
  return (
    <div dir="rtl" className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">הגדרות</h1>

      <section className="mb-12">
        <Categories />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-1">מרחב</h2>
        <p className="text-slate-500 mb-4 text-sm">
          הרשימה המוגדרת לבחירת מרחב בפעילויות הקטלוג. אפשר להוסיף ולהסיר.
        </p>
        <SpacesSection />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-1">לקוח</h2>
        <p className="text-slate-500 mb-4 text-sm">
          הרשימה המוגדרת לבחירת לקוח בימים. אפשר להוסיף ולהסיר.
        </p>
        <ClientsSection />
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-bold mb-1">סטטוסים</h2>
        <p className="text-slate-500 mb-4 text-sm">
          הסטטוסים שאפשר לשייך לימים. אפשר לערוך שם, צבע, סדר, להוסיף ולמחוק.
        </p>
        <StatusesSection />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-1">משתמשים</h2>
        <p className="text-slate-500 mb-4 text-sm">
          ניהול חשבונות גישה. מנהל — גישה מלאה; צופה — רק עמוד הסטטוס.
        </p>
        <UsersSection />
      </section>
    </div>
  );
}
