/**
 * 클라이언트 API 견적 응답 — support_breakdown·확정 할인가 (UTF-8)
 */

import {
  buildQuoteSupportBreakdown,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";

/** 클라이언트 JSON — camelCase + snake_case 병행 */
export type ClientSerializedSupportBreakdown = QuoteSupportBreakdown & {
  confirmed_discount_price: number | null;
  final_discount_applied_price: number | null;
  confirmed_total_support: number | null;
  confirmed_customer_support: number | null;
  confirmed_driver_support: number | null;
  planned_customer_support: number | null;
  planned_total_support: number | null;
  is_confirmed: boolean;
};

function parseIntField(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
}

function safeStatus(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

type MemberQuoteRow = Record<string, unknown>;

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

/**
 * DB 컬럼명 혼용 → 고객 대시보드용 support_breakdown·할인가 계산
 */
function computeClientSupportFromRow(
  row: MemberQuoteRow,
  options?: BuildQuoteSupportBreakdownOptions & {
    applicationSponsorStatus?: string;
  },
): {
  normalPrice: number;
  plannedCustomerSupport: number;
  confirmedTotalSupport: number;
  extensionSupport: number;
  isConfirmed: boolean;
  confirmedCustomerSupport: number | null;
  discountAppliedPrice: number | null;
  plannedDiscountPrice: number | null;
  driverConfirmedSupport: number | null;
} {
  const normalPrice = parseIntField(row.price ?? row.member_price);
  const plannedCustomerSupport = parseIntField(
    row.planned_customer_support ??
      row.customer_support_amount ??
      row.client_reward_amount ??
      row.support_discount_amount,
  );
  const confirmedTotalSupport = parseIntField(
    row.confirmed_total_support ??
      row.sponsor_approved_support_amount ??
      row.approved_support_amount ??
      options?.sponsorApprovedSupportAmount ??
      options?.applicationApprovedSupportTotal,
  );
  const extensionSupport = parseIntField(row.extension_support_amount);

  const quoteSponsorStatus = safeStatus(row.sponsor_support_status);
  const appSponsorStatus = safeStatus(options?.applicationSponsorStatus);
  const isConfirmed =
    quoteSponsorStatus === "approved" ||
    appSponsorStatus === "approved" ||
    confirmedTotalSupport > 0;

  let plannedDiscountPrice: number | null = null;
  if (normalPrice > 0 && plannedCustomerSupport > 0) {
    plannedDiscountPrice = Math.max(normalPrice - plannedCustomerSupport - extensionSupport, 0);
  }

  let confirmedCustomerSupport: number | null = null;
  let discountAppliedPrice: number | null = null;
  let driverConfirmedSupport: number | null = null;

  if (isConfirmed && normalPrice > 0) {
    const storedCustomer = parseIntField(
      row.confirmed_customer_support ?? row.final_customer_support_amount,
    );
    const storedDiscount = parseIntField(
      row.confirmed_discount_price ?? row.confirmed_final_price ?? row.final_member_price,
    );

    if (storedCustomer > 0 && storedDiscount > 0 && storedDiscount < normalPrice) {
      confirmedCustomerSupport = storedCustomer;
      discountAppliedPrice = storedDiscount;
      driverConfirmedSupport = parseIntField(row.confirmed_driver_support);
    } else if (plannedCustomerSupport > 0 && confirmedTotalSupport > 0) {
      confirmedCustomerSupport = Math.min(plannedCustomerSupport, confirmedTotalSupport);
      driverConfirmedSupport = Math.max(confirmedTotalSupport - confirmedCustomerSupport, 0);
      discountAppliedPrice = Math.max(
        normalPrice - confirmedCustomerSupport - extensionSupport,
        0,
      );
    } else if (confirmedTotalSupport > 0) {
      confirmedCustomerSupport = confirmedTotalSupport;
      discountAppliedPrice = Math.max(normalPrice - confirmedTotalSupport - extensionSupport, 0);
    }
  }

  return {
    normalPrice,
    plannedCustomerSupport,
    confirmedTotalSupport,
    extensionSupport,
    isConfirmed,
    confirmedCustomerSupport,
    discountAppliedPrice,
    plannedDiscountPrice,
    driverConfirmedSupport,
  };
}

function mergeSerializedBreakdown(
  base: QuoteSupportBreakdown,
  computed: ReturnType<typeof computeClientSupportFromRow>,
): ClientSerializedSupportBreakdown {
  const applied = computed.discountAppliedPrice;
  const finalApplied = applied;
  const planned = computed.plannedDiscountPrice ?? base.supportDiscountPlannedPrice;
  return {
    ...base,
    calculationStatus: "ok",
    isConfirmed: computed.isConfirmed,
    normalPrice: computed.normalPrice || base.normalPrice,
    totalPlannedSupport: computed.plannedCustomerSupport > 0 ? base.totalPlannedSupport : base.totalPlannedSupport,
    customerPlannedSupport:
      computed.plannedCustomerSupport > 0
        ? computed.plannedCustomerSupport
        : base.customerPlannedSupport,
    supportDiscountPlannedPrice: planned,
    totalConfirmedSupport:
      computed.confirmedTotalSupport > 0
        ? computed.confirmedTotalSupport
        : base.totalConfirmedSupport,
    customerConfirmedSupport: computed.confirmedCustomerSupport ?? base.customerConfirmedSupport,
    partnerConfirmedSupport:
      computed.driverConfirmedSupport ?? base.partnerConfirmedSupport,
    supportDiscountAppliedPrice: applied ?? base.supportDiscountAppliedPrice,
    finalDiscountAppliedPrice: finalApplied ?? base.finalDiscountAppliedPrice,
    extensionSupport: computed.extensionSupport,
    confirmed_discount_price: applied,
    final_discount_applied_price: finalApplied,
    confirmed_total_support:
      computed.confirmedTotalSupport > 0
        ? computed.confirmedTotalSupport
        : base.totalConfirmedSupport,
    confirmed_customer_support: computed.confirmedCustomerSupport,
    confirmed_driver_support: computed.driverConfirmedSupport ?? base.partnerConfirmedSupport,
    planned_customer_support:
      computed.plannedCustomerSupport > 0
        ? computed.plannedCustomerSupport
        : base.customerPlannedSupport,
    planned_total_support: base.totalPlannedSupport,
    is_confirmed: computed.isConfirmed,
  };
}

export function buildClientMemberQuoteSupport(
  row: QuoteSupportInput & MemberQuoteRow,
  options?: BuildQuoteSupportBreakdownOptions & {
    applicationSponsorStatus?: string;
  },
): ClientMemberQuoteSupportFields {
  const computed = computeClientSupportFromRow(row, options);
  const baseBreakdown = buildQuoteSupportBreakdown(row, options);
  const clientBreakdown = mergeSerializedBreakdown(baseBreakdown, computed);

  const applied =
    clientBreakdown.final_discount_applied_price ??
    clientBreakdown.confirmed_discount_price ??
    null;
  const planned =
    clientBreakdown.supportDiscountPlannedPrice ??
    computed.plannedDiscountPrice ??
    (computed.normalPrice > 0 && computed.plannedCustomerSupport > 0
      ? Math.max(computed.normalPrice - computed.plannedCustomerSupport - computed.extensionSupport, 0)
      : null);

  return {
    price: computed.normalPrice > 0 ? computed.normalPrice : baseBreakdown.normalPrice,
    member_price: planned,
    support_discount_planned_price: planned,
    support_discount_applied_price: applied,
    final_discount_applied_price: clientBreakdown.final_discount_applied_price,
    confirmed_discount_price: applied,
    support_breakdown: clientBreakdown,
    planned_total_support: clientBreakdown.planned_total_support ?? clientBreakdown.totalPlannedSupport,
    planned_customer_support:
      computed.plannedCustomerSupport > 0
        ? computed.plannedCustomerSupport
        : clientBreakdown.planned_customer_support,
    planned_driver_support: clientBreakdown.partnerPlannedSupport,
    confirmed_total_support: clientBreakdown.confirmed_total_support,
    confirmed_customer_support: clientBreakdown.confirmed_customer_support,
    confirmed_driver_support: clientBreakdown.confirmed_driver_support,
    extension_support_amount: computed.extensionSupport,
    sponsor_quote_enabled: baseBreakdown.sponsorQuoteEnabled,
  };
}
