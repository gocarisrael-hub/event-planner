import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { whenLabel } from '../utils/format.js';
import { useCatalogStore } from '../store/useCatalogStore.js';

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [client, setClient] = useState('');
  const navigate = useNavigate();

  const clients = useCatalogStore((s) => s.clients);
  const catalogLoaded = useCatalogStore((s) => s.loaded);
  const loadCatalog = useCatalogStore((s) => s.load);

  useEffect(() => {
    api.listEvents().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!catalogLoaded) loadCatalog();
  }, [catalogLoaded, loadCatalog]);

  // Client options: the managed clients list, plus any legacy client_name
  // values present on events that aren't in the managed list.
  const clientOptions = useMemo(() => {
    const names = new Set(clients.map((c) => c.name).filter(Boolean));
    for (const ev of events) {
      if (ev.client_name && ev.client_name.trim()) names.add(ev.client_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'he'));
  }, [clients, events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (client && ev.client_name !== client) return false;
      if (!q) return true;
      const fields = [ev.title, ev.client_name, ev.audience];
      return fields.some((f) => (f || '').toLowerCase().includes(q));
    });
  }, [events, query, client]);

  const remove = async (e, id) => {
    e.preventDefault();
    if (!confirm('למחוק את היום הזה?')) return;
    await api.deleteEvent(id);
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">הימים שלי</h1>
        <button
          onClick={() => navigate('/new')}
          className="bg-ocar text-white px-4 py-2 rounded-lg font-medium hover:opacity-90"
        >
          + יום חדש
        </button>
      </div>

      {!loading && events.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם היום או הצוות…"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ocar"
          />
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className="sm:w-56 border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-ocar"
          >
            <option value="">כל הלקוחות</option>
            {clientOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">טוען…</p>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-500 mb-4">עוד לא בנית אף יום.</p>
          <button onClick={() => navigate('/new')} className="text-ocar font-medium">
            בוא נבנה את הראשון →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-500">
            {client && !query.trim()
              ? `לא נמצאו ימים עבור הלקוח ${client}.`
              : 'לא נמצאו ימים שמתאימים לסינון.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((ev) => (
            <Link
              key={ev.id}
              to={`/day/${ev.id}`}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-ocar transition group"
            >
              <div className="flex items-start justify-between">
                <h2 className="font-bold text-lg group-hover:text-ocar">{ev.title}</h2>
                <button
                  onClick={(e) => remove(e, ev.id)}
                  className="text-slate-300 hover:text-red-500 text-sm"
                  title="מחיקה"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {ev.client_name && `${ev.client_name} · `}
                {ev.group_size ? `${ev.group_size} משתתפים` : ''}
              </p>
              <div className="flex gap-2 mt-3 text-xs text-slate-400">
                {whenLabel(ev) && <span className="bg-slate-100 px-2 py-1 rounded">{whenLabel(ev)}</span>}
                <span className="bg-slate-100 px-2 py-1 rounded">{ev.items?.length || 0} פעילויות</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
