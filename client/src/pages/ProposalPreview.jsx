import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { brand } from '../brand/brand.js';
import { formatDuration, formatPrice, formatRange, priceRange, sortByStart, timingLabel, total, whenLabel } from '../utils/format.js';

export default function ProposalPreview() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [showPrices, setShowPrices] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.getEvent(id).then(setEvent); }, [id]);

  // Build a filesystem-safe PDF filename from the event title, distinguishing
  // the with/without-prices variants. The a.download attribute below is what
  // actually names the saved blob.
  const pdfFilename = (withPrices) => {
    const base = String(event?.title ?? '')
      .replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) return withPrices ? 'הצעה.pdf' : 'הצעה (ללא מחירים).pdf';
    return withPrices ? `הצעה – ${base}.pdf` : `הצעה – ${base} (ללא מחירים).pdf`;
  };

  // Download the server-rendered PDF (clean A4 Hebrew) instead of printing.
  const downloadPdf = async (withPrices) => {
    setError('');
    setPending(true);
    try {
      const res = await fetch(`/api/events/${id}/proposal.pdf?prices=${withPrices}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename(withPrices);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('יצירת ה-PDF נכשלה');
    } finally {
      setPending(false);
    }
  };

  if (!event) return <p className="p-8 text-slate-400">טוען…</p>;

  const items = sortByStart(event.items || []);
  const { low, high } = total(items);

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link to={`/day/${id}`} className="text-sm text-slate-400 hover:text-ocar">← חזרה לבנייה</Link>
        <div className="flex items-center gap-2 mr-auto">
          {error && <span className="text-sm text-red-500">{error}</span>}
          {pending && <span className="text-sm text-slate-400">יוצר PDF…</span>}
          <button onClick={() => downloadPdf(true)} disabled={pending} className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
            הורד PDF עם מחירים
          </button>
          <button onClick={() => downloadPdf(false)} disabled={pending} className="border border-ocar text-ocar px-4 py-2 rounded-lg text-sm font-medium hover:bg-ocar-soft disabled:opacity-50 disabled:cursor-not-allowed">
            הורד PDF בלי מחירים
          </button>
        </div>
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
            <div key={it.id} className="print-break border-b border-slate-100 pb-3">
              <div className="flex gap-4">
                <div className="min-w-[90px] text-center">
                  <div className="font-bold" style={{ color: brand.colors.primary }}><bdi>{timingLabel(it) || '—'}</bdi></div>
                  {it.approx_duration_hours ? (
                    <div className="text-xs text-slate-400">{formatDuration(it.approx_duration_hours)}</div>
                  ) : null}
                </div>
                {!it.options?.length && it.photos?.[0] && (
                  <img src={it.photos[0]} alt="" className="h-20 w-24 rounded-lg object-cover" />
                )}
                <div className="flex-1">
                  <div className="font-semibold">{it.title}</div>
                  {it.description && <div className="text-sm text-slate-500 break-words">{it.description}</div>}
                </div>
                {showPrices && !it.options?.length && formatPrice(it.price) && (
                  <div className="text-sm font-medium whitespace-nowrap">{formatPrice(it.price)}</div>
                )}
                {showPrices && it.options?.length > 0 && (() => {
                  // Choice-block slot price is a range spanning item.price + option prices.
                  const { low: lo, high: hi } = priceRange(it);
                  return <div className="text-sm font-medium whitespace-nowrap">{formatRange(lo, hi)}</div>;
                })()}
              </div>

              {it.options?.length > 0 && (
                <div className="mt-3 pr-[106px]">
                  <div className="text-xs font-medium text-slate-400 mb-2">בחירה בין:</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {it.options.map((o) => (
                      <div key={o.id} className="border border-slate-200 rounded-lg p-3 flex gap-3">
                        {o.photos?.[0] && (
                          <img src={o.photos[0]} alt="" className="h-16 w-16 rounded object-cover flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="font-semibold">{o.title}</div>
                            {showPrices && formatPrice(o.price) && (
                              <div className="text-sm font-medium whitespace-nowrap">{formatPrice(o.price)}</div>
                            )}
                          </div>
                          {o.description && <div className="text-sm text-slate-500 break-words">{o.description}</div>}
                          {(o.contact_name || o.contact_phone) && (
                            <div className="text-xs text-slate-400 mt-1">
                              {[o.contact_name, o.contact_phone].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {showPrices && high > 0 && (
          <div className="mt-6 pt-4 border-t-2" style={{ borderColor: brand.colors.primary }}>
            <div className="flex justify-between items-center">
              <span className="font-bold text-lg">מחיר לאדם</span>
              <span className="font-extrabold text-lg" style={{ color: brand.colors.primary }}>
                {formatRange(low, high)}
              </span>
            </div>
            {event.group_size > 0 && (
              <div className="flex justify-between items-center text-slate-500 mt-1">
                <span>סה״כ לקבוצה (×{event.group_size})</span>
                <span className="font-medium">{formatRange(low * event.group_size, high * event.group_size)}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-10 text-center text-xs text-slate-400">
          {brand.name} · {brand.tagline}
        </div>
      </div>
    </div>
  );
}
