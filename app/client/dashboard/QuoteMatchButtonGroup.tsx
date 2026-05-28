"use client";

import {
  quoteCardShowsSupportPriceRow,
  quoteMatchButtonsWithLabels,
  type QuoteMatchPriceSelection,
} from "@/lib/client-quote-match-selection";
import {
  formatQuotePriceForScreen,
  quoteSubmitPriceLines,
} from "@/app/client/dashboard/page-quote-screen";
import { CLIENT_UI } from "@/app/client/dashboard/client-display";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { clientQuoteDebugContext } from "@/lib/quote-debug-trace";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export function QuoteMatchButtonGroup({
  quote,
  application,
  busy,
  onMatch,
}: {
  quote: ClientQuote;
  application: ClientApplication;
  busy?: boolean;
  onMatch: (quote: ClientQuote, selection: QuoteMatchPriceSelection) => void;
}) {
  const lines = quoteSubmitPriceLines(quote, application);
  const showSupportRow = quoteCardShowsSupportPriceRow(quote, application);
  const buttons = quoteMatchButtonsWithLabels(quote, application);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex justify-end">
        <QuoteDebugButton context={clientQuoteDebugContext(application, quote)} />
      </div>
      <div className="grid gap-1 text-xs font-bold text-slate-800">
        <span>
          {CLIENT_UI.normalPrice}: {formatQuotePriceForScreen(lines.normalPrice)}
        </span>
        {showSupportRow ? (
          <>
            <span className={lines.supportConfirmed ? "text-emerald-800" : "text-blue-800"}>
              {lines.supportLabel}: {formatQuotePriceForScreen(lines.supportPrice)}
            </span>
            {!lines.supportConfirmed ? (
              <span className="mt-0.5 text-[10px] font-semibold text-slate-500">
                후원사의 지원금 확정금액에 따라 최종 할인 적용가는 변동될 수 있습니다.
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        {buttons.map((opt) => (
          <button
            key={opt.selected_price_type}
            type="button"
            disabled={busy || opt.selected_price == null}
            onClick={() => onMatch(quote, opt)}
            className={`min-h-10 w-full rounded-lg px-3 text-[11px] font-black text-white disabled:opacity-50 ${
              opt.selected_price_type === "normal"
                ? "bg-slate-800"
                : opt.selected_price_type === "support_planned"
                  ? "bg-blue-600"
                  : "bg-emerald-600"
            }`}
            style={tapStyle}
          >
            {opt.buttonLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
