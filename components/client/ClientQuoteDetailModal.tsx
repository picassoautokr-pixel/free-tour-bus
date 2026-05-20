"use client";

import {
  LABEL,
  type ClientMainTab,
} from "@/lib/client-dashboard-labels";
import {
  clientQuotePriceVisibility,
  clientQuotePrices,
  fmtClientPrice,
  quoteBreakdownForClient,
  sponsorSupportBadge,
  type ClientApplication,
  type ClientQuote,
} from "@/lib/client-application-view-model";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function ClientQuoteDetailModal({
  quote,
  application,
  tab,
  onClose,
  onMatchNormal,
  onMatchSupport,
  onMatchSingle,
  busy,
}: {
  quote: ClientQuote;
  application?: ClientApplication;
  tab: ClientMainTab;
  onClose: () => void;
  onMatchNormal?: () => void;
  onMatchSupport?: () => void;
  onMatchSingle?: () => void;
  busy?: boolean;
}) {
  const prices = clientQuotePrices(quote, application);
  const vis = clientQuotePriceVisibility(prices);
  const breakdown = quote.source === "member" ? quoteBreakdownForClient(quote) : null;
  const memo = quote.memo ?? quote.message ?? "";
  const supportBadge = sponsorSupportBadge(
    quote.sponsor_support_status ??
      (quote.sponsor_quote_enabled !== false
        ? application?.sponsor_support_status
        : undefined),
  );

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-900/50 px-0 py-0 sm:items-center sm:px-4 sm:py-8">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <h2 className="text-lg font-black text-slate-950">
          {quote.source === "member" ? LABEL.memberQuote : LABEL.guestQuote}
        </h2>
        {supportBadge ? (
          <p className="mt-1 text-xs font-semibold text-slate-500">{supportBadge}</p>
        ) : null}
        <dl className="mt-4 space-y-3 text-sm">
          {vis.showNormal ? (
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <dt className="text-xs font-bold text-slate-500">{LABEL.normalPrice}</dt>
              <dd className="mt-1 font-black text-slate-900">
                {fmtClientPrice(prices.normalPrice, "planned", breakdown)}
              </dd>
            </div>
          ) : null}
          {vis.showPlanned ? (
            <div className="rounded-xl bg-blue-50 p-3 ring-1 ring-blue-100">
              <dt className="text-xs font-bold text-blue-700">{LABEL.supportDiscountPlanned}</dt>
              <dd className="mt-1 font-black text-blue-950">
                {fmtClientPrice(prices.supportDiscountPlanned, "planned", breakdown)}
              </dd>
            </div>
          ) : null}
          {vis.showApplied ? (
            <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
              <dt className="text-xs font-bold text-emerald-700">{LABEL.supportDiscountApplied}</dt>
              <dd className="mt-1 font-black text-emerald-950">
                {fmtClientPrice(prices.supportDiscountApplied, "confirmed", breakdown)}
              </dd>
            </div>
          ) : null}
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
            <dt className="text-xs font-bold text-slate-500">{LABEL.availableTime}</dt>
            <dd className="mt-1 font-black">{quote.available_time || LABEL.dash}</dd>
          </div>
          {memo ? (
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
              <dt className="text-xs font-bold text-slate-500">{LABEL.driverMemo}</dt>
              <dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{memo}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          {LABEL.confirmMatchHint}
        </p>
        <div className="mt-4 grid gap-2">
          {tab === "auto_closed" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onMatchNormal?.()}
                className="min-h-11 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-50"
                style={tapStyle}
              >
                {LABEL.matchWithNormal}
              </button>
              <button
                type="button"
                disabled={busy || !prices.supportDiscountPlanned}
                onClick={() => onMatchSupport?.()}
                className="min-h-11 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
                style={tapStyle}
              >
                {LABEL.matchWithSupport}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMatchSingle?.()}
              className="min-h-11 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
              style={tapStyle}
            >
              {LABEL.matchComplete}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
            style={tapStyle}
          >
            {LABEL.close}
          </button>
        </div>
      </div>
    </div>
  );
}
