/**
 * 견적서 제출현황 가격 표시 — API support_breakdown 우선 (page.tsx, UTF-8)
 */

import { CLIENT_UI } from "@/app/client/dashboard/client-display";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { LABEL } from "@/lib/client-dashboard-labels";
import { buildQuoteSupportDisplayModel } from "@/lib/quote-support-display-model";

export const QUOTE_SCREEN_LABEL = {
  supportDiscountApplied: "지원금 할인 적용가",
  supportDiscountPlanned: "지원금 할인 예상가",
  normalPrice: "일반견적가",
} as const;

type BreakdownRow = Record<string, unknown>;

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
  const row = breakdown as BreakdownRow;
  return parseAmount(row[camelKey]) ?? parseAmount(row[snakeKey]);
}

/** 일반견적가 — 기사 견적 원가만 (application.selected_price 사용 금지) */
export function resolveQuoteNormalPrice(quote: ClientQuote): number | null {
  const raw = quote as ClientQuote & BreakdownRow;
  return (
    parseAmount(quote.price) ??
    parseAmount(quote.normal_price) ??
    parseAmount(raw.normal_price) ??
    parseAmount(quote.member_price) ??
    breakdownAmount(quote.support_breakdown, "normalPrice", "normal_price") ??
    null
  );
}

/** 지원금 할인 예상가 — 견적 필드만 */
export function resolveQuoteSupportPlannedPrice(quote: ClientQuote): number | null {
  return (
    parseAmount(quote.support_discount_planned_price) ??
    breakdownAmount(
      quote.support_breakdown,
      "supportDiscountPlannedPrice",
      "planned_discount_price",
    ) ??
    null
  );
}

/** 지원금 할인 적용가 — 견적 필드만 */
export function resolveQuoteSupportAppliedPrice(quote: ClientQuote): number | null {
  return (
    parseAmount(quote.final_discount_applied_price) ??
    parseAmount(quote.support_discount_applied_price) ??
    parseAmount(quote.confirmed_discount_price) ??
    breakdownAmount(
      quote.support_breakdown,
      "finalDiscountAppliedPrice",
      "final_discount_applied_price",
    ) ??
    breakdownAmount(
      quote.support_breakdown,
      "supportDiscountAppliedPrice",
      "confirmed_discount_price",
    ) ??
    null
  );
}

function resolveNormalPrice(quote: ClientQuote): number | null {
  return resolveQuoteNormalPrice(quote);
}

/** API support_breakdown·견적 필드 기준 확정 여부 */
export function quoteSupportIsConfirmed(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return false;
  return (
    buildQuoteSupportDisplayModel({
      application: application as unknown as Record<string, unknown>,
      quote: quote as unknown as Record<string, unknown>,
      support_breakdown: quote.support_breakdown,
      extension_count: (application as unknown as Record<string, unknown> | undefined)
        ?.extension_round,
    }).support_stage === "지원확정"
  );
}

function resolveSupportPriceFromApi(quote: ClientQuote, confirmed: boolean): number | null {
  const breakdown = quote.support_breakdown;
  if (confirmed) {
    return (
      breakdownAmount(breakdown, "finalDiscountAppliedPrice", "final_discount_applied_price") ??
      breakdownAmount(breakdown, "supportDiscountAppliedPrice", "confirmed_discount_price") ??
      parseAmount(quote.final_discount_applied_price) ??
      parseAmount(quote.confirmed_discount_price) ??
      parseAmount(quote.support_discount_applied_price) ??
      null
    );
  }
  return (
    breakdownAmount(breakdown, "supportDiscountPlannedPrice", "planned_discount_price") ??
    parseAmount(quote.support_discount_planned_price) ??
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

/** 견적서 제출현황 — 항상 일반견적가 + 지원금 가격 1줄 */
export function quoteSubmitPriceLines(
  quote: ClientQuote,
  application?: ClientApplication,
): QuoteSubmitPriceLines {
  const normalPrice = resolveNormalPrice(quote);
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

  const model = buildQuoteSupportDisplayModel({
    application: application as unknown as Record<string, unknown>,
    quote: quote as unknown as Record<string, unknown>,
    support_breakdown: quote.support_breakdown,
    extension_count: (application as unknown as Record<string, unknown> | undefined)
      ?.extension_round,
  });
  const supportConfirmed = model.support_stage === "지원확정";
  const supportPrice = supportConfirmed
    ? model.final_discount_price
    : model.planned_discount_price;

  return {
    isGuest: false,
    normalPrice: model.normal_price ?? normalPrice,
    supportLabel: supportConfirmed
      ? QUOTE_SCREEN_LABEL.supportDiscountApplied
      : QUOTE_SCREEN_LABEL.supportDiscountPlanned,
    supportPrice,
    supportConfirmed,
  };
}

export function quoteSupportDiscountAppliedPriceForScreen(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  return quoteSubmitPriceLines(quote, application).supportPrice;
}

export function quoteSupportDiscountPlannedPriceForScreen(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  const lines = quoteSubmitPriceLines(quote, application);
  if (lines.supportConfirmed) return null;
  return lines.supportPrice;
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
