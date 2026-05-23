import {
  breakdownFromQuoteRow,
} from "@/lib/support-breakdown-snapshot";
import {
  buildQuoteSupportBreakdown,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import { buildQuoteSupportDisplayModel } from "@/lib/quote-support-display-model";

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
  const model = buildQuoteSupportDisplayModel({
    quote: {
      ...row,
      approved_support_amount:
        row.approved_support_amount ?? options?.applicationApprovedSupportTotal,
      estimated_support_amount:
        row.estimated_support_amount ?? options?.applicationTotalPlannedSupport,
    } as Record<string, unknown>,
    sponsor_preapproval: {
      estimated_support_amount: options?.sponsorEstimatedSupportAmount,
      approved_support_amount: options?.sponsorApprovedSupportAmount,
      status:
        options?.sponsorApprovedSupportAmount != null &&
        options.sponsorApprovedSupportAmount > 0
          ? "approved"
          : undefined,
    },
    support_breakdown: row.support_breakdown,
  });
  const display = getQuoteDisplayPrices(row, options);
  const b = display.breakdown;
  return {
    price: model.normal_price,
    member_price: model.planned_discount_price,
    support_discount_planned_price: model.planned_discount_price,
    support_discount_applied_price: model.final_discount_price,
    final_discount_applied_price: model.final_discount_price,
    total_planned_support: model.planned_total_support,
    customer_planned_support: model.planned_customer_support,
    partner_planned_support: model.planned_driver_support,
    total_confirmed_support: model.confirmed_total_support,
    customer_confirmed_support: model.confirmed_customer_support,
    partner_confirmed_support: model.confirmed_driver_support,
    extension_support:
      model.support_stage === "지원확정"
        ? model.confirmed_extension_support
        : model.planned_extension_support,
    support_breakdown: b,
    sponsor_quote_enabled: b.sponsorQuoteEnabled,
  };
}
