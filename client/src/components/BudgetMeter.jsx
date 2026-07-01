import { formatRange, groupTotal, perPerson, profitTotal } from '../utils/format.js';

// Colour class for an internal profit range: green when clearly positive
// (even the low end ≥ 0), red when clearly negative (even the high end < 0),
// amber otherwise (the range straddles zero).
function profitColor(p) {
  if (p.low >= 0) return 'text-green-600';
  if (p.high < 0) return 'text-red-500';
  return 'text-amber-600';
}

// The per-person / group / budget-bar / profit body for ONE set of items,
// compared against the (per-person) budget. Reused for single mode and for
// each option column in two-option mode. Profit is INTERNAL and never in the
// client PDF; it only renders when profitTotal can be computed (budget + N).
function MeterBody({ items, budget, groupSize }) {
  const n = Number(groupSize) || 0;
  const { low, high } = perPerson(items, n);
  const g = groupTotal(items, n);
  const hasBudget = budget !== null && budget !== undefined && budget !== '';
  const over = hasBudget && high > Number(budget);
  const pct = hasBudget ? Math.min(100, Math.round((high / Number(budget)) * 100)) : 0;
  const profit = profitTotal(items, budget, n);

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">עלות לראש</span>
        <span className="font-bold">{high > 0 ? formatRange(low, high) : '—'}</span>
      </div>

      {n > 0 && high > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
          <span>סה״כ לקבוצה (×{n})</span>
          <span>{formatRange(g.low, g.high)}</span>
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

      {profit && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">רווח (סה״כ)</span>
            <span className={`font-bold ${profitColor(profit)}`}>
              {formatRange(profit.low, profit.high)}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            (רווח משוער — לא מופיע בהצעה)
          </div>
        </div>
      )}
    </>
  );
}

// Budget is PER PERSON (לראש). Per-head cost compares directly to the budget;
// the group line is the type-aware group total (flat total-priced items are
// counted once, not ×N). With a group size, total-priced items are amortised
// across heads so the per-head figure stays honest.
//
// When `optionsMode` is true the day is planned as two A/B options, so the
// meter splits `items` by option (A = option !== 'B', B = option === 'B') and
// shows a compact section per option, each compared to the SAME budget.
export default function BudgetMeter({ items, budget, groupSize, optionsMode = false }) {
  if (optionsMode) {
    const itemsA = items.filter((i) => i.option !== 'B');
    const itemsB = items.filter((i) => i.option === 'B');
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        {[
          { label: 'אופציה א', list: itemsA },
          { label: 'אופציה ב', list: itemsB },
        ].map(({ label, list }) => (
          <div key={label} className="border border-slate-100 rounded-lg p-3">
            <div className="font-semibold text-ocar-dark text-sm mb-2">{label}</div>
            <MeterBody items={list} budget={budget} groupSize={groupSize} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <MeterBody items={items} budget={budget} groupSize={groupSize} />
    </div>
  );
}
