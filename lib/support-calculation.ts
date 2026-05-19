/**
 * 지원금 계산 단일 소스 (DB 저장 · API · 대시보드 공통)
 */

import {
  computeConfirmedFromPlanned,
  readPlannedSupport,
  readStoredConfirmedSupport,
  type QuoteSupportRow,
} from "@/lib/quote-support-snapshot";

export const DEFAULT_SUPPORT_PER_PERSON = 20_000;
export const DEFAULT_MAX_SUPPORT_AMOUNT = 800_000;

export type SupportSettlementType = "client_priority" | "ratio";

export type QuoteSupportBreakdown = {
  calculationStatus: "ok" | "failed" | "incomplete";
  calculationError?: string;
  settlementType: SupportSettlementType;
  sponsorQuoteEnabled: boolean;
  normalPrice: number | null;
  totalPlannedSupport: number | null;
  customerPlannedSupport: number | null;
  partnerPlannedSupport: number | null;
  supportDiscountPlannedPrice: number | null;
  totalConfirmedSupport: number | null;
  customerConfirmedSupport: number | null;
  partnerConfirmedSupport: number | null;
  supportDiscountAppliedPrice: number | null;
  extensionSupport: number | null;
  finalDiscountAppliedPrice: number | null;
  isConfirmed: boolean;
};

export type QuoteSupportInput = {
  price?: unknown;
  support_settlement_type?: unknown;
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
  preapproved_support_amount?: unknown;
  approved_support_amount?: unknown;
  estimated_support_amount?: unknown;
  customer_support_amount?: unknown;
  support_discount_amount?: unknown;
  driver_support_amount?: unknown;
  final_customer_support_amount?: unknown;
  final_driver_support_amount?: unknown;
  member_price?: unknown;
  final_member_price?: unknown;
  sponsor_discounted_price?: unknown;
  sponsor_support_amount?: unknown;
  sponsor_quote_enabled?: unknown;
  extension_support_amount?: unknown;
  extension_applied?: boolean;
};

