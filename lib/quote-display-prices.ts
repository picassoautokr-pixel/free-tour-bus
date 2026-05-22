import {
  breakdownFromQuoteRow,
} from "@/lib/support-breakdown-snapshot";
import {
  buildQuoteSupportBreakdown,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";

export type QuoteDisplayPriceInput = QuoteSupportInput & {
  final_member_price?: unknown;
  member_price?: unknown;
  sponsor_discounted_price?: unknown;
};

export type QuoteDisplayPrices = {
  normalPrice: number | null;
  supportCustomerAmount: number | null;
  supportPrice: number | null;
  supportDiscountPlannedPrice: number | null;
  supportDiscountAppliedPrice: number | null;
  finalDiscountAppliedPrice: number | null;
  breakdown: QuoteSupportBreakdown;
};

export function parseDisplayInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function getQuoteDisplayPrices(
  quote: QuoteDisplayPriceInput,
  options?: BuildQuoteSupportBreakdownOptions,
): QuoteDisplayPrices {
  const breakdown =
    breakdownFromQuoteRow(quote as QuoteDisplayPriceInput & { support_breakdown?: unknown }) ??
    buildQuoteSupportBreakdown(quote, options);
  const customerAmount =
    breakdown.isConfirmed && breakdown.customerConfirmedSupport != null
      ? breakdown.customerConfirmedSupport
      : breakdown.customerPlannedSupport;

  return {
    normalPrice: breakdown.normalPrice,
    supportCustomerAmount: customerAmount,
    supportPrice: breakdown.isConfirmed
      ? breakdown.supportDiscountAppliedPrice
      : breakdown.supportDiscountPlannedPrice,
    supportDiscountPlannedPrice: breakdown.supportDiscountPlannedPrice,
    supportDiscountAppliedPrice: breakdown.supportDiscountAppliedPrice,
    finalDiscountAppliedPrice: breakdown.finalDiscountAppliedPrice,
    breakdown,
  };
}

/** API/대시보드 공통 응답 필드 */
export function mapQuoteWithSupport(
  row: QuoteDisplayPriceInput,
  options?: BuildQuoteSupportBreakdownOptions,
) {
  const display = getQuoteDisplayPrices(row, options);
  const b = display.breakdown;
  return {
    price: display.normalPrice,
    member_price: display.supportDiscountPlannedPrice,
    support_discount_planned_price: display.supportDiscountPlannedPrice,
    support_discount_applied_price: display.supportDiscountAppliedPrice,
    final_discount_applied_price: display.finalDiscountAppliedPrice,
    total_planned_support: b.totalPlannedSupport,
    customer_planned_support: b.customerPlannedSupport,
    partner_planned_support: b.partnerPlannedSupport,
    total_confirmed_support: b.totalConfirmedSupport,
    customer_confirmed_support: b.customerConfirmedSupport,
    partner_confirmed_support: b.partnerConfirmedSupport,
    extension_support: b.extensionSupport,
    support_breakdown: b,
    sponsor_quote_enabled: b.sponsorQuoteEnabled,
  };
}
