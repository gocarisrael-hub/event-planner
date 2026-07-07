import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, authHeaders } from '../api/client.js';
import { brand } from '../brand/brand.js';
import { formatDuration, formatPrice, formatRange, groupTotal, perPerson, priceRange, sortByStart, timingLabel, total, whenLabel } from '../utils/format.js';

export default function ProposalPreview() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [showPrices, setShowPrices] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.getEvent(id).then(setEvent); }, [id]);

  // Build a filesystem-safe PDF filename from the event title, distinguishing
  // the with/without-prices variants. The a.download attribute below is what
  // actually names the saved blob.
  // `option` is 'A' or 'B' when downloading a single option's proposal (mirrors
  // the server, which inserts "אופציה א/ב" before the variant suffix).
  const pdfFilename = (withPrices, withBudget, option = null) => {
    const base = String(event?.title ?? '')
      .replace(/[/\\:*?"<>|\x00-\x1f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const suffix = withPrices ? ' (עם מחירים)' : withBudget ? '' : ' (ללא תקציב)';
    const optionPart = option ? ` – אופציה ${option === 'B' ? 'ב' : 'א'}` : '';
    return base
      ? `הצעה – ${base}${optionPart}${suffix}.pdf`
      : `הצעה${optionPart}${suffix}.pdf`;
  };

  // Download the server-rendered PDF (clean A4 Hebrew) instead of printing.
  // Three variants: with prices / no prices (with budget) / no prices, no budget.
  // When `option` ('A'/'B') is passed, downloads only that option's proposal.
  const downloadPdf = async (withPrices, withBudget = true, option = null) => {
    setError('');
    setPending(true);
    try {
      const optionQuery = option ? `&option=${option}` : '';
      const res = await fetch(
        `/api/events/${id}/proposal.pdf?prices=${withPrices}&budget=${withBudget}${optionQuery}`,
        { headers: authHeaders() },
      );
      if (!res.ok) {
        // The server returns { error, message } with the real reason (e.g. a
        // Chromium launch/crash) — surface it instead of a generic failure.
        let detail = `status ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) detail = body.message;
        } catch { /* non-JSON body — keep the status code */ }
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFilename(withPrices, withBudget, option);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`יצירת ה-PDF נכשלה — ${e.message}`);
    } finally {
      setPending(false);
    }
  };

  if (!event) return <p className="p-8 text-slate-400">טוען…</p>;

  const items = sortByStart(event.items || []);
  const groupSize = event.group_size > 0 ? event.group_size : 0;
  const { high } = total(items); // whether anything is priced (gates the band)
  const pp = perPerson(items, groupSize);
  const g = groupTotal(items, groupSize);

  // Hero image: explicit cover, else the first photo we can find on the schedule.
  const heroPhoto =
    event.cover_photo ||
    items.find((it) => it.photos?.[0])?.photos?.[0] ||
    items.flatMap((it) => it.options || []).find((o) => o.photos?.[0])?.photos?.[0] ||
    null;

  // Meta line under the title: client · group · when · location.
  const eventLocation = event.location || items.find((it) => it.location)?.location || '';
  const metaParts = [
    event.client_name,
    event.group_size ? `${event.group_size} משתתפים` : '',
    whenLabel(event),
    eventLocation,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link to={`/day/${id}`} className="text-sm text-slate-400 hover:text-ocar">← חזרה לבנייה</Link>
        <div className="flex items-center gap-2 mr-auto">
          {error && <span className="text-sm text-red-500">{error}</span>}
          {pending && <span className="text-sm text-slate-400">יוצר PDF…</span>}
          {event.options_mode === true ? (
            // A/B options mode: a separate labeled group per option, each
            // downloading THAT option's PDF as a normal single-schedule proposal.
            <div className="flex items-center gap-4">
              {[
                { option: 'A', label: 'אופציה א' },
                { option: 'B', label: 'אופציה ב' },
              ].map(({ option, label }) => (
                <div key={option} className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500">{label}:</span>
                  <button onClick={() => downloadPdf(false, true, option)} disabled={pending} className="bg-ocar text-white px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                    בלי מחירים
                  </button>
                  <button onClick={() => downloadPdf(false, false, option)} disabled={pending} className="border border-ocar text-ocar px-3 py-2 rounded-lg text-sm font-medium hover:bg-ocar-soft disabled:opacity-50 disabled:cursor-not-allowed">
                    בלי מחירים ובלי תקציב
                  </button>
                  <button onClick={() => downloadPdf(true, true, option)} disabled={pending} className="border border-ocar text-ocar px-3 py-2 rounded-lg text-sm font-medium hover:bg-ocar-soft disabled:opacity-50 disabled:cursor-not-allowed">
                    עם מחירים
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <button onClick={() => downloadPdf(false, true)} disabled={pending} className="bg-ocar text-white px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
                בלי מחירים
              </button>
              <button onClick={() => downloadPdf(false, false)} disabled={pending} className="border border-ocar text-ocar px-4 py-2 rounded-lg text-sm font-medium hover:bg-ocar-soft disabled:opacity-50 disabled:cursor-not-allowed">
                בלי מחירים ובלי תקציב
              </button>
              <button onClick={() => downloadPdf(true, true)} disabled={pending} className="border border-ocar text-ocar px-4 py-2 rounded-lg text-sm font-medium hover:bg-ocar-soft disabled:opacity-50 disabled:cursor-not-allowed">
                עם מחירים
              </button>
            </>
          )}
        </div>
      </div>

      {/* The document — editorial, photo-forward preview */}
      <div className="print-page max-w-3xl mx-auto bg-white my-6 shadow-lg overflow-hidden" style={{ minHeight: '297mm' }}>
        {/* Hero header */}
        {heroPhoto ? (
          <div className="relative h-[200px] w-full">
            <img src={heroPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {/* Dark gradient so the title/meta stay legible over any photo */}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(20,20,20,0.78) 0%, rgba(20,20,20,0.15) 55%, rgba(20,20,20,0.35) 100%)' }}
            />
            {brand.logoUrl && (
              <img
                src={brand.logoUrl}
                alt={brand.name}
                className="absolute top-4 right-4 h-9 rounded bg-white/90 px-2 py-1 shadow-sm"
              />
            )}
            <div className="absolute bottom-0 right-0 left-0 p-6 text-white">
              <h1 className="text-3xl font-extrabold drop-shadow-sm">{event.title}</h1>
              {metaParts.length > 0 && (
                <div className="mt-1 text-sm text-white/90">{metaParts.join(' · ')}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-10 pt-8 pb-6" style={{ background: brand.colors.dark }}>
            <div className="flex items-center justify-between">
              {brand.logoUrl ? (
                <img src={brand.logoUrl} alt={brand.name} className="h-10 rounded bg-white/90 px-2 py-1" />
              ) : (
                <div className="text-2xl font-extrabold text-white">{brand.name}</div>
              )}
              <div className="text-xs text-white/70">{brand.tagline}</div>
            </div>
            <h1 className="mt-5 text-3xl font-extrabold text-white">{event.title}</h1>
            {metaParts.length > 0 && (
              <div className="mt-1 text-sm" style={{ color: brand.colors.accent }}>{metaParts.join(' · ')}</div>
            )}
          </div>
        )}

        <div className="p-10">
          {/* Schedule */}
          <div className="flex items-center gap-3 mb-6">
            <span className="h-6 w-1.5 rounded-full" style={{ background: brand.colors.primary }} />
            <h2 className="text-xl font-bold" style={{ color: brand.colors.dark }}>הלו״ז ליום</h2>
          </div>

          <div className="space-y-6">
            {items.map((it) => (
              <div key={it.id} className="print-break">
                <div className="flex gap-5">
                  {/* Photo (or branded placeholder) */}
                  {!it.options?.length && it.photos?.[0] ? (
                    <img src={it.photos[0]} alt="" className="h-28 w-28 flex-shrink-0 rounded-xl object-cover shadow-sm" />
                  ) : !it.options?.length ? (
                    <div
                      className="h-28 w-28 flex-shrink-0 rounded-xl"
                      style={{ background: brand.colors.soft }}
                    />
                  ) : null}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-sm font-bold" style={{ color: brand.colors.primary }}>
                        <bdi>{timingLabel(it) || '—'}</bdi>
                        {it.approx_duration_hours ? (
                          <span className="mr-2 font-normal text-slate-400">· {formatDuration(it.approx_duration_hours)}</span>
                        ) : null}
                      </div>
                      {showPrices && !it.options?.length && formatPrice(it.price) && (
                        <div className="text-sm font-semibold whitespace-nowrap">
                          {formatPrice(it.price)}
                          {it.price_type === 'total' && (
                            <span className="mr-1 text-xs font-normal text-slate-400">סה״כ</span>
                          )}
                        </div>
                      )}
                      {showPrices && it.options?.length > 0 && (() => {
                        const { low: lo, high: hi } = priceRange(it);
                        return <div className="text-sm font-semibold whitespace-nowrap">{formatRange(lo, hi)}</div>;
                      })()}
                    </div>

                    <div className="mt-0.5 text-lg font-bold" style={{ color: brand.colors.dark }}>{it.title}</div>
                    {it.description && <div className="mt-1 text-sm text-slate-500 break-words">{it.description}</div>}
                    {(it.contact_name || it.contact_phone) && (
                      <div className="mt-2 text-xs text-slate-400">
                        <span className="font-medium text-slate-500">איש קשר: </span>
                        {[it.contact_name, it.contact_phone].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>

                {it.options?.length > 0 && (
                  <div className="mt-4 pr-1">
                    <div className="text-xs font-medium text-slate-400 mb-3">בחירה בין:</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {it.options.map((o) => (
                        <div key={o.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                          {o.photos?.[0] && (
                            <img src={o.photos[0]} alt="" className="h-24 w-full object-cover" />
                          )}
                          <div className="p-3">
                            <div className="flex justify-between items-start gap-2">
                              <div className="font-semibold" style={{ color: brand.colors.dark }}>{o.title}</div>
                              {showPrices && formatPrice(o.price) && (
                                <div className="text-sm font-semibold whitespace-nowrap">{formatPrice(o.price)}</div>
                              )}
                            </div>
                            {o.description && <div className="mt-1 text-sm text-slate-500 break-words">{o.description}</div>}
                            {(o.contact_name || o.contact_phone) && (
                              <div className="mt-1 text-xs text-slate-400">
                                <span className="font-medium text-slate-500">איש קשר: </span>
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

          {/* Closing — investment per person + CTA */}
          <div className="mt-10 rounded-2xl p-6" style={{ background: brand.colors.soft }}>
            {showPrices && high > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-lg" style={{ color: brand.colors.dark }}>השקעה לאדם</span>
                  <span className="font-extrabold text-xl" style={{ color: brand.colors.primary }}>
                    {formatRange(pp.low, pp.high)}
                  </span>
                </div>
                {groupSize > 0 && (
                  <div className="mt-1 flex items-center justify-between text-sm text-slate-500">
                    <span>סה״כ לקבוצה (×{groupSize})</span>
                    <span className="font-medium">{formatRange(g.low, g.high)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg" style={{ color: brand.colors.dark }}>תקציב לאדם</span>
                {formatPrice(event.budget) && (
                  <span className="font-extrabold text-xl" style={{ color: brand.colors.primary }}>
                    {formatPrice(event.budget)}
                  </span>
                )}
              </div>
            )}
            <div className="mt-4 text-center font-semibold" style={{ color: brand.colors.primary }}>
              נשמח לתאם ולצאת לדרך
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-slate-400">
            {brand.name} · {brand.tagline}
          </div>
        </div>
      </div>
    </div>
  );
}
