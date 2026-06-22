import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import AddActivityRow from '../components/AddActivityRow.jsx';
import BudgetMeter from '../components/BudgetMeter.jsx';
import TimelineItem from '../components/TimelineItem.jsx';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { useEventStore } from '../store/useEventStore.js';
import { formatPrice, formatRange, timingLabel, whenLabel } from '../utils/format.js';
import {
  DAY_START_MIN,
  DAY_END_MIN,
  HOUR_PX,
  TRACK_PX,
  clampMin,
  durationToHeight,
  hourMarks,
  minutesToStart,
  minutesToTop,
  startToMinutes,
  topToMinutes,
} from '../utils/timeline.js';

const DEFAULT_DURATION = 1; // hours, for items added without one

// Per-head price range contributed by a single choice block.
function optionRange(options) {
  const prices = options.map((o) => Number(o.price) || 0);
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

// A positioned, draggable block on the timeline. Dragging changes the item's
// start time (vertical only, snapped + clamped); clicking opens the editor.
function TimelineBlock({ item, onDragStart, onClick, dragging, top }) {
  const options = item.options || [];
  const hasOptions = options.length > 0;
  const height = durationToHeight(item.approx_duration_hours);
  const range = hasOptions ? optionRange(options) : null;
  const compact = height < 56;

  return (
    <div
      className={`absolute right-0 left-2 rounded-lg border bg-white px-3 py-1.5 overflow-hidden select-none ${
        dragging ? 'z-30 shadow-lg border-ocar ring-2 ring-ocar/30 cursor-grabbing' : 'z-10 border-slate-200 shadow-sm hover:border-ocar cursor-grab'
      }`}
      style={{ top, height }}
      onPointerDown={(e) => onDragStart(e, item)}
      onClick={onClick}
      title="גרור כדי לשנות שעה · לחיצה לעריכה"
    >
      <div className={`flex items-start gap-2 ${compact ? 'items-center' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate flex items-center gap-2">
            {item.title}
            {hasOptions && (
              <span className="text-[10px] font-medium bg-ocar-soft text-ocar rounded-full px-1.5 py-0.5 whitespace-nowrap">
                אפשרויות: {options.length}
              </span>
            )}
          </div>
          <div className="text-[11px] text-ocar font-medium"><bdi>{timingLabel(item) || '—'}</bdi></div>
          {!compact && item.description && (
            <div className="text-[11px] text-slate-500 line-clamp-1 break-words">{item.description}</div>
          )}
        </div>
        {!hasOptions && item.photos?.[0] && !compact && (
          <img src={item.photos[0]} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0" />
        )}
        <div className="text-[11px] text-slate-600 whitespace-nowrap flex-shrink-0">
          {hasOptions ? formatRange(range.low, range.high) : formatPrice(item.price) || ''}
        </div>
      </div>
    </div>
  );
}

export default function DayBuilder() {
  const { id } = useParams();
  const { event, items, loading, load, addItem, updateItem, removeItem } = useEventStore();
  const loadCatalog = useCatalogStore((s) => s.load);
  const refreshCatalog = useCatalogStore((s) => s.refresh);

  const [draftPending, setDraftPending] = useState(false);
  const [draftLink, setDraftLink] = useState('');
  const [draftError, setDraftError] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Transient drag state: which item, its live top (px), and whether a real
  // drag happened (to suppress the click-to-edit on release).
  const [drag, setDrag] = useState(null); // { id, top }
  const dragRef = useRef(null); // { id, startY, startTop, dur, moved }
  const trackRef = useRef(null);

  useEffect(() => { load(id); }, [id]);
  useEffect(() => { loadCatalog(); }, []);

  // Legacy/edge items without a start: stack them onto the timeline so every
  // item is positioned. Runs once after items load.
  const seeded = useRef(false);
  useEffect(() => {
    if (loading || !event || seeded.current) return;
    seeded.current = true;
    let cursor = DAY_START_MIN;
    for (const it of items) {
      if (startToMinutes(it.approx_start) === null) {
        const start = clampMin(cursor, it.approx_duration_hours || DEFAULT_DURATION);
        updateItem(it.id, { approx_start: minutesToStart(start) });
        cursor = start + Math.round((it.approx_duration_hours || DEFAULT_DURATION) * 60);
      }
    }
  }, [loading, event, items]);

  if (loading || !event) return <p className="text-slate-400">טוען…</p>;

  // First free slot after the latest existing block's end (or 07:00 if none).
  const nextFreeStart = () => {
    let latestEnd = DAY_START_MIN;
    for (const it of items) {
      const s = startToMinutes(it.approx_start);
      if (s === null) continue;
      const end = s + Math.round((it.approx_duration_hours || DEFAULT_DURATION) * 60);
      if (end > latestEnd) latestEnd = end;
    }
    return clampMin(latestEnd, DEFAULT_DURATION);
  };

  const onAdd = async (data) => {
    const startMin = nextFreeStart();
    await addItem({
      approx_duration_hours: DEFAULT_DURATION,
      ...data,
      approx_start: minutesToStart(startMin),
    });
    if (!data.from_catalog_id) refreshCatalog(); // new activity landed in the catalog
  };

  // --- Pointer drag (vertical only) ----------------------------------------
  const onDragStart = (e, item) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const startMin = startToMinutes(item.approx_start) ?? DAY_START_MIN;
    dragRef.current = {
      id: item.id,
      startY: e.clientY,
      startTop: minutesToTop(startMin),
      dur: item.approx_duration_hours || DEFAULT_DURATION,
      moved: false,
    };
    setDrag({ id: item.id, top: minutesToTop(startMin) });
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  };

  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 3) d.moved = true;
    // Live (unsnapped) top, clamped to the day window for the block's duration.
    const durMin = Math.round(d.dur * 60);
    const maxTop = minutesToTop(Math.max(DAY_START_MIN, DAY_END_MIN - durMin));
    let top = d.startTop + dy;
    if (top < 0) top = 0;
    if (top > maxTop) top = maxTop;
    d.top = top; // remember live top for onDragEnd
    setDrag({ id: d.id, top });
  };

  const onDragEnd = () => {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      // Treat as a click → open the editor.
      setEditingId(d.id);
      return;
    }
    // Snap + clamp the final position, then persist.
    const snappedMin = clampMin(topToMinutes(d.top ?? d.startTop), d.dur);
    updateItem(d.id, { approx_start: minutesToStart(snappedMin) });
  };

  const draftReply = async () => {
    setDraftPending(true);
    setDraftError('');
    setDraftLink('');
    try {
      const res = await api.gmailDraftReply(event.id);
      if (res && res.link) {
        setDraftLink(res.link);
      } else {
        setDraftError('לא הצלחנו להכין טיוטה. נסו שוב.');
      }
    } catch (e) {
      const map = {
        no_linked_email: 'אין מייל מקושר ליום הזה.',
        gmail_not_configured: 'חיבור ה-Gmail עדיין לא מוגדר בצד השרת.',
        gmail_not_connected: 'צריך לחבר את Gmail קודם (במסך "מיילים").',
        pdf_unavailable: 'יצירת ה-PDF נכשלה בשרת.',
        gmail_error: 'שגיאה מול Gmail. נסו שוב.',
      };
      setDraftError(map[e?.serverMessage] || e?.serverMessage || 'לא הצלחנו להכין טיוטה. ודאו שה-Gmail מחובר.');
    } finally {
      setDraftPending(false);
    }
  };

  const editingItem = items.find((i) => i.id === editingId) || null;
  const marks = hourMarks();

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div>
        <Link to="/" className="text-sm text-slate-400 hover:text-ocar">← הימים שלי</Link>
        <div className="flex items-start justify-between mt-1 mb-1">
          <h1 className="text-2xl font-bold">{event.title}</h1>
        </div>
        <p className="text-slate-500 mb-5 text-sm">
          {[event.client_name, event.group_size && `${event.group_size} משתתפים`, whenLabel(event)]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="mb-4">
          <AddActivityRow onAdd={onAdd} />
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            עדיין אין פעילויות. הקלד שם פעילות למעלה כדי להתחיל את הלו״ז.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-400 mb-2">גרור בלוק מעלה/מטה כדי לקבוע מתי הפעילות מתחילה · לחיצה לעריכה</div>
            {/* Track: hour labels on the right (RTL), blocks fill the rest. */}
            <div ref={trackRef} className="relative" style={{ height: TRACK_PX, paddingRight: 56 }}>
              {marks.map((m) => (
                <div key={m.hour} className="absolute left-0 right-0" style={{ top: m.top }}>
                  <div className="absolute right-0 -translate-y-1/2 text-[11px] text-slate-400 w-12 text-center tabular-nums">
                    {m.label}
                  </div>
                  <div className="absolute left-0 right-14 border-t border-slate-100" />
                </div>
              ))}
              {/* Activity blocks */}
              <div className="absolute inset-y-0 left-0" style={{ right: 56 }}>
                {items.map((item) => {
                  const isDrag = drag && drag.id === item.id;
                  const startMin = startToMinutes(item.approx_start) ?? DAY_START_MIN;
                  const top = isDrag ? drag.top : minutesToTop(startMin);
                  return (
                    <TimelineBlock
                      key={item.id}
                      item={item}
                      top={top}
                      dragging={isDrag}
                      onDragStart={onDragStart}
                      onClick={(e) => e.preventDefault()}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <BudgetMeter items={items} budget={event.budget} groupSize={event.group_size} />
        <Link
          to={`/day/${event.id}/proposal`}
          className="block text-center bg-ocar-dark text-white px-4 py-3 rounded-xl font-medium hover:opacity-90"
        >
          תצוגת הצעה ל-PDF →
        </Link>
        {event.requests && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
            <div className="font-medium mb-1">מה הם רצו</div>
            <p className="text-slate-500 whitespace-pre-wrap">{event.requests}</p>
          </div>
        )}

        {event.email && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-3">
            <div>
              <div className="font-medium mb-2">המייל המקושר</div>
              <dl className="space-y-1 text-slate-500">
                {event.email.from && (
                  <div>
                    <span className="text-slate-400">מאת: </span>
                    {event.email.from}
                  </div>
                )}
                {event.email.subject && (
                  <div>
                    <span className="text-slate-400">נושא: </span>
                    {event.email.subject}
                  </div>
                )}
                {event.email.date && (
                  <div>
                    <span className="text-slate-400">תאריך: </span>
                    {new Date(event.email.date).toLocaleString('he-IL')}
                  </div>
                )}
                {event.email.snippet && (
                  <p className="text-slate-500 whitespace-pre-wrap pt-1">{event.email.snippet}</p>
                )}
              </dl>
              {event.email.message_id && (
                <a
                  href={`https://mail.google.com/mail/u/0/#all/${event.email.message_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-ocar hover:underline"
                >
                  פתח ב-Gmail ↗
                </a>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={draftReply}
                disabled={draftPending}
                className="w-full bg-ocar text-white px-3 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-60"
              >
                {draftPending ? 'מכין טיוטה…' : 'השב עם הצעה (ללא מחירים)'}
              </button>
              {draftLink && (
                <p className="text-green-600 mt-2">
                  הטיוטה מוכנה.{' '}
                  <a href={draftLink} target="_blank" rel="noreferrer" className="underline">
                    פתח טיוטה ב-Gmail ↗
                  </a>
                </p>
              )}
              {draftError && <p className="text-red-600 mt-2">{draftError}</p>}
            </div>
          </div>
        )}
      </aside>

      {editingItem && (
        <TimelineItem
          item={editingItem}
          onChange={updateItem}
          onRemove={removeItem}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
