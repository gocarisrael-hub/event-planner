import { useEffect, useRef, useState } from 'react';
import { STATUSES, statusBadgeClass, statusDotClass, statusLabel } from '../utils/status.js';

// A nice-looking status control: a colored pill that opens a clean dropdown
// menu of every status. Closes on click-outside and on Escape. RTL.
export default function StatusSelect({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (key) => {
    setOpen(false);
    if (key !== value) onChange?.(key);
  };

  return (
    <div className="relative inline-block" dir="rtl" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition ${statusBadgeClass(
          value
        )} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:brightness-95'}`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDotClass(value)}`} />
        {statusLabel(value)}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 min-w-[12rem] bg-white rounded-xl shadow-lg border border-slate-200 p-1 z-20"
        >
          {STATUSES.map((s) => {
            const active = s.key === value;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => select(s.key)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50 text-right"
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${s.dotClass}`} />
                  <span className="flex-1">{s.label}</span>
                  {active && (
                    <svg className="w-4 h-4 text-ocar" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
