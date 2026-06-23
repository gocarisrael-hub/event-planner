import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import AddActivityRow from '../components/AddActivityRow.jsx';
import BudgetMeter from '../components/BudgetMeter.jsx';
import DatePicker from '../components/DatePicker.jsx';
import TimelineItem from '../components/TimelineItem.jsx';
import { useCatalogStore } from '../store/useCatalogStore.js';
import { useEventStore } from '../store/useEventStore.js';
import { formatPrice, formatRange, MONTHS, SEASONS, timingLabel, whenLabel } from '../utils/format.js';
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

// Per-head price range contributed by a choice block: spans the item's OWN
// price and every option price (blanks/zero ignored). Falls back gracefully
// when nothing positive is present.
function choiceRange(item, options) {
  const prices = [Number(item.price) || 0, ...options.map((o) => Number(o.price) || 0)].filter(
    (p) => p > 0,
  );
  if (prices.length === 0) return { low: 0, high: 0 };
  return { low: Math.min(...prices), high: Math.max(...prices) };
}

// A positioned, draggable block on the timeline. Dragging changes the item's
// start time (vertical only, snapped + clamped); clicking opens the editor.
function TimelineBlock({ item, onDragStart, onClick, dragging, top }) {
  const options = item.options || [];
  const hasOptions = options.length > 0;
  const height = durationToHeight(item.approx_duration_hours);
  const range = hasOptions ? choiceRange(item, options) : null;
  const compact = height < 56;

  // Line-clamp the description to a whole number of lines that fit the block.
  // The fixed header above (title + time line + the mt-0.5 gap) takes ~38px,
  // the block's vertical padding (py-1.5) takes ~12px; the rest is the
  // description area. Each line uses an EXACT line-height of LINE_PX (applied
  // inline below) so the clamped box is always a clean multiple of it and the
  // block's overflow:hidden never slices through the middle of a line.
  const LINE_PX = 15;
  // Space taken above/below the description: top padding + title line + time
  // line + the mt-0.5 gap (~40px) plus bottom padding (~6px). If less than one
  // WHOLE line is left, we show no description at all — never a half-cut line.
  const RESERVED_PX = 52;
  const descAreaPx = height - RESERVED_PX;
  const descLines = Math.floor(descAreaPx / LINE_PX);
  const showDesc = !compact && Boolean(item.description) && descLines >= 1;

  return (
    <div
      className={`absolute right-0 left-2 flex flex-col rounded-lg border border-r-4 px-3 py-1.5 overflow-hidden select-none transition-colors ${
        dragging
          ? 'z-30 shadow-lg bg-ocar-soft border-ocar border-r-ocar ring-2 ring-ocar/30 cursor-grabbing'
          : 'z-10 bg-ocar-soft/60 border-ocar/30 border-r-ocar/70 shadow-sm hover:bg-ocar-soft hover:border-ocar/50 cursor-grab'
      }`}
      style={{ top, height }}
      onPointerDown={(e) => onDragStart(e, item)}
      onClick={onClick}
      title="גרור כדי לשנות שעה · לחיצה לעריכה"
    >
      {/* Fixed header: time + title + price/photo */}
      <div className={`flex-shrink-0 flex items-start gap-2 ${compact ? 'items-center' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-ocar-dark truncate flex items-center gap-2">
            {item.title}
            {hasOptions && (
              <span className="text-[10px] font-medium bg-white/80 text-ocar rounded-full px-1.5 py-0.5 whitespace-nowrap">
                אפשרויות: {options.length}
              </span>
            )}
          </div>
          <div className="text-[11px] text-ocar font-medium"><bdi>{timingLabel(item) || '—'}</bdi></div>
        </div>
        {!hasOptions && item.photos?.[0] && !compact && (
          <img src={item.photos[0]} alt="" className="h-9 w-9 rounded object-cover flex-shrink-0" />
        )}
        <div className="text-[11px] text-ocar-dark/80 whitespace-nowrap flex-shrink-0">
          {hasOptions ? formatRange(range.low, range.high) : formatPrice(item.price) || ''}
        </div>
      </div>
      {/* Description: only when at least one whole line fits; clamped, "…". */}
      {showDesc && (
        <div
          className="min-h-0 mt-0.5 text-[11px] text-slate-600 break-words"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: descLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: `${LINE_PX}px`,
            maxHeight: `${descLines * LINE_PX}px`,
          }}
        >
          {item.description}
        </div>
      )}
    </div>
  );
}

const field =
  'w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-ocar';

// Inline editor for the day's intake details. Mirrors NewDay's fields and the
// "מתי?" date/month/season toggle; saves via updateEvent and then closes.
function DayDetailsEditor({ event, onSave, onClose }) {
  const initialMode = event.target_month ? 'month' : event.target_season ? 'season' : 'date';
  const [whenMode, setWhenMode] = useState(initialMode);
  const [form, setForm] = useState({
    title: event.title || '',
    client_name: event.client_name || '',
    group_size: event.group_size ?? '',
    audience: event.audience || '',
    requests: event.requests || '',
    budget: event.budget ?? '',
    target_date: event.target_date || '',
    target_month: event.target_month || '',
    target_season: event.target_season || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: form.title || `יום עבור ${form.client_name || 'לקוח'}`,
        client_name: form.client_name,
        group_size: form.group_size ? Number(form.group_size) : null,
        audience: form.audience,
        requests: form.requests,
        budget: form.budget ? Number(form.budget) : null,
        target_date: whenMode === 'date' ? form.target_date || null : null,
        target_month: whenMode === 'month' ? form.target_month || null : null,
        target_season: whenMode === 'season' ? form.target_season || null : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 mb-5">
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

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={saving}
          className="bg-ocar text-white px-5 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-60">
          {saving ? 'שומר…' : 'שמור שינויים'}
        </button>
        <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg text-slate-500">
          ביטול
        </button>
      </div>
    </form>
  );
}

export default function DayBuilder() {
  const { id } = useParams();
  const { event, items, loading, load, addItem, updateItem, removeItem, updateEvent } = useEventStore();
  const loadCatalog = useCatalogStore((s) => s.load);
  const refreshCatalog = useCatalogStore((s) => s.refresh);

  const [draftPending, setDraftPending] = useState(false);
  const [draftLink, setDraftLink] = useState('');
  const [draftError, setDraftError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editDay, setEditDay] = useState(false);

  // Transient drag state: which item, its live top (px), and whether a real
  // drag happened (to suppress the click-to-edit on release).
  const [drag, setDrag] = useState(null); // { id, top }
  const dragRef = useRef(null); // { id, startY, startTop, dur, moved }
  const trackRef = useRef(null);

  // Reset the one-time seeding flag whenever we switch to a different day,
  // so legacy items on the newly-loaded day also get positioned.
  const seeded = useRef(false);
  useEffect(() => { seeded.current = false; load(id); }, [id]);
  useEffect(() => { loadCatalog(); }, []);

  // Legacy/edge items without a start: stack them onto the timeline so every
  // item is positioned. Runs once after items load (per day).
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
        <div className="flex items-start justify-between gap-3 mt-1 mb-1">
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <button
            type="button"
            onClick={() => setEditDay((v) => !v)}
            className="flex-shrink-0 text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:border-ocar hover:text-ocar"
          >
            {editDay ? 'סגור עריכה' : 'ערוך פרטי יום'}
          </button>
        </div>
        <p className="text-slate-500 mb-5 text-sm">
          {[event.client_name, event.group_size && `${event.group_size} משתתפים`, whenLabel(event)]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {editDay && (
          <DayDetailsEditor
            event={event}
            onSave={updateEvent}
            onClose={() => setEditDay(false)}
          />
        )}

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
