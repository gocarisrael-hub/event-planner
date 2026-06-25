import { useEffect, useRef, useState } from 'react';

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sunday-first (Israel week)

// Parse a "YYYY-MM-DD" string into a local Date (no timezone shift).
function parseValue(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Build a "YYYY-MM-DD" string from local year/month/day (no toISOString → no TZ shift).
function toValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DatePicker({ value, onChange }) {
  const selected = parseValue(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  // Month currently shown in the popover (first of the month).
  const [view, setView] = useState(() => {
    const base = selected || today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const rootRef = useRef(null);

  // When opening, jump the view to the selected month (or today).
  useEffect(() => {
    if (open) {
      const base = parseValue(value) || new Date();
      setView(new Date(base.getFullYear(), base.getMonth(), 1));
    }
  }, [open, value]);

  // Click-away + Esc to close.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerClass =
    'w-full border border-slate-300 rounded-xl px-4 py-3 text-base bg-white text-slate-800 ' +
    'transition-colors focus:outline-none focus:border-ocar focus:ring-2 focus:ring-ocar/30 ' +
    'cursor-pointer flex items-center justify-between gap-2 text-right';

  const label = selected
    ? selected.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'בחר תאריך';

  const monthLabel = view.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

  // Build the 6x7 grid of cells for the visible month.
  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const dayNum = i - firstWeekday + 1;
    const cellDate = new Date(year, month, dayNum);
    cells.push(cellDate);
  }

  const goMonth = (delta) => setView(new Date(year, month + delta, 1));

  return (
    <div className="relative" ref={rootRef} dir="rtl">
      <button
        type="button"
        className={triggerClass}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selected ? '' : 'text-slate-400'}>{label}</span>
        <svg
          className="w-5 h-5 text-slate-400 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 right-0 z-50 w-80 bg-white rounded-xl border border-slate-200 shadow-xl p-3"
          role="dialog"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="חודש קודם"
            >
              ›
            </button>
            <span className="text-sm font-semibold text-slate-800">{monthLabel}</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              aria-label="חודש הבא"
            >
              ‹
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="h-7 flex items-center justify-center text-xs font-medium text-slate-400">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cellDate) => {
              const inMonth = cellDate.getMonth() === month;
              const isToday = sameDay(cellDate, today);
              const isSelected = selected && sameDay(cellDate, selected);
              let cls =
                'h-9 w-9 mx-auto flex items-center justify-center rounded-lg text-sm transition-colors ';
              if (isSelected) {
                cls += 'bg-ocar text-white font-semibold';
              } else if (!inMonth) {
                cls += 'text-slate-300 hover:bg-slate-50';
              } else {
                cls += 'text-slate-700 hover:bg-ocar-soft';
                if (isToday) cls += ' ring-1 ring-ocar/60';
              }
              return (
                <button
                  type="button"
                  key={toValue(cellDate)}
                  className={cls}
                  onClick={() => {
                    onChange(toValue(cellDate));
                    setOpen(false);
                  }}
                >
                  {cellDate.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
