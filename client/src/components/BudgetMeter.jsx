import { formatRange, total } from '../utils/format.js';

// Budget is PER PERSON (לראש). Activity prices are per person too, so the
// per-head cost compares directly to the budget; the group total is per-head × N.
export default function BudgetMeter({ items, budget, groupSize }) {
  const { low, high } = total(items);
  const hasBudget = budget !== null && budget !== undefined && budget !== '';
  const n = Number(groupSize) || 0;
  const over = hasBudget && high > Number(budget);
  const pct = hasBudget ? Math.min(100, Math.round((high / Number(budget)) * 100)) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">עלות לראש</span>
        <span className="font-bold">{high > 0 ? formatRange(low, high) : '—'}</span>
      </div>

      {n > 0 && high > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
          <span>סה״כ לקבוצה (×{n})</span>
          <span>{formatRange(low * n, high * n)}</span>
        </div>
      )}

      {hasBudget && (
        <>
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${over ? 'bg-red-500' : 'bg-ocar'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>תקציב לראש: ₪{budget}</span>
            <span className={over ? 'text-red-500 font-medium' : ''}>
              {over ? `חריגה של ₪${high - Number(budget)} לראש` : `${pct}% מהתקציב`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