export function parseSupportInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number.parseInt(trimmed.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function calculateTotalPlannedSupport(params: {
  passengerCount: number;
  supportPerPerson?: number;
  supportPerCase?: number;
  maxSupportAmount?: number;
  maxPassengerCount?: number;
  dailyBudgetRemaining?: number | null;
}): number {
  const perPerson = params.supportPerPerson ?? DEFAULT_SUPPORT_PER_PERSON;
  const perCase = params.supportPerCase ?? 0;
  const maxSupport = params.maxSupportAmount ?? DEFAULT_MAX_SUPPORT_AMOUNT;
  const maxPassengers = params.maxPassengerCount ?? 0;
  const passengers = Math.max(0, Math.trunc(params.passengerCount));
  const eligiblePassengers =
    maxPassengers > 0 ? Math.min(passengers, maxPassengers) : passengers;
  const raw = eligiblePassengers * perPerson + perCase;
  const limits = [raw];
  if (maxSupport > 0) limits.push(maxSupport);
  if (params.dailyBudgetRemaining != null && params.dailyBudgetRemaining >= 0) {
    limits.push(params.dailyBudgetRemaining);
  }
  return Math.max(0, Math.min(...limits));
}

export function calculateSupportDistribution(input: {
  settlementType: SupportSettlementType;
  totalPlanned: number;
  customerPlanned: number;
  partnerPlanned: number;
  totalConfirmed: number;
}): { customerAmount: number; partnerAmount: number } {
  const totalPlanned = Math.max(0, input.totalPlanned);
  const totalConfirmed = Math.max(0, input.totalConfirmed);
  const customerPlanned = Math.max(0, input.customerPlanned);
  const partnerPlanned = Math.max(0, input.partnerPlanned);

  if (totalConfirmed <= 0) {
    return { customerAmount: 0, partnerAmount: 0 };
  }

  if (input.settlementType === "ratio" && totalPlanned > 0) {
    const plannedCustomer = Math.min(customerPlanned, totalPlanned);
    const customerRatio = plannedCustomer / totalPlanned;
    const customerAmount = Math.round(totalConfirmed * customerRatio);
    return {
      customerAmount,
      partnerAmount: Math.max(totalConfirmed - customerAmount, 0),
    };
  }

  const customerAmount = Math.min(customerPlanned, totalConfirmed);
  return {
    customerAmount,
    partnerAmount: Math.max(totalConfirmed - customerAmount, 0),
  };
}

export function calculateSupportDiscountPrice(
  normalPrice: number | null,
  customerSupportAmount: number,
): number | null {
  if (normalPrice == null) return null;
  return Math.max(normalPrice - Math.max(0, customerSupportAmount), 0);
}

/** 연장 지원금 = 제휴기사 확정 지원금 × 20% */
/** 견적 작성 시 연장 지원금 = 기사 예정 지원금 × 회차별 고객 비율 */
export function extensionPlannedFromPartnerSupport(
  partnerPlannedSupport: number,
  extensionRound: number,
): number {
  if (extensionRound <= 0 || partnerPlannedSupport <= 0) return 0;
  const clientPct = extensionRound === 1 ? 20 : 40;
  return Math.round((partnerPlannedSupport * clientPct) / 100);
}

export function calculateExtensionSupport(partnerConfirmedSupport: number): number {
  return Math.round(Math.max(0, partnerConfirmedSupport) * 0.2);
}

export function resolveSettlementType(value: unknown): SupportSettlementType {
  return safeText(value) === "ratio" ? "ratio" : "client_priority";
}

function safeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function buildQuoteSupportBreakdown(
  quote: QuoteSupportInput,
  options?: { applicationApprovedSupportTotal?: number | null },
): QuoteSupportBreakdown {
  const row = quote as QuoteSupportRow;
  const settlementType = resolveSettlementType(quote.support_settlement_type);
  const normalPrice = parseSupportInteger(quote.price);
  const sponsorQuoteEnabled =
    quote.sponsor_quote_enabled === true ||
    parseSupportInteger(quote.planned_total_support) != null ||
    parseSupportInteger(quote.customer_support_amount) != null ||
    parseSupportInteger(quote.support_discount_amount) != null ||
    parseSupportInteger(quote.preapproved_support_amount) != null ||
    parseSupportInteger(quote.estimated_support_amount) != null;

  if (!sponsorQuoteEnabled || normalPrice == null) {
    return {
      calculationStatus: sponsorQuoteEnabled && normalPrice == null ? "incomplete" : "ok",
      settlementType,
      sponsorQuoteEnabled,
      normalPrice,
      totalPlannedSupport: null,
      customerPlannedSupport: null,
      partnerPlannedSupport: null,
      supportDiscountPlannedPrice: normalPrice,
      totalConfirmedSupport: null,
      customerConfirmedSupport: null,
      partnerConfirmedSupport: null,
      supportDiscountAppliedPrice: null,
      extensionSupport: null,
      finalDiscountAppliedPrice: null,
      isConfirmed: false,
    };
  }

  try {
    const planned = readPlannedSupport(row, normalPrice);
    if (!planned) {
      return {
        calculationStatus: "failed",
        calculationError: "예정 지원금 데이터가 없습니다.",
        settlementType,
        sponsorQuoteEnabled,
        normalPrice,
        totalPlannedSupport: null,
        customerPlannedSupport: null,
        partnerPlannedSupport: null,
        supportDiscountPlannedPrice: null,
        totalConfirmedSupport: null,
        customerConfirmedSupport: null,
        partnerConfirmedSupport: null,
        supportDiscountAppliedPrice: null,
        extensionSupport: null,
        finalDiscountAppliedPrice: null,
        isConfirmed: false,
      };
    }

    const confirmedTotal =
      parseSupportInteger(quote.confirmed_total_support) ??
      (parseSupportInteger(quote.approved_support_amount) != null &&
      (parseSupportInteger(quote.approved_support_amount) ?? 0) > 0
        ? parseSupportInteger(quote.approved_support_amount)
        : null) ??
      (options?.applicationApprovedSupportTotal != null &&
      options.applicationApprovedSupportTotal > 0
        ? options.applicationApprovedSupportTotal
        : null);

    const isConfirmed = confirmedTotal != null && confirmedTotal > 0;

    let customerConfirmed: number | null = null;
    let partnerConfirmed: number | null = null;
    let supportDiscountAppliedPrice: number | null = null;
    let extensionSupport: number | null = null;
    let finalDiscountAppliedPrice: number | null = null;

    if (isConfirmed && confirmedTotal != null) {
      const stored = readStoredConfirmedSupport(row);
      if (stored && stored.total === confirmedTotal) {
        customerConfirmed = stored.customer;
        partnerConfirmed = stored.driver;
        supportDiscountAppliedPrice = stored.discountPrice;
        extensionSupport = stored.extensionSupport;
        finalDiscountAppliedPrice = stored.finalPrice;
      } else {
        const computed = computeConfirmedFromPlanned({
          normalPrice,
          settlementType,
          planned,
          confirmedTotal,
          extensionApplied: quote.extension_applied,
          extensionSupportAmount: parseSupportInteger(quote.extension_support_amount),
        });
        if ("error" in computed) {
          return {
            calculationStatus: "failed",
            calculationError: computed.error,
            settlementType,
            sponsorQuoteEnabled,
            normalPrice,
            totalPlannedSupport: planned.total,
            customerPlannedSupport: planned.customer,
            partnerPlannedSupport: planned.driver,
            supportDiscountPlannedPrice: planned.discountPrice,
            totalConfirmedSupport: confirmedTotal,
            customerConfirmedSupport: null,
            partnerConfirmedSupport: null,
            supportDiscountAppliedPrice: null,
            extensionSupport: null,
            finalDiscountAppliedPrice: null,
            isConfirmed: true,
          };
        }
        customerConfirmed = computed.customer;
        partnerConfirmed = computed.driver;
        supportDiscountAppliedPrice = computed.discountPrice;
        extensionSupport = computed.extensionSupport;
        finalDiscountAppliedPrice = computed.finalPrice;
      }
    }

    return {
      calculationStatus: "ok",
      settlementType,
      sponsorQuoteEnabled,
      normalPrice,
      totalPlannedSupport: planned.total,
      customerPlannedSupport: planned.customer,
      partnerPlannedSupport: planned.driver,
      supportDiscountPlannedPrice: planned.discountPrice,
      totalConfirmedSupport: confirmedTotal,
      customerConfirmedSupport: customerConfirmed,
      partnerConfirmedSupport: partnerConfirmed,
      supportDiscountAppliedPrice,
      extensionSupport,
      finalDiscountAppliedPrice,
      isConfirmed,
    };
  } catch (error) {
    return {
      calculationStatus: "failed",
      calculationError: error instanceof Error ? error.message : "계산 실패",
      settlementType,
      sponsorQuoteEnabled,
      normalPrice,
      totalPlannedSupport: null,
      customerPlannedSupport: null,
      partnerPlannedSupport: null,
      supportDiscountPlannedPrice: null,
      totalConfirmedSupport: null,
      customerConfirmedSupport: null,
      partnerConfirmedSupport: null,
      supportDiscountAppliedPrice: null,
      extensionSupport: null,
      finalDiscountAppliedPrice: null,
      isConfirmed: false,
    };
  }
}

/** 표시 단계: confirmed/final 은 isConfirmed=false 이면 항상 '미확정' */
export type FormatSupportAmountPhase = "planned" | "confirmed" | "final";

export type FormatSupportAmountOptions = {
  phase?: FormatSupportAmountPhase;
  calculationStatus?: QuoteSupportBreakdown["calculationStatus"];
  isConfirmed?: boolean;
};

/**
 * 지원금/견적가 공통 포맷 (고객·제휴기사·어드민 동일)
 * - null/undefined → "미확정"
 * - calculationStatus failed → "계산 실패"
 * - 확정·최종 단계 + 미확정 → "미확정"
 * - 숫자 0 포함 → "0원"
 */
export function formatSupportAmount(
  value: number | null | undefined,
  options?: FormatSupportAmountOptions,
): string {
  if (options?.calculationStatus === "failed") {
    return "계산 실패";
  }
  const requiresConfirmation =
    options?.phase === "confirmed" || options?.phase === "final";
  if (requiresConfirmation && options?.isConfirmed !== true) {
    return "미확정";
  }
  if (value == null) {
    return "미확정";
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatSupportAmountFromBreakdown(
  breakdown: QuoteSupportBreakdown,
  value: number | null | undefined,
  phase: FormatSupportAmountPhase,
): string {
  return formatSupportAmount(value, {
    phase,
    calculationStatus: breakdown.calculationStatus,
    isConfirmed: breakdown.isConfirmed,
  });
}

export const SETTLEMENT_TYPE_LABELS: Record<SupportSettlementType, string> = {
  client_priority: "고객 지원금 우선보장",
  ratio: "비율정산",
};

/** @deprecated calculateSupportSettlement 호환 — driver-quote-support에서 사용 */
export function calculateSupportSettlementResult(input: {
  price: number | null;
  supportSettlementType?: string | null;
  preapprovedSupportAmount: number;
  approvedSupportAmount: number;
  customerSupportAmount: number;
  driverSupportAmount: number;
  fallbackMemberPrice?: number | null;
  extensionApplied?: boolean;
  extensionSupportAmount?: number | null;
}) {
  const breakdown = buildQuoteSupportBreakdown(
    {
      price: input.price,
      support_settlement_type: input.supportSettlementType,
      preapproved_support_amount: input.preapprovedSupportAmount,
      approved_support_amount: input.approvedSupportAmount,
      customer_support_amount: input.customerSupportAmount,
      driver_support_amount: input.driverSupportAmount,
      sponsor_quote_enabled: true,
      extension_applied: input.extensionApplied,
      extension_support_amount: input.extensionSupportAmount,
    },
    { applicationApprovedSupportTotal: input.approvedSupportAmount },
  );

  const customerForPrice =
    breakdown.isConfirmed && breakdown.customerConfirmedSupport != null
      ? breakdown.customerConfirmedSupport
      : breakdown.customerPlannedSupport ?? input.customerSupportAmount;

  return {
    finalCustomerSupportAmount: breakdown.isConfirmed
      ? breakdown.customerConfirmedSupport
      : breakdown.customerPlannedSupport,
    finalDriverSupportAmount: breakdown.isConfirmed
      ? breakdown.partnerConfirmedSupport
      : breakdown.partnerPlannedSupport,
    finalMemberPrice:
      breakdown.isConfirmed && breakdown.supportDiscountAppliedPrice != null
        ? breakdown.supportDiscountAppliedPrice
        : breakdown.supportDiscountPlannedPrice ??
          (input.price == null
            ? input.fallbackMemberPrice ?? null
            : Math.max(input.price - customerForPrice, 0)),
    extensionSupportAmount: breakdown.extensionSupport,
    finalDiscountAppliedPrice: breakdown.finalDiscountAppliedPrice,
    breakdown,
  };
}
