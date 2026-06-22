import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { brand } from '../brand/brand.js';
import { formatDuration, formatPrice, timingLabel, totalRange, whenLabel } from '../utils/format.js';

export default function ProposalPreview() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [showPrices, setShowPrices] = useState(true);

  useEffect(() => { api.getEvent(id).then(setEvent); }, [id]);
  if (!event) return <p className="p-8 text-slate-400">טוען…</p>;

  const items = event.items || [];
  const { low, high } = totalRange(items);

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link to={`/day/${id}`} className="text-sm text-slate-400 hover:text-ocar">← חזרה לבנייה</Link>
        <label className="flex items-center gap-2 text-sm mr-auto">
          <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
          הצג מחירים
        </label>
        <button onClick={() => window.print()} className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          הורד PDF / הדפס
        </button>
      </div>

      {/* The document */}
      <div className="print-page max-w-3xl mx-auto bg-white my-6 shadow-lg p-10" style={{ minHeight: '297mm' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 pb-4 mb-6" style={{ borderColor: brand.colors.primary }}>
          <div>
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-12" />
            ) : (
              <div className="text-3xl font-extrabold" style={{ color: brand.colors.primary }}>{brand.name}</div>
            )}
            <div className="text-xs text-slate-400">{brand.tagline}</div>
          </div>
          <div className="text-left text-sm text-slate-500">
            {event.client_name && <div className="font-medium text-slate-700">{event.client_name}</div>}
            {whenLabel(event) && <div>{whenLabel(event)}</div>}
            {event.group_size && <div>{event.group_size} משתתפים</div>}
          </div>
        </div>

        <h1 className="text-3xl font-extrabold mb-2" style={{ color: brand.colors.dark }}>{event.title}</h1>
        {event.requests && <p className="text-slate-600 mb-6">{event.requests}</p>}

        <h2 className="text-lg font-bold mb-3" style={{ color: brand.colors.primary }}>הלו״ז ליום</h2>
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="flex gap-4 print-break border-b border-slate-100 pb-3">
              <div className="min-w-[90px] text-center">
                <div className="font-bold" style={{ color: brand.colors.primary }}>{timingLabel(it) || '—'}</div>
                {it.approx_duration_min ? (
                  <div className="text-xs text-slate-400">{formatDuration(it.approx_duration_min)}</div>
                ) : null}
              </div>
              {it.photos?.[0] && (
                <img src={it.photos[0]} alt="" className="h-20 w-24 rounded-lg object-cover" />
              )}
              <div className="flex-1">
                <div className="font-semibold">{it.title}</div>
                {it.description && <div className="text-sm text-slate-500">{it.description}</div>}
              </div>
              {showPrices && it.show_price !== false && formatPrice(it.price_min, it.price_max) && (
                <div className="text-sm font-medium whitespace-nowrap">{formatPrice(it.price_min, it.price_max)}</div>
              )}
            </div>
          ))}
        </div>

        {showPrices && (high > 0 || low > 0) && (
          <div className="mt-6 pt-4 border-t-2 flex justify-between items-center" style={{ borderColor: brand.colors.primary }}>
            <span className="font-bold text-lg">סה״כ משוער</span>
            <span className="font-extrabold text-lg" style={{ color: brand.colors.primary }}>
              {formatPrice(low, high)}
            </span>
          </div>
        )}

        <div className="mt-10 text-center text-xs text-slate-400">
          {brand.name} · {brand.tagline}
        </div>
      </div>
    </div>
  );
}
