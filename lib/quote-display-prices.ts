import {
  breakdownFromQuoteRow,
} from "@/lib/support-breakdown-snapshot";
import {
  buildQuoteSupportBreakdown,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import {
  buildQuoteSupportDisplayModel,
  type QuoteSupportDisplayModel,
} from "@/lib/quote-support-display-model";

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

/**
 * DB에 저장된 raw breakdown에 모델이 계산한 확정값을 머지한다.
 * - breakdown에 이미 totalConfirmedSupport가 있어도 isConfirmed가 false이면 동기화한다.
 * - model의 confirmed_total_support가 null이면 금액은 그대로 두되 isConfirmed는 동기화한다.
 * - 금액 추론이 아닌, sponsor_preapproval/application fallback으로 계산된 모델값을 사용한다.
 * NOTE: 현재 단일 sponsor 지원금 집계 구조로 운영 중입니다.
 * 복수 후원업체 지원금 합산이 필요한 경우 getApprovedSponsorSupport(lib/sponsor-support.ts)와
 * 연동하여 aggregation 로직을 추가합니다.
 */
function mergeModelConfirmedIntoBreakdown(
  b: QuoteSupportBreakdown,
  model: QuoteSupportDisplayModel,
): QuoteSupportBreakdown {
  const modelConfirmed = model.support_stage === "지원확정";

  // 금액도 없고 단계도 "지원확정"이 아니면 그대로 반환
  if (!modelConfirmed && model.confirmed_total_support == null) return b;

  // 모델이 확정단계이지만 breakdown.isConfirmed가 false인 경우 동기화
  if (modelConfirmed && !b.isConfirmed && model.confirmed_total_support == null) {
    return { ...b, isConfirmed: true };
  }

  // 이미 확정 금액이 있으면 금액은 건드리지 않되 isConfirmed는 동기화
  if (b.totalConfirmedSupport != null) {
    if (modelConfirmed && !b.isConfirmed) {
      return { ...b, isConfirmed: true };
    }
    return b;
  }

  // confirmed_total_support가 없으면 머지 불가
  if (model.confirmed_total_support == null) return b;

  return {
    ...b,
    totalConfirmedSupport: model.confirmed_total_support,
    customerConfirmedSupport: model.confirmed_customer_support,
    partnerConfirmedSupport: model.confirmed_driver_support,
    supportDiscountAppliedPrice: model.final_discount_price ?? b.supportDiscountAppliedPrice,
    finalDiscountAppliedPrice: model.final_discount_price ?? b.finalDiscountAppliedPrice,
    extensionSupport: model.confirmed_extension_support,
    isConfirmed: true,
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
  const b = mergeModelConfirmedIntoBreakdown(display.breakdown, model);
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
