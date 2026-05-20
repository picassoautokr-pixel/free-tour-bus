/**
 * 견적서 제출현황 가격 표시 — API support_breakdown 우선 (page.tsx, UTF-8)
 */

import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { LABEL } from "@/lib/client-dashboard-labels";

export const QUOTE_SCREEN_LABEL = {
  supportDiscountApplied: "지원금 할인 적용가",
  normalPrice: "일반견적가",
} as const;

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function breakdownAmount(
  breakdown: unknown,
  camelKey: string,
  snakeKey: string,
): number | null {
  if (!breakdown || typeof breakdown !== "object") return null;
  const row = breakdown as Record<string, unknown>;
  return parseAmount(row[camelKey]) ?? parseAmount(row[snakeKey]);
}

/** API support_breakdown·견적 필드에서 지원금 할인 적용가 (클라이언트 재계산 없음) */
export function quoteSupportDiscountAppliedPriceForScreen(quote: ClientQuote): number | null {
  if (quote.source === "guest") {
    return parseAmount(quote.price);
  }

  const breakdown = quote.support_breakdown;

  return (
    breakdownAmount(breakdown, "finalDiscountAppliedPrice", "final_discount_applied_price") ??
    breakdownAmount(breakdown, "supportDiscountAppliedPrice", "confirmed_discount_price") ??
    parseAmount(quote.final_discount_applied_price) ??
    parseAmount(quote.confirmed_discount_price) ??
    parseAmount(quote.support_discount_applied_price) ??
    null
  );
}

export function quoteSupportConfirmedForScreen(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return false;
  if (quoteSupportDiscountAppliedPriceForScreen(quote) != null) return true;
  const breakdown = quote.support_breakdown;
  if (breakdown?.isConfirmed === true) return true;
  if (parseAmount(quote.confirmed_total_support) != null) return true;
  if (parseAmount(quote.sponsor_approved_support_amount) != null) return true;
  if (parseAmount(application?.sponsor_approved_support_amount) != null) return true;
  if (quote.sponsor_support_status === "approved") return true;
  if (quote.support_status === "approved") return true;
  if (application?.sponsor_support_status === "approved") return true;
  return false;
}

export function formatQuotePriceForScreen(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

export function logClientQuoteSupportDebug(applications: ClientApplication[]): void {
  if (typeof window === "undefined") return;
  for (const app of applications) {
    for (const quote of app.quotes ?? []) {
      if (quote.source !== "member") continue;
      console.log("[client-dashboard quote debug]", {
        quoteId: quote.id,
        receipt: app.receipt_number,
        price: quote.price,
        confirmed_customer_support: quote.confirmed_customer_support,
        planned_customer_support: quote.planned_customer_support,
        confirmed_total_support: quote.confirmed_total_support,
        final_discount_applied_price: quote.final_discount_applied_price,
        confirmed_discount_price: quote.confirmed_discount_price,
        support_discount_applied_price: quote.support_discount_applied_price,
        support_breakdown: quote.support_breakdown,
        screenAppliedPrice: quoteSupportDiscountAppliedPriceForScreen(quote),
      });
    }
  }
}
