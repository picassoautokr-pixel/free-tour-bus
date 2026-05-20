import {
  calculateExtensionSupport,
  calculateSupportDiscountPrice,
  calculateSupportDistribution,
  parseSupportInteger,
  resolvePlannedSupportSnapshot,
  resolveSettlementType,
  type PlannedSupportResolveContext,
  type SupportSettlementType,
} from "@/lib/support-calculation";

export type PlannedSupportSnapshot = {
  total: number;
  customer: number;
  driver: number;
  discountPrice: number;
  finalPrice: number;
};

export type ConfirmedSupportSnapshot = {
  total: number;
  customer: number;
  driver: number;
  discountPrice: number;
  finalPrice: number;
  extensionSupport: number | null;
};

export type QuoteSupportRow = {
  id?: unknown;
  price?: unknown;
  support_settlement_type?: unknown;
  sponsor_quote_enabled?: unknown;
  planned_total_support?: unknown;
  planned_customer_support?: unknown;
  planned_driver_support?: unknown;
  planned_discount_price?: unknown;
  planned_final_price?: unknown;
  confirmed_total_support?: unknown;
  confirmed_customer_support?: unknown;
  confirmed_driver_support?: unknown;
  confirmed_discount_price?: unknown;
  confirmed_final_price?: unknown;
  extension_support_amount?: unknown;
  preapproved_support_amount?: unknown;
  estimated_support_amount?: unknown;
  sponsor_support_amount?: unknown;
  customer_support_amount?: unknown;
  support_discount_amount?: unknown;
  driver_support_amount?: unknown;
  member_price?: unknown;
  sponsor_discounted_price?: unknown;
  approved_support_amount?: unknown;
  final_customer_support_amount?: unknown;
  final_driver_support_amount?: unknown;
  final_member_price?: unknown;
  client_reward_amount?: unknown;
};

/** 예정값만 읽음 — lib/support-calculation.resolvePlannedSupportSnapshot 위임 */
export function readPlannedSupport(
  row: QuoteSupportRow,
  normalPrice: number | null,
  ctx?: PlannedSupportResolveContext,
): PlannedSupportSnapshot | null {
  return resolvePlannedSupportSnapshot(row, normalPrice, ctx);
}

export function readStoredConfirmedSupport(
  row: QuoteSupportRow,
): ConfirmedSupportSnapshot | null {
  const total = parseSupportInteger(row.confirmed_total_support);
  if (total == null || total <= 0) return null;

  const customer = parseSupportInteger(row.confirmed_customer_support);
  const driver = parseSupportInteger(row.confirmed_driver_support);
  const discountPrice = parseSupportInteger(row.confirmed_discount_price);
  const finalPrice = parseSupportInteger(row.confirmed_final_price);
  if (customer == null || driver == null || discountPrice == null || finalPrice == null) {
    return null;
  }

  return {
    total,
    customer,
    driver,
    discountPrice,
    finalPrice,
    extensionSupport: parseSupportInteger(row.extension_support_amount),
  };
}

/** 후원업체 확정 총액 + 견적 제출 시 예정 스냅샷 → 확정 스냅샷 재계산 */
export function computeConfirmedFromPlanned(params: {
  normalPrice: number;
  settlementType: SupportSettlementType;
  planned: PlannedSupportSnapshot;
  confirmedTotal: number;
  extensionApplied?: boolean;
  extensionSupportAmount?: number | null;
}): ConfirmedSupportSnapshot | { error: string } {
  const confirmedTotal = Math.max(0, Math.trunc(params.confirmedTotal));
  if (confirmedTotal <= 0) {
    return { error: "총 확정 지원금이 없습니다." };
  }

  const distributed = calculateSupportDistribution({
    settlementType: params.settlementType,
    totalPlanned: params.planned.total,
    customerPlanned: params.planned.customer,
    partnerPlanned: params.planned.driver,
    totalConfirmed: confirmedTotal,
  });

  const discountPrice = calculateSupportDiscountPrice(
    params.normalPrice,
    distributed.customerAmount,
  );
  if (discountPrice == null) {
    return { error: "지원금 할인 적용가를 계산할 수 없습니다." };
  }

  const extensionSupport =
    params.extensionSupportAmount != null
      ? params.extensionSupportAmount
      : params.extensionApplied === true
        ? calculateExtensionSupport(distributed.partnerAmount)
        : null;

  const finalPrice =
    extensionSupport != null
      ? Math.max(discountPrice - extensionSupport, 0)
      : discountPrice;

  return {
    total: confirmedTotal,
    customer: distributed.customerAmount,
    driver: distributed.partnerAmount,
    discountPrice,
    finalPrice,
    extensionSupport,
  };
}

export function buildPlannedDbPayload(planned: PlannedSupportSnapshot) {
  return {
    planned_total_support: planned.total,
    planned_customer_support: planned.customer,
    planned_driver_support: planned.driver,
    planned_discount_price: planned.discountPrice,
    planned_final_price: planned.finalPrice,
    preapproved_support_amount: planned.total,
    estimated_support_amount: planned.total,
    sponsor_support_amount: planned.total,
    customer_support_amount: planned.customer,
    support_discount_amount: planned.customer,
    driver_support_amount: planned.driver,
    member_price: planned.discountPrice,
    sponsor_discounted_price: planned.discountPrice,
  };
}

/** 확정 필드만 갱신 — planned_* / customer_support_amount 등 예정 컬럼 미포함 */
export function buildConfirmedDbPayload(confirmed: ConfirmedSupportSnapshot) {
  return {
    confirmed_total_support: confirmed.total,
    confirmed_customer_support: confirmed.customer,
    confirmed_driver_support: confirmed.driver,
    confirmed_discount_price: confirmed.discountPrice,
    confirmed_final_price: confirmed.finalPrice,
    approved_support_amount: confirmed.total,
    final_customer_support_amount: confirmed.customer,
    final_driver_support_amount: confirmed.driver,
    final_member_price: confirmed.discountPrice,
    extension_support_amount: confirmed.extensionSupport,
    support_recalculated_at: new Date().toISOString(),
  };
}

export const DRIVER_QUOTE_SUPPORT_SELECT = [
  "id",
  "price",
  "support_settlement_type",
  "sponsor_quote_enabled",
  "planned_total_support",
  "planned_customer_support",
  "planned_driver_support",
  "planned_discount_price",
  "planned_final_price",
  "confirmed_total_support",
  "confirmed_customer_support",
  "confirmed_driver_support",
  "confirmed_discount_price",
  "confirmed_final_price",
  "preapproved_support_amount",
  "estimated_support_amount",
  "customer_support_amount",
  "support_discount_amount",
  "driver_support_amount",
  "sponsor_support_amount",
  "approved_support_amount",
  "member_price",
  "sponsor_discounted_price",
  "final_customer_support_amount",
  "final_driver_support_amount",
  "final_member_price",
  "extension_support_amount",
].join(", ");

export function clearConfirmedDbPayload() {
  return {
    confirmed_total_support: null,
    confirmed_customer_support: null,
    confirmed_driver_support: null,
    confirmed_discount_price: null,
    confirmed_final_price: null,
    approved_support_amount: null,
    final_customer_support_amount: null,
    final_driver_support_amount: null,
    final_member_price: null,
    extension_support_amount: null,
  };
}
