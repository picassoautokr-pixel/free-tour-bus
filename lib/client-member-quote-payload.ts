/**
 * 클라이언트 API 견적 응답 — support_breakdown·확정 할인가 (UTF-8)
 */

import { breakdownFromQuoteRow } from "@/lib/support-breakdown-snapshot";
import {
  buildQuoteSupportBreakdown,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";

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

export type ClientMemberQuoteSupportOptions = BuildQuoteSupportBreakdownOptions & {
  applicationSponsorStatus?: string;
  applicationTargetNormalPrice?: number | null;
  applicationTargetMemberPrice?: number | null;
};

export type ClientMemberQuoteSupportFields = {
  /** 일반견적가 */
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

function resolveNormalPrice(
  row: MemberQuoteRow,
  options?: ClientMemberQuoteSupportOptions,
): number {
  const fromRow = parseIntField(row.price);
  if (fromRow > 0) return fromRow;
  const fromApp = parseIntField(options?.applicationTargetNormalPrice);
  if (fromApp > 0) return fromApp;
  return parseIntField(row.target_normal_price);
}

function resolveEffectivePlannedCustomer(
  row: MemberQuoteRow,
  normalPrice: number,
  extensionSupport: number,
  options?: ClientMemberQuoteSupportOptions,
): number {
  const explicit = parseIntField(
    row.planned_customer_support ??
      row.customer_support_amount ??
      row.client_reward_amount ??
      row.support_discount_amount,
  );
  if (explicit > 0) return explicit;

  const targetNormal = parseIntField(options?.applicationTargetNormalPrice);
  const targetMember = parseIntField(options?.applicationTargetMemberPrice);
  if (targetNormal > 0 && targetMember > 0 && targetNormal > targetMember) {
    return Math.max(targetNormal - targetMember - extensionSupport, 0);
  }

  if (normalPrice > 0) {
    const memberOrDiscount = parseIntField(row.member_price ?? row.sponsor_discounted_price);
    if (memberOrDiscount > 0 && memberOrDiscount < normalPrice) {
      return Math.max(normalPrice - memberOrDiscount - extensionSupport, 0);
    }
  }
  return 0;
}

function resolveConfirmedTotalSupport(
  row: MemberQuoteRow,
  options?: ClientMemberQuoteSupportOptions,
): number {
  return parseIntField(
    row.confirmed_total_support ??
      row.sponsor_approved_support_amount ??
      row.approved_support_amount ??
      options?.sponsorApprovedSupportAmount ??
      options?.applicationApprovedSupportTotal,
  );
}

/**
 * 확정 시 고객 확정 지원금 = min(고객 예정, 총 확정)
 * 지원금 할인 적용가 = 일반견적가 - 고객 확정 지원금 - 연장 지원금
 */
function computeClientSupportFromRow(
  row: MemberQuoteRow,
  options?: ClientMemberQuoteSupportOptions,
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
  const normalPrice = resolveNormalPrice(row, options);
  const extensionSupport = parseIntField(row.extension_support_amount);
  const plannedCustomerSupport = resolveEffectivePlannedCustomer(
    row,
    normalPrice,
    extensionSupport,
    options,
  );
  const confirmedTotalSupport = resolveConfirmedTotalSupport(row, options);

  const quoteSponsorStatus = safeStatus(row.sponsor_support_status);
  const appSponsorStatus = safeStatus(options?.applicationSponsorStatus);
  const isConfirmed =
    quoteSponsorStatus === "approved" ||
    appSponsorStatus === "approved" ||
    confirmedTotalSupport > 0;

  const plannedDiscountPrice =
    normalPrice > 0 && plannedCustomerSupport > 0
      ? Math.max(normalPrice - plannedCustomerSupport - extensionSupport, 0)
      : null;

  let confirmedCustomerSupport: number | null = null;
  let driverConfirmedSupport: number | null = null;

  if (isConfirmed) {
    const storedCustomer = parseIntField(
      row.confirmed_customer_support ?? row.final_customer_support_amount,
    );
    if (storedCustomer > 0) {
      confirmedCustomerSupport = storedCustomer;
    } else if (plannedCustomerSupport > 0 && confirmedTotalSupport > 0) {
      confirmedCustomerSupport = Math.min(plannedCustomerSupport, confirmedTotalSupport);
    } else if (confirmedTotalSupport > 0) {
      confirmedCustomerSupport = confirmedTotalSupport;
    }

    if (confirmedCustomerSupport != null) {
      driverConfirmedSupport =
        confirmedTotalSupport > 0
          ? Math.max(confirmedTotalSupport - confirmedCustomerSupport, 0)
          : parseIntField(row.confirmed_driver_support) || null;
    }
  }

  let discountAppliedPrice: number | null = null;
  if (isConfirmed && normalPrice > 0 && confirmedCustomerSupport != null) {
    discountAppliedPrice = Math.max(
      normalPrice - confirmedCustomerSupport - extensionSupport,
      0,
    );
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
  const planned = computed.plannedDiscountPrice ?? base.supportDiscountPlannedPrice;
  const plannedCustomer =
    computed.plannedCustomerSupport > 0
      ? computed.plannedCustomerSupport
      : base.customerPlannedSupport;
  const confirmedTotal =
    computed.confirmedTotalSupport > 0
      ? computed.confirmedTotalSupport
      : base.totalConfirmedSupport;
  const confirmedCustomer =
    computed.confirmedCustomerSupport ?? base.customerConfirmedSupport;

  return {
    ...base,
    calculationStatus: "ok",
    isConfirmed: computed.isConfirmed,
    normalPrice: computed.normalPrice > 0 ? computed.normalPrice : base.normalPrice,
    customerPlannedSupport: plannedCustomer,
    supportDiscountPlannedPrice: planned,
    totalConfirmedSupport: confirmedTotal,
    customerConfirmedSupport: confirmedCustomer,
    partnerConfirmedSupport:
      computed.driverConfirmedSupport ?? base.partnerConfirmedSupport,
    supportDiscountAppliedPrice: applied ?? base.supportDiscountAppliedPrice,
    finalDiscountAppliedPrice: applied ?? base.finalDiscountAppliedPrice,
    extensionSupport: computed.extensionSupport,
    confirmed_discount_price: applied,
    final_discount_applied_price: applied,
    confirmed_total_support: confirmedTotal,
    confirmed_customer_support: confirmedCustomer,
    confirmed_driver_support:
      computed.driverConfirmedSupport ?? base.partnerConfirmedSupport,
    planned_customer_support: plannedCustomer,
    planned_total_support: base.totalPlannedSupport,
    is_confirmed: computed.isConfirmed,
  };
}

export function buildClientMemberQuoteSupport(
  row: QuoteSupportInput & MemberQuoteRow,
  options?: ClientMemberQuoteSupportOptions,
): ClientMemberQuoteSupportFields {
  const computed = computeClientSupportFromRow(row, options);
  const baseBreakdown =
    breakdownFromQuoteRow(row) ?? buildQuoteSupportBreakdown(row, options);
  const clientBreakdown = mergeSerializedBreakdown(baseBreakdown, computed);

  const applied = computed.discountAppliedPrice;
  const planned =
    computed.plannedDiscountPrice ??
    clientBreakdown.supportDiscountPlannedPrice ??
    (computed.normalPrice > 0 && computed.plannedCustomerSupport > 0
      ? Math.max(
          computed.normalPrice - computed.plannedCustomerSupport - computed.extensionSupport,
          0,
        )
      : null);

  return {
    price: computed.normalPrice > 0 ? computed.normalPrice : null,
    member_price: planned,
    support_discount_planned_price: planned,
    support_discount_applied_price: applied,
    final_discount_applied_price: applied,
    confirmed_discount_price: applied,
    support_breakdown: clientBreakdown,
    planned_total_support: clientBreakdown.planned_total_support ?? clientBreakdown.totalPlannedSupport,
    planned_customer_support:
      computed.plannedCustomerSupport > 0 ? computed.plannedCustomerSupport : null,
    planned_driver_support: clientBreakdown.partnerPlannedSupport,
    confirmed_total_support:
      computed.isConfirmed && computed.confirmedTotalSupport > 0
        ? computed.confirmedTotalSupport
        : null,
    confirmed_customer_support: computed.confirmedCustomerSupport,
    confirmed_driver_support: computed.driverConfirmedSupport,
    extension_support_amount: computed.extensionSupport,
    sponsor_quote_enabled: baseBreakdown.sponsorQuoteEnabled,
  };
}

/** API 응답 후 클라이언트 상태 — support_breakdown·필수 숫자 필드 보강 */
export function applyClientPartnerQuoteApiFields(
  quote: ClientQuote,
  application?: Pick<
    ClientApplication,
    | "sponsor_support_status"
    | "sponsor_approved_support_amount"
    | "target_normal_price"
    | "target_member_price"
  >,
): ClientQuote {
  if (quote.source !== "member") return quote;

  const breakdown = quote.support_breakdown as ClientSerializedSupportBreakdown | null | undefined;
  const normalPrice =
    quote.price ??
    breakdown?.normalPrice ??
    application?.target_normal_price ??
    null;
  const plannedCustomer =
    quote.planned_customer_support ??
    breakdown?.planned_customer_support ??
    breakdown?.customerPlannedSupport ??
    quote.customer_support_amount ??
    null;
  const confirmedTotal =
    quote.confirmed_total_support ??
    breakdown?.confirmed_total_support ??
    breakdown?.totalConfirmedSupport ??
    quote.sponsor_approved_support_amount ??
    application?.sponsor_approved_support_amount ??
    null;
  let confirmedCustomer =
    quote.confirmed_customer_support ??
    breakdown?.confirmed_customer_support ??
    breakdown?.customerConfirmedSupport ??
    null;
  const extension = quote.extension_support_amount ?? breakdown?.extensionSupport ?? 0;

  const sponsorStatus =
    quote.sponsor_support_status ??
    quote.support_status ??
    application?.sponsor_support_status;
  const isConfirmed =
    sponsorStatus === "approved" ||
    breakdown?.is_confirmed === true ||
    breakdown?.isConfirmed === true ||
    (confirmedTotal != null && confirmedTotal > 0);

  if (
    isConfirmed &&
    confirmedCustomer == null &&
    plannedCustomer != null &&
    confirmedTotal != null
  ) {
    confirmedCustomer = Math.min(plannedCustomer, confirmedTotal);
  }

  let applied =
    quote.final_discount_applied_price ??
    quote.support_discount_applied_price ??
    quote.confirmed_discount_price ??
    breakdown?.final_discount_applied_price ??
    breakdown?.finalDiscountAppliedPrice ??
    breakdown?.supportDiscountAppliedPrice ??
    null;

  if (applied == null && isConfirmed && normalPrice != null && confirmedCustomer != null) {
    applied = Math.max(normalPrice - confirmedCustomer - extension, 0);
  }

  const hydratedBreakdown: ClientSerializedSupportBreakdown | null | undefined = breakdown
    ? ({
        ...breakdown,
        normalPrice: normalPrice ?? breakdown.normalPrice,
        customerPlannedSupport: plannedCustomer ?? breakdown.customerPlannedSupport,
        planned_customer_support: plannedCustomer ?? breakdown.planned_customer_support,
        totalConfirmedSupport: confirmedTotal ?? breakdown.totalConfirmedSupport,
        confirmed_total_support: confirmedTotal ?? breakdown.confirmed_total_support,
        customerConfirmedSupport: confirmedCustomer ?? breakdown.customerConfirmedSupport,
        confirmed_customer_support: confirmedCustomer ?? breakdown.confirmed_customer_support,
        supportDiscountAppliedPrice: applied ?? breakdown.supportDiscountAppliedPrice,
        finalDiscountAppliedPrice: applied ?? breakdown.finalDiscountAppliedPrice,
        final_discount_applied_price: applied ?? breakdown.final_discount_applied_price,
        confirmed_discount_price: applied ?? breakdown.confirmed_discount_price,
        isConfirmed: isConfirmed || breakdown.isConfirmed,
        is_confirmed: isConfirmed || breakdown.is_confirmed,
      } as ClientSerializedSupportBreakdown)
    : (quote.support_breakdown as ClientSerializedSupportBreakdown | null | undefined);

  return {
    ...quote,
    price: normalPrice ?? quote.price,
    planned_customer_support: plannedCustomer ?? quote.planned_customer_support,
    confirmed_total_support: confirmedTotal ?? quote.confirmed_total_support,
    confirmed_customer_support: confirmedCustomer ?? quote.confirmed_customer_support,
    final_discount_applied_price: applied,
    support_discount_applied_price: applied,
    confirmed_discount_price: applied,
    sponsor_approved_support_amount:
      quote.sponsor_approved_support_amount ?? application?.sponsor_approved_support_amount,
    support_breakdown: hydratedBreakdown ?? quote.support_breakdown,
  };
}
