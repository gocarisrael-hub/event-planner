import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { whenLabel } from '../utils/format.js';

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.listEvents().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

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

      {loading ? (
        <p className="text-slate-400">טוען…</p>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-500 mb-4">עוד לא בנית אף יום.</p>
          <button onClick={() => navigate('/new')} className="text-ocar font-medium">
            בוא נבנה את הראשון →
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {events.map((ev) => (
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
