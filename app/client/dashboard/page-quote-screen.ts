/**
 * 견적서 제출현황 가격 표시 — API support_breakdown 우선 (page.tsx, UTF-8)
 */

import { CLIENT_UI } from "@/app/client/dashboard/client-display";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import { LABEL } from "@/lib/client-dashboard-labels";

export const QUOTE_SCREEN_LABEL = {
  supportDiscountApplied: "지원금 할인 적용가",
  supportDiscountPlanned: "지원금 할인 예정가",
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

/** 지원금 할인 예정가 — 견적 필드만 */
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
  const breakdown = quote.support_breakdown as BreakdownRow | null | undefined;
  if (breakdown?.isConfirmed === true || breakdown?.is_confirmed === true) return true;
  if (quote.sponsor_support_status === "approved") return true;
  if (quote.support_status === "approved") return true;
  if (application?.sponsor_support_status === "approved") return true;
  const confirmedTotal =
    breakdownAmount(breakdown, "totalConfirmedSupport", "confirmed_total_support") ??
    parseAmount(quote.confirmed_total_support) ??
    parseAmount(quote.sponsor_approved_support_amount) ??
    parseAmount(quote.approved_support_amount) ??
    parseAmount(application?.sponsor_approved_support_amount);
  if (confirmedTotal != null && confirmedTotal > 0) return true;
  const applied =
    breakdownAmount(breakdown, "finalDiscountAppliedPrice", "final_discount_applied_price") ??
    parseAmount(quote.final_discount_applied_price) ??
    parseAmount(quote.confirmed_discount_price) ??
    parseAmount(quote.support_discount_applied_price);
  const normal = resolveNormalPrice(quote);
  if (applied != null && normal != null && applied < normal) return true;
  return false;
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

  const supportConfirmed = quoteSupportIsConfirmed(quote, application);
  let supportPrice = resolveSupportPriceFromApi(quote, supportConfirmed);

  if (supportPrice == null && normalPrice != null) {
    const breakdown = quote.support_breakdown as BreakdownRow | null | undefined;
    const extension =
      parseAmount(quote.extension_support_amount) ??
      breakdownAmount(breakdown, "extensionSupport", "extension_support_amount") ??
      0;
    let plannedCustomer =
      parseAmount(quote.planned_customer_support) ??
      breakdownAmount(breakdown, "customerPlannedSupport", "planned_customer_support") ??
      parseAmount((quote as ClientQuote & BreakdownRow).customer_support_amount);
    const memberHint = parseAmount(quote.member_price);
    if (plannedCustomer == null && memberHint != null && memberHint < normalPrice) {
      plannedCustomer = Math.max(normalPrice - memberHint - extension, 0);
    }
    if (supportConfirmed) {
      const confirmedTotal =
        breakdownAmount(breakdown, "totalConfirmedSupport", "confirmed_total_support") ??
        parseAmount(quote.confirmed_total_support) ??
        parseAmount(quote.sponsor_approved_support_amount) ??
        parseAmount(application?.sponsor_approved_support_amount);
      const confirmedCustomer =
        breakdownAmount(breakdown, "customerConfirmedSupport", "confirmed_customer_support") ??
        parseAmount(quote.confirmed_customer_support);
      if (confirmedCustomer != null) {
        supportPrice = Math.max(normalPrice - confirmedCustomer - extension, 0);
      } else if (plannedCustomer != null && confirmedTotal != null) {
        supportPrice = Math.max(
          normalPrice - Math.min(plannedCustomer, confirmedTotal) - extension,
          0,
        );
      } else if (confirmedTotal != null) {
        supportPrice = Math.max(normalPrice - confirmedTotal - extension, 0);
      } else if (plannedCustomer != null) {
        supportPrice = Math.max(normalPrice - plannedCustomer - extension, 0);
      }
    } else if (plannedCustomer != null) {
      supportPrice = Math.max(normalPrice - plannedCustomer - extension, 0);
    }
  }

  return {
    isGuest: false,
    normalPrice,
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
