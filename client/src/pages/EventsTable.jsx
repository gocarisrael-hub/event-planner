import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { brand } from '../brand/brand.js';
import { whenLabel } from '../utils/format.js';
import StatusSelect from '../components/StatusSelect.jsx';
import { useStatusStore } from '../store/useStatusStore.js';

export default function EventsTable() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  // Ensure dynamic statuses are loaded so the pills resolve labels/colors.
  const statusesLoaded = useStatusStore((s) => s.loaded);
  const loadStatuses = useStatusStore((s) => s.load);

  useEffect(() => {
    if (!statusesLoaded) loadStatuses();
  }, [statusesLoaded, loadStatuses]);

  useEffect(() => {
    api.listEvents().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) => {
      const fields = [ev.title, ev.client_name, ev.audience];
      return fields.some((f) => (f || '').toLowerCase().includes(q));
    });
  }, [events, query]);

  // Optimistically update the row's status, then PATCH it via the api.
  const changeStatus = async (id, status) => {
    const prev = events;
    setEvents((list) => list.map((ev) => (ev.id === id ? { ...ev, status } : ev)));
    try {
      await api.updateEvent(id, { status });
    } catch {
      setEvents(prev); // roll back on failure
    }
  };

  // Format the linked email's sent date (ISO) as he-IL date + time.
  const mailDate = (ev) => {
    const d = ev.email?.date;
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return (
      dt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' · ' +
      dt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    );
  };

  return (
    <div dir="rtl">
      <h1 className="text-2xl font-bold mb-6">סטטוס ימים</h1>

      {!loading && events.length > 0 && (
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם היום או הצוות…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-6 focus:outline-none focus:border-ocar"
        />
      )}

      {loading ? (
        <p className="text-slate-400">טוען…</p>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-500">עוד לא בנית אף יום.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-slate-500">לא נמצאו ימים שמתאימים לחיפוש.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="px-4 py-3 font-medium">שם היום</th>
                <th className="px-4 py-3 font-medium">לקוח</th>
                <th className="px-4 py-3 font-medium">מתי</th>
                <th className="px-4 py-3 font-medium">סטטוס</th>
                <th className="px-4 py-3 font-medium">מייל</th>
                <th className="px-4 py-3 font-medium">נשלח</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/day/${ev.id}`} className="font-medium text-slate-800 hover:text-ocar">
                      {ev.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ev.client_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{whenLabel(ev) || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusSelect value={ev.status} onChange={(s) => changeStatus(ev.id, s)} />
                  </td>
                  <td className="px-4 py-3">
                    {ev.email?.message_id ? (
                      <a
                        href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(brand.gmailAccount)}#all/${ev.email.message_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ocar hover:underline whitespace-nowrap"
                      >
                        פתח מייל
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{mailDate(ev)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/day/${ev.id}`} className="text-ocar font-medium hover:underline">
                      פתח
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
