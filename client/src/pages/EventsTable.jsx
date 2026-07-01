import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { brand } from '../brand/brand.js';
import { whenLabel } from '../utils/format.js';
import StatusSelect from '../components/StatusSelect.jsx';
import { useStatusStore } from '../store/useStatusStore.js';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import { statusLabel, statusBadgeClass } from '../utils/status.js';

export default function EventsTable() {
  const role = useAuthStore((s) => s.role);
  const isViewer = role === 'viewer';
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState(''); // '' = all owners
  const [sortKey, setSortKey] = useState('sent'); // default sort by נשלח
  const [sortDir, setSortDir] = useState('desc');

  // Ensure dynamic statuses are loaded so the pills resolve labels/colors.
  const statusesLoaded = useStatusStore((s) => s.loaded);
  const loadStatuses = useStatusStore((s) => s.load);
  const statuses = useStatusStore((s) => s.statuses);

  // Managed אחראי list (for the filter dropdown options).
  const catalogLoaded = useCatalogStore((s) => s.loaded);
  const loadCatalog = useCatalogStore((s) => s.load);
  const owners = useCatalogStore((s) => s.owners);

  useEffect(() => {
    if (!statusesLoaded) loadStatuses();
  }, [statusesLoaded, loadStatuses]);

  useEffect(() => {
    if (!catalogLoaded) loadCatalog();
  }, [catalogLoaded, loadCatalog]);

  useEffect(() => {
    api.listEvents().then((e) => {
      setEvents(e);
      setLoading(false);
    });
  }, []);

  // Owner filter options: managed owners store + any legacy distinct ev.owner
  // values not already in the list.
  const ownerOptions = useMemo(() => {
    const names = new Set(owners.map((o) => o.name));
    for (const ev of events) {
      const o = (ev.owner || '').trim();
      if (o) names.add(o);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'he', { sensitivity: 'base' }));
  }, [owners, events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (ownerFilter && (ev.owner || '') !== ownerFilter) return false;
      if (q) {
        const fields = [ev.title, ev.client_name, ev.audience];
        if (!fields.some((f) => (f || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [events, query, ownerFilter]);

  // Toggle sorting: same key flips direction; a new key starts ascending.
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Per-column sort comparator. Nullish/empty values always sort last,
  // regardless of direction.
  const sorted = useMemo(() => {
    const statusOrder = (id) => {
      const s = statuses.find((x) => x.id === id);
      return s && s.order != null ? s.order : Number.MAX_SAFE_INTEGER;
    };
    const epoch = (d) => {
      if (!d) return null;
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? null : t;
    };

    // Returns a sort value for the active key; null means "empty → last".
    const valueOf = (ev) => {
      switch (sortKey) {
        case 'title':
          return ev.title ? ev.title : null;
        case 'client_name':
          return ev.client_name ? ev.client_name : null;
        case 'owner':
          return ev.owner ? ev.owner : null;
        case 'when':
          return epoch(ev.target_date);
        case 'status':
          return statusOrder(ev.status);
        case 'sent':
          return epoch(ev.emails?.[ev.emails.length - 1]?.date);
        default:
          return null;
      }
    };

    const dir = sortDir === 'asc' ? 1 : -1;
    const isText = sortKey === 'title' || sortKey === 'client_name' || sortKey === 'owner';

    return [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      // Push nullish to the bottom in both directions.
      const aNull = av == null;
      const bNull = bv == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (isText) return dir * av.localeCompare(bv, 'he', { sensitivity: 'base' });
      return dir * (av - bv);
    });
  }, [filtered, sortKey, sortDir, statuses]);

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

  // Format the latest linked email's sent date (ISO) as he-IL date + time.
  const mailDate = (ev) => {
    const list = ev.emails || [];
    const d = list[list.length - 1]?.date;
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
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם היום או הצוות…"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ocar"
          />
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 sm:min-w-[12rem] focus:outline-none focus:border-ocar"
          >
            <option value="">כל האחראים</option>
            {ownerOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
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
                <SortHeader label="שם היום" sortKey="title" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="לקוח" sortKey="client_name" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="אחראי" sortKey="owner" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="מתי" sortKey="when" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortHeader label="סטטוס" sortKey="status" active={sortKey} dir={sortDir} onSort={toggleSort} />
                <th className="px-4 py-3 font-medium">מייל</th>
                <SortHeader label="נשלח" sortKey="sent" active={sortKey} dir={sortDir} onSort={toggleSort} />
                {!isViewer && <th className="px-4 py-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    {isViewer ? (
                      <span className="font-medium text-slate-800">{ev.title}</span>
                    ) : (
                      <Link to={`/day/${ev.id}`} className="font-medium text-slate-800 hover:text-ocar">
                        {ev.title}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ev.client_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{ev.owner || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{whenLabel(ev) || '—'}</td>
                  <td className="px-4 py-3">
                    {isViewer ? (
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${statusBadgeClass(statuses, ev.status)}`}
                      >
                        {statusLabel(statuses, ev.status)}
                      </span>
                    ) : (
                      <StatusSelect value={ev.status} onChange={(s) => changeStatus(ev.id, s)} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isViewer ? (
                      <span className="text-slate-600">{ev.emails?.[0]?.subject || '—'}</span>
                    ) : ev.emails?.[0]?.message_id ? (
                      <span className="whitespace-nowrap">
                        <a
                          href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(brand.gmailAccount)}#all/${ev.emails[0].message_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ocar hover:underline"
                        >
                          פתח מייל
                        </a>
                        {ev.emails.length > 1 && (
                          <span className="text-slate-400 mr-1">+{ev.emails.length - 1}</span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{mailDate(ev)}</td>
                  {!isViewer && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link to={`/day/${ev.id}`} className="text-ocar font-medium hover:underline">
                        פתח
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// A clickable column header (full cell) showing the label plus a subtle sort
// arrow: faint ↕ when inactive, ↑ for ascending, ↓ for descending. RTL-correct.
function SortHeader({ label, sortKey, active, dir, onSort }) {
  const isActive = active === sortKey;
  const arrow = isActive ? (dir === 'asc' ? '↑' : '↓') : '↕';
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`מיון לפי ${label}`}
        className="inline-flex items-center gap-1 font-medium hover:text-slate-700 transition cursor-pointer"
      >
        <span>{label}</span>
        <span className={isActive ? 'text-ocar' : 'text-slate-300'} aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}
