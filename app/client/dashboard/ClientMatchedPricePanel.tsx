"use client";

import { CLIENT_UI, quoteSupportBadgeLabel } from "@/app/client/dashboard/client-display";
import {
  resolveQuoteNormalPrice,
  resolveQuoteSupportAppliedPrice,
  resolveQuoteSupportPlannedPrice,
} from "@/app/client/dashboard/page-quote-screen";
import { LABEL } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import { clientQuoteDebugContext } from "@/lib/quote-debug-trace";
import {
  isNormalPriceSelection,
  resolveApplicationMatchedPriceDisplay,
  type MatchedPriceCompare,
} from "@/lib/selected-price-display";

function formatWon(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

/** 매칭완료 탭 — 매칭 세부내역 본문 */
export function ClientMatchedPricePanel({
  application,
  selectedQuote,
}: {
  application: ClientApplication;
  selectedQuote: ClientQuote;
}) {
  const quoteNormalPrice = resolveQuoteNormalPrice(selectedQuote);
  const priceCompare: MatchedPriceCompare = {
    quoteNormalPrice,
    quoteSupportPlannedPrice: resolveQuoteSupportPlannedPrice(selectedQuote),
    quoteSupportAppliedPrice: resolveQuoteSupportAppliedPrice(selectedQuote),
  };

  const { label: matchedLabel, amount: matchedAmount } =
    resolveApplicationMatchedPriceDisplay(application, priceCompare);

  const hideSupport = isNormalPriceSelection(application, {
    normalPrice: quoteNormalPrice,
    supportPlannedPrice: priceCompare.quoteSupportPlannedPrice ?? null,
    supportAppliedPrice: priceCompare.quoteSupportAppliedPrice ?? null,
  });

  const normalLineAmount =
    selectedQuote.price != null && Number.isFinite(selectedQuote.price)
      ? Math.trunc(selectedQuote.price)
      : quoteNormalPrice;

  const matchedQuoteText = [matchedLabel, formatWon(matchedAmount)].filter(Boolean).join(" ");
  const supportBadge = !hideSupport ? quoteSupportBadgeLabel(selectedQuote, application) : null;

  return (
    <div className="mt-2 space-y-2 text-xs font-bold text-emerald-900">
      <div className="flex justify-end">
        <QuoteDebugButton context={clientQuoteDebugContext(application, selectedQuote)} />
      </div>
      <p className="text-sm font-black text-emerald-950">
        {LABEL.matchedPriceKind}: {matchedQuoteText || LABEL.unconfirmed}
      </p>
      {!hideSupport ? (
        <div className="space-y-1.5">
          {normalLineAmount != null ? (
            <p>
              {CLIENT_UI.normalPrice}: {normalLineAmount.toLocaleString("ko-KR")}
              {LABEL.wonSuffix}
            </p>
          ) : null}
          {supportBadge ? (
            <p className="text-[10px] font-bold text-slate-600">{supportBadge}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
