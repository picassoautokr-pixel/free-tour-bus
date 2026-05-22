"use client";

import { LABEL } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import {
  resolveQuoteSupportAppliedPrice,
  resolveQuoteSupportPlannedPrice,
} from "@/app/client/dashboard/page-quote-screen";
import { clientQuoteDebugContext } from "@/lib/quote-debug-trace";
import {
  resolveApplicationMatchedPriceDisplay,
  type MatchedPriceCompare,
  type QuoteMatchedPriceFallback,
} from "@/lib/selected-price-display";

function formatWon(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

function quoteFallbackFromClientQuote(quote: ClientQuote): QuoteMatchedPriceFallback {
  return {
    price: quote.price,
    support_discount_planned_price: quote.support_discount_planned_price,
    support_discount_applied_price: quote.support_discount_applied_price,
    final_discount_applied_price: quote.final_discount_applied_price,
    confirmed_discount_price: quote.confirmed_discount_price,
    support_breakdown: quote.support_breakdown ?? null,
  };
}

/** 매칭완료 탭 — 선택 견적 한 줄 */
export function ClientMatchedPricePanel({
  application,
  selectedQuote,
}: {
  application: ClientApplication;
  selectedQuote: ClientQuote;
}) {
  const priceCompare: MatchedPriceCompare = {
    quoteNormalPrice: selectedQuote.price,
    quoteSupportPlannedPrice: resolveQuoteSupportPlannedPrice(selectedQuote),
    quoteSupportAppliedPrice: resolveQuoteSupportAppliedPrice(selectedQuote),
  };

  const { label, amount } = resolveApplicationMatchedPriceDisplay(
    application,
    priceCompare,
    quoteFallbackFromClientQuote(selectedQuote),
  );

  const selectedQuoteText = [label, formatWon(amount)].filter(Boolean).join(" ");

  return (
    <div className="mt-2 space-y-2 text-xs font-bold text-emerald-900">
      <div className="flex justify-end">
        <QuoteDebugButton context={clientQuoteDebugContext(application, selectedQuote)} />
      </div>
      <p className="text-sm font-black text-emerald-950">
        {LABEL.selectedQuoteLine}: {selectedQuoteText || LABEL.unconfirmed}
      </p>
    </div>
  );
}
