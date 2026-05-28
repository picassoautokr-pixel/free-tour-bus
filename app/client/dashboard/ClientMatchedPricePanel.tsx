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
import { isSponsorConfirmed } from "@/lib/status-normalizer";

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

  const resolved = resolveApplicationMatchedPriceDisplay(
    application,
    priceCompare,
    quoteFallbackFromClientQuote(selectedQuote),
  );

  // 스폰서가 지원확정 된 이후라면, 저장된 예상가 라벨 대신 확정 적용가로 표시
  const sponsorConfirmed = isSponsorConfirmed(
    (application as { sponsor_support_status?: string | null }).sponsor_support_status,
  );
  const confirmedApplied = priceCompare.quoteSupportAppliedPrice;
  const label =
    sponsorConfirmed && confirmedApplied != null ? "지원금 할인 적용가" : resolved.label;
  const amount =
    sponsorConfirmed && confirmedApplied != null ? confirmedApplied : resolved.amount;

  const selectedQuoteText = [label, formatWon(amount)].filter(Boolean).join(" ");

  return (
    <div className="mt-2 space-y-2 text-xs font-bold text-emerald-900">
      <div className="flex justify-end">
        <QuoteDebugButton context={clientQuoteDebugContext(application, selectedQuote)} />
      </div>
      <p className="text-sm font-black text-emerald-950">
        {LABEL.selectedQuoteLine}: {selectedQuoteText || LABEL.unconfirmed}
      </p>
      {!sponsorConfirmed && selectedQuote.source === "member" ? (
        <p className="text-[10px] font-semibold text-slate-500">
          후원사의 지원금 확정금액에 따라 최종 할인 적용가는 변동될 수 있습니다.
        </p>
      ) : null}
    </div>
  );
}
