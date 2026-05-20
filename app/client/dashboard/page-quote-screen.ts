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

type QuoteRow = ClientQuote & Record<string, unknown>;

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

function resolveNormalPrice(quote: ClientQuote): number | null {
  const raw = quote as QuoteRow;
  return (
    parseAmount(quote.price) ??
    parseAmount(raw.normal_price) ??
    parseAmount(quote.member_price) ??
    null
  );
}

function resolvePlannedCustomerSupport(quote: ClientQuote): number | null {
  const raw = quote as QuoteRow;
  const breakdown = quote.support_breakdown;
  return (
    parseAmount(quote.planned_customer_support) ??
    breakdownAmount(breakdown, "customerPlannedSupport", "planned_customer_support") ??
    parseAmount(raw.customer_support_amount) ??
    parseAmount(raw.client_reward_amount) ??
    null
  );
}

function resolveConfirmedTotalSupport(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  const raw = quote as QuoteRow;
  const breakdown = quote.support_breakdown;
  return (
    parseAmount(quote.confirmed_total_support) ??
    breakdownAmount(breakdown, "totalConfirmedSupport", "confirmed_total_support") ??
    parseAmount(quote.sponsor_approved_support_amount) ??
    parseAmount(quote.approved_support_amount) ??
    parseAmount(application?.sponsor_approved_support_amount) ??
    null
  );
}

function resolveExtensionSupport(quote: ClientQuote): number {
  const breakdown = quote.support_breakdown;
  return (
    parseAmount(quote.extension_support_amount) ??
    breakdownAmount(breakdown, "extensionSupport", "extension_support_amount") ??
    0
  );
}

function resolveStoredSupportPrice(quote: ClientQuote, confirmed: boolean): number | null {
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

/** 후원 지원금 확정 여부 (제휴기사) */
export function quoteSupportIsConfirmed(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return false;
  if (quote.sponsor_support_status === "approved") return true;
  if (quote.support_status === "approved") return true;
  if (parseAmount(quote.confirmed_total_support) != null) return true;
  if (parseAmount(quote.sponsor_approved_support_amount) != null) return true;
  if (parseAmount(quote.approved_support_amount) != null) return true;
  if (application?.sponsor_support_status === "approved") return true;
  if (parseAmount(application?.sponsor_approved_support_amount) != null) return true;
  if (quote.support_breakdown?.isConfirmed === true) return true;
  return false;
}

/** 확정 — 지원금 할인 적용가 */
function computeSupportAppliedPrice(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  const normal = resolveNormalPrice(quote);
  if (normal == null) return null;

  const stored = resolveStoredSupportPrice(quote, true);
  if (stored != null && stored <= normal) return stored;

  const plannedCustomer = resolvePlannedCustomerSupport(quote);
  const confirmedTotal = resolveConfirmedTotalSupport(quote, application);
  const extension = resolveExtensionSupport(quote);

  if (plannedCustomer != null && confirmedTotal != null) {
    const customerConfirmed = Math.min(plannedCustomer, confirmedTotal);
    return Math.max(normal - customerConfirmed - extension, 0);
  }

  const confirmedCustomer =
    parseAmount(quote.confirmed_customer_support) ??
    breakdownAmount(
      quote.support_breakdown,
      "customerConfirmedSupport",
      "confirmed_customer_support",
    ) ??
    parseAmount(quote.final_customer_support_amount);
  if (confirmedCustomer != null) {
    return Math.max(normal - confirmedCustomer - extension, 0);
  }

  return stored != null && stored <= normal ? stored : null;
}

/** 검토중 — 지원금 할인 예정가 */
function computeSupportPlannedPrice(quote: ClientQuote): number | null {
  const normal = resolveNormalPrice(quote);
  if (normal == null) return null;

  const stored = resolveStoredSupportPrice(quote, false);
  if (stored != null && stored <= normal) return stored;

  const plannedCustomer = resolvePlannedCustomerSupport(quote);
  const extension = resolveExtensionSupport(quote);
  if (plannedCustomer != null) {
    return Math.max(normal - plannedCustomer - extension, 0);
  }

  return stored != null && stored <= normal ? stored : null;
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
  const supportPrice = supportConfirmed
    ? computeSupportAppliedPrice(quote, application)
    : computeSupportPlannedPrice(quote);

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
  if (quote.source === "guest") return resolveNormalPrice(quote);
  return computeSupportAppliedPrice(quote, application);
}

export function quoteSupportDiscountPlannedPriceForScreen(quote: ClientQuote): number | null {
  return computeSupportPlannedPrice(quote);
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
        sponsor_support_status: quote.sponsor_support_status,
        support_status: quote.support_status,
        planned_customer_support: quote.planned_customer_support,
        confirmed_total_support: quote.confirmed_total_support,
        sponsor_approved_support_amount: quote.sponsor_approved_support_amount,
        approved_support_amount: quote.approved_support_amount,
        application_sponsor_status: app.sponsor_support_status,
        application_sponsor_approved: app.sponsor_approved_support_amount,
        lines,
      });
    }
  }
}
