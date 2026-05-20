/**
 * 견적서 제출현황 가격 표시 — page.tsx에서 import (화면 표시 전용, UTF-8)
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

/** 지원금 관련 데이터 존재 여부 (일반견적가 fallback 금지 판단) */
export function quoteHasSupportPricingData(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  const b = quote.support_breakdown;
  return (
    parseAmount(quote.confirmed_customer_support) != null ||
    parseAmount(quote.planned_customer_support) != null ||
    parseAmount(quote.confirmed_total_support) != null ||
    parseAmount(quote.approved_support_amount) != null ||
    parseAmount(quote.preapproved_support_amount) != null ||
    parseAmount(quote.sponsor_approved_support_amount) != null ||
    parseAmount(application?.sponsor_approved_support_amount) != null ||
    breakdownAmount(b, "totalConfirmedSupport", "confirmed_total_support") != null ||
    breakdownAmount(b, "customerConfirmedSupport", "confirmed_customer_support") != null ||
    breakdownAmount(b, "customerPlannedSupport", "planned_customer_support") != null ||
    quote.sponsor_support_status === "approved" ||
    quote.support_status === "approved" ||
    application?.sponsor_support_status === "approved"
  );
}

export function quoteSupportConfirmedForScreen(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return false;
  return quoteHasSupportPricingData(quote, application);
}

/**
 * 견적서 제출현황 카드 — 지원금 할인 적용가 표시값.
 * 일반견적가 fallback 금지 (제휴기사 + 지원 데이터 있을 때).
 */
export function quoteSupportDiscountAppliedPriceForScreen(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  if (quote.source === "guest") {
    return parseAmount(quote.price);
  }

  const normal = parseAmount(quote.price);
  const breakdown = quote.support_breakdown;
  const extension =
    parseAmount(quote.extension_support_amount) ??
    breakdownAmount(breakdown, "extensionSupport", "extension_support_amount") ??
    0;

  const confirmedCustomer =
    parseAmount(quote.confirmed_customer_support) ??
    breakdownAmount(breakdown, "customerConfirmedSupport", "confirmed_customer_support") ??
    parseAmount((quote as ClientQuote & { final_customer_support_amount?: unknown })
      .final_customer_support_amount);

  if (normal != null && confirmedCustomer != null) {
    return Math.max(normal - confirmedCustomer - extension, 0);
  }

  const plannedCustomer =
    parseAmount(quote.planned_customer_support) ??
    breakdownAmount(breakdown, "customerPlannedSupport", "planned_customer_support");
  const confirmedTotal =
    parseAmount(quote.confirmed_total_support) ??
    breakdownAmount(breakdown, "totalConfirmedSupport", "confirmed_total_support") ??
    parseAmount(quote.approved_support_amount) ??
    parseAmount(quote.sponsor_approved_support_amount) ??
    parseAmount(application?.sponsor_approved_support_amount);

  if (normal != null && plannedCustomer != null && confirmedTotal != null) {
    const customerConfirmed = Math.min(plannedCustomer, confirmedTotal);
    return Math.max(normal - customerConfirmed - extension, 0);
  }

  const stored = [
    breakdownAmount(breakdown, "finalDiscountAppliedPrice", "final_discount_applied_price"),
    breakdownAmount(breakdown, "supportDiscountAppliedPrice", "confirmed_discount_price"),
    parseAmount(quote.final_discount_applied_price),
    parseAmount(quote.confirmed_discount_price),
    parseAmount(quote.support_discount_applied_price),
  ].find((v) => v != null) ?? null;

  if (stored != null && normal != null && stored < normal) return stored;
  if (stored != null && !quoteHasSupportPricingData(quote, application)) return stored;

  if (quoteHasSupportPricingData(quote, application)) return null;
  return null;
}

export function formatQuotePriceForScreen(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

/** API 지원금 필드 디버그 (개발 시 콘솔) */
export function logClientQuoteSupportDebug(applications: ClientApplication[]): void {
  if (typeof window === "undefined") return;
  for (const app of applications) {
    for (const quote of app.quotes ?? []) {
      if (quote.source !== "member") continue;
      const applied = quoteSupportDiscountAppliedPriceForScreen(quote, app);
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
        screenAppliedPrice: applied,
      });
    }
  }
}
