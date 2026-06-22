import { formatPrice, totalRange } from '../utils/format.js';

// Shows the schedule's total price range vs the day's budget.
export default function BudgetMeter({ items, budget }) {
  const { low, high } = totalRange(items);
  const hasBudget = budget !== null && budget !== undefined && budget !== '';
  const over = hasBudget && high > Number(budget);
  const pct = hasBudget ? Math.min(100, Math.round((high / Number(budget)) * 100)) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">סה״כ משוער</span>
        <span className="font-bold">{formatPrice(low, high) || '—'}</span>
      </div>
      {hasBudget && (
        <>
          <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${over ? 'bg-red-500' : 'bg-ocar'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>תקציב: ₪{budget}</span>
            <span className={over ? 'text-red-500 font-medium' : ''}>
              {over ? `חריגה של ₪${high - Number(budget)}` : `${pct}% מהתקציב`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
