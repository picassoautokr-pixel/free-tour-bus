/**
 * 클라이언트 API 견적 응답 — support_breakdown·확정 할인가 (UTF-8)
 */

import {
  buildQuoteSupportBreakdown,
  parseSupportInteger,
  resolveConfirmedTotalSupport,
  resolvePlannedSupportSnapshot,
  resolveSettlementType,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import {
  computeConfirmedFromPlanned,
  type QuoteSupportRow,
} from "@/lib/quote-support-snapshot";

/** 클라이언트 JSON — camelCase + snake_case 병행 */
export type ClientSerializedSupportBreakdown = QuoteSupportBreakdown & {
  confirmed_discount_price: number | null;
  final_discount_applied_price: number | null;
  confirmed_total_support: number | null;
  confirmed_customer_support: number | null;
  confirmed_driver_support: number | null;
  planned_customer_support: number | null;
  planned_total_support: number | null;
};

function serializeBreakdownForClient(
  breakdown: QuoteSupportBreakdown,
): ClientSerializedSupportBreakdown {
  const applied =
    breakdown.finalDiscountAppliedPrice ?? breakdown.supportDiscountAppliedPrice ?? null;
  const finalApplied = breakdown.finalDiscountAppliedPrice ?? applied;
  return {
    ...breakdown,
    confirmed_discount_price: applied,
    final_discount_applied_price: finalApplied,
    confirmed_total_support: breakdown.totalConfirmedSupport,
    confirmed_customer_support: breakdown.customerConfirmedSupport,
    confirmed_driver_support: breakdown.partnerConfirmedSupport,
    planned_customer_support: breakdown.customerPlannedSupport,
    planned_total_support: breakdown.totalPlannedSupport,
  };
}

function mergeConfirmedBreakdown(
  row: QuoteSupportInput,
  breakdown: QuoteSupportBreakdown,
  options?: BuildQuoteSupportBreakdownOptions,
): QuoteSupportBreakdown {
  const normalPrice = breakdown.normalPrice;
  const confirmedTotal =
    breakdown.totalConfirmedSupport ?? resolveConfirmedTotalSupport(row, options);
  if (normalPrice == null || confirmedTotal == null || confirmedTotal <= 0) {
    return breakdown;
  }
  if (
    breakdown.supportDiscountAppliedPrice != null &&
    breakdown.finalDiscountAppliedPrice != null
  ) {
    return { ...breakdown, isConfirmed: true };
  }

  const planned = resolvePlannedSupportSnapshot(row as QuoteSupportRow, normalPrice, options);
  if (!planned) return breakdown;

  const computed = computeConfirmedFromPlanned({
    normalPrice,
    settlementType: resolveSettlementType(row.support_settlement_type),
    planned,
    confirmedTotal,
    extensionApplied: row.extension_applied === true,
    extensionSupportAmount: parseSupportInteger(row.extension_support_amount) ?? 0,
  });
  if ("error" in computed) {
    return breakdown;
  }

  return {
    ...breakdown,
    calculationStatus: "ok",
    isConfirmed: true,
    totalConfirmedSupport: confirmedTotal,
    customerConfirmedSupport: computed.customer,
    partnerConfirmedSupport: computed.driver,
    supportDiscountAppliedPrice: computed.discountPrice,
    finalDiscountAppliedPrice: computed.finalPrice,
    extensionSupport: computed.extensionSupport ?? 0,
  };
}

export type ClientMemberQuoteSupportFields = {
  price: number | null;
  member_price: number | null;
  support_discount_planned_price: number | null;
  support_discount_applied_price: number | null;
  final_discount_applied_price: number | null;
  confirmed_discount_price: number | null;
  support_breakdown: ClientSerializedSupportBreakdown;
  planned_total_support: number | null;
  planned_customer_support: number | null;
  planned_driver_support: number | null;
  confirmed_total_support: number | null;
  confirmed_customer_support: number | null;
  confirmed_driver_support: number | null;
  extension_support_amount: number | null;
  sponsor_quote_enabled: boolean;
};

export function buildClientMemberQuoteSupport(
  row: QuoteSupportInput,
  options?: BuildQuoteSupportBreakdownOptions,
): ClientMemberQuoteSupportFields {
  const initial = buildQuoteSupportBreakdown(row, options);
  const breakdown = mergeConfirmedBreakdown(row, initial, options);
  const clientBreakdown = serializeBreakdownForClient(breakdown);
  const applied =
    clientBreakdown.final_discount_applied_price ??
    clientBreakdown.confirmed_discount_price ??
    null;

  return {
    price: breakdown.normalPrice,
    member_price: breakdown.supportDiscountPlannedPrice,
    support_discount_planned_price: breakdown.supportDiscountPlannedPrice,
    support_discount_applied_price: applied,
    final_discount_applied_price: clientBreakdown.final_discount_applied_price,
    confirmed_discount_price: applied,
    support_breakdown: clientBreakdown,
    planned_total_support: breakdown.totalPlannedSupport,
    planned_customer_support: breakdown.customerPlannedSupport,
    planned_driver_support: breakdown.partnerPlannedSupport,
    confirmed_total_support: breakdown.totalConfirmedSupport,
    confirmed_customer_support: breakdown.customerConfirmedSupport,
    confirmed_driver_support: breakdown.partnerConfirmedSupport,
    extension_support_amount: breakdown.extensionSupport,
    sponsor_quote_enabled: breakdown.sponsorQuoteEnabled,
  };
}
