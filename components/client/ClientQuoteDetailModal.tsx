"use client";

import { QuoteMatchButtonGroup } from "@/app/client/dashboard/QuoteMatchButtonGroup";
import { CLIENT_UI, quoteSupportBadgeLabel } from "@/app/client/dashboard/client-display";
import { LABEL, type ClientMainTab } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import type { QuoteMatchPriceSelection } from "@/lib/client-quote-match-selection";
import { clientQuoteDebugContext } from "@/lib/quote-debug-trace";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function ClientQuoteDetailModal({
  quote,
  application,
  tab,
  onClose,
  onMatch,
  busy,
}: {
  quote: ClientQuote;
  application: ClientApplication;
  tab: ClientMainTab;
  onClose: () => void;
  onMatch?: (selection: QuoteMatchPriceSelection) => void;
  busy?: boolean;
}) {
  const memo = quote.memo ?? quote.message ?? "";
  const supportBadge = quoteSupportBadgeLabel(quote, application);
  const canMatch = tab !== "matched" && onMatch != null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-900/50 px-0 py-0 sm:items-center sm:px-4 sm:py-8">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-black text-slate-950">
            {quote.source === "member" ? CLIENT_UI.memberQuote : CLIENT_UI.guestQuote}
          </h2>
          <QuoteDebugButton context={clientQuoteDebugContext(application, quote)} />
        </div>
        {supportBadge ? (
          <p className="mt-1 text-xs font-semibold text-slate-500">{supportBadge}</p>
        ) : null}
        <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 text-sm">
          <p className="text-xs font-bold text-slate-500">{LABEL.availableTime}</p>
          <p className="mt-1 font-black text-slate-900">{quote.available_time || LABEL.dash}</p>
        </div>
        {memo ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 text-sm">
            <p className="text-xs font-bold text-slate-500">{LABEL.driverMemo}</p>
            <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{memo}</p>
          </div>
        ) : null}
        {canMatch ? (
          <>
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              {LABEL.confirmMatchHint}
            </p>
            <QuoteMatchButtonGroup
              quote={quote}
              application={application}
              busy={busy}
              onMatch={(_quote, selection) => onMatch(selection)}
            />
          </>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700"
          style={tapStyle}
        >
          {LABEL.close}
        </button>
      </div>
    </div>
  );
}
