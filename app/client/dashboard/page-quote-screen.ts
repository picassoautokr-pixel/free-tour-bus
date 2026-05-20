/**
 * 견적서 제출현황 가격 표시 — page.tsx (UTF-8)
 */

import { CLIENT_UI } from "@/app/client/dashboard/client-display";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { LABEL } from "@/lib/client-dashboard-labels";

export const QUOTE_SCREEN_LABEL = {
  supportDiscountApplied: "지원금 할인 적용가",
  supportDiscountPlanned: "지원금 할인 예정가",
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

/** 후원 지원금 확정 여부 (제휴기사) */
export function quoteSupportIsConfirmed(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return false;
  const raw = quote as ClientQuote & { support_phase?: string };
  const status =
    quote.sponsor_support_status ??
    quote.support_status ??
    application?.sponsor_support_status;
  if (status === "approved" || status === "confirmed") return true;
  if (raw.support_phase === "confirmed") return true;
  if (quote.support_breakdown?.isConfirmed === true) return true;
  if (parseAmount(quote.confirmed_total_support) != null) return true;
  if (parseAmount(application?.sponsor_approved_support_amount) != null) return true;
  return false;
}

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

export function quoteSupportDiscountPlannedPriceForScreen(quote: ClientQuote): number | null {
  const breakdown = quote.support_breakdown;
  return (
    breakdownAmount(breakdown, "supportDiscountPlannedPrice", "planned_discount_price") ??
    parseAmount(quote.support_discount_planned_price) ??
    parseAmount(quote.member_price) ??
    null
  );
}

export type QuoteSubmitPriceLines = {
  isGuest: boolean;
  normalPrice: number | null;
  supportLabel: string;
  supportPrice: number | null;
  supportConfirmed: boolean;
};

/** 견적서 제출현황 카드 — 항상 일반견적가 + 지원금 가격 1줄 */
export function quoteSubmitPriceLines(
  quote: ClientQuote,
  application?: ClientApplication,
): QuoteSubmitPriceLines {
  const normalPrice = parseAmount(quote.price);
  const isGuest = quote.source === "guest";

  if (isGuest) {
    return {
      isGuest: true,
      normalPrice,
      supportLabel: QUOTE_SCREEN_LABEL.supportDiscountApplied,
      supportPrice: normalPrice,
      supportConfirmed: false,
    };
  }

  const supportConfirmed = quoteSupportIsConfirmed(quote, application);
  return {
    isGuest: false,
    normalPrice,
    supportLabel: supportConfirmed
      ? QUOTE_SCREEN_LABEL.supportDiscountApplied
      : QUOTE_SCREEN_LABEL.supportDiscountPlanned,
    supportPrice: supportConfirmed
      ? quoteSupportDiscountAppliedPriceForScreen(quote)
      : quoteSupportDiscountPlannedPriceForScreen(quote),
    supportConfirmed,
  };
}

export function quoteSupportConfirmedForScreen(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  return quoteSupportIsConfirmed(quote, application);
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
      const lines = quoteSubmitPriceLines(quote, app);
      console.log("[client-dashboard quote debug]", {
        quoteId: quote.id,
        receipt: app.receipt_number,
        organization_type: app.organization_type,
        group_type: (app as ClientApplication & { group_type?: string }).group_type,
        sponsor_support_status: quote.sponsor_support_status,
        lines,
        support_breakdown: quote.support_breakdown,
      });
    }
  }
}
