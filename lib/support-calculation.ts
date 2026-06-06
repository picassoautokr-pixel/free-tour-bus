/**
 * 지원금 계산 단일 소스 (DB 저장 · API · 대시보드 공통)
 */

import {
  computeConfirmedFromPlanned,
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
  client_reward_amount?: unknown;
  sponsor_approved_support_amount?: unknown;
  support_breakdown?: Pick<QuoteSupportBreakdown, "totalConfirmedSupport" | "isConfirmed"> | null;
};

export type PlannedSupportResolveContext = {
  applicationTotalPlannedSupport?: number | null;
  sponsorEstimatedSupportAmount?: number | null;
  sponsorApprovedSupportAmount?: number | null;
};

export type BuildQuoteSupportBreakdownOptions = {
  applicationApprovedSupportTotal?: number | null;
} & PlannedSupportResolveContext;

export type PlannedSupportSnapshot = {
  total: number;
  customer: number;
  driver: number;
  discountPrice: number;
  finalPrice: number;
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

/** 고객 확정 지원금 역산 공식 (클라이언트·파트너·어드민 공통) */
export const CONFIRMED_CUSTOMER_DERIVE_FORMULA =
  "normal_price - final_discount_price";

export type ConfirmedCustomerSupportSource =
  | "support_breakdown"
  | "quote_field"
  | "derived_from_price"
  | "missing";

/**
 * 일반견적가 − 지원금 할인 적용가
 */
export function deriveCustomerConfirmedSupport(params: {
  normalPrice: number | null;
  finalDiscountPrice: number | null;
}): number | null {
  const normal = params.normalPrice;
  const discount = params.finalDiscountPrice;
  if (normal == null || discount == null) return null;
  const value = normal - discount;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

/** 기사 확정 지원금 = 총 확정 − 고객 확정 */
export function resolvePartnerConfirmedSupport(params: {
  confirmedTotalSupport: number | null;
  confirmedCustomerSupport: number | null;
}): number | null {
  const total = params.confirmedTotalSupport;
  const customer = params.confirmedCustomerSupport;
  if (total == null || customer == null) return null;
  return Math.max(Math.trunc(total - customer), 0);
}

/** 저장된 할인 적용가 필드 우선 (역산용) */
export function resolveStoredFinalDiscountPrice(input: {
  breakdownFinal?: unknown;
  breakdownApplied?: unknown;
  confirmedDiscountPrice?: unknown;
  finalDiscountAppliedPrice?: unknown;
  supportDiscountAppliedPrice?: unknown;
  finalMemberPrice?: unknown;
  sponsorDiscountedPrice?: unknown;
  selectedPrice?: unknown;
}): number | null {
  return (
    parseSupportInteger(input.breakdownFinal) ??
    parseSupportInteger(input.breakdownApplied) ??
    parseSupportInteger(input.confirmedDiscountPrice) ??
    parseSupportInteger(input.finalDiscountAppliedPrice) ??
    parseSupportInteger(input.supportDiscountAppliedPrice) ??
    parseSupportInteger(input.finalMemberPrice) ??
    parseSupportInteger(input.sponsorDiscountedPrice) ??
    parseSupportInteger(input.selectedPrice)
  );
}

/**
 * 고객 확정 지원금 표시/계산 (A: breakdown·quote 저장값 → B: 가격 역산 → null)
 * confirmed_total_support 를 고객 지원금으로 쓰지 않음.
 */
export function resolveConfirmedCustomerSupportDisplay(params: {
  breakdownConfirmedCustomer?: number | null;
  quoteConfirmedCustomer?: unknown;
  quoteFinalCustomerSupport?: unknown;
  normalPrice: number | null;
  finalDiscountPrice: number | null;
}): {
  value: number | null;
  source: ConfirmedCustomerSupportSource;
  formula: string | null;
} {
  const fromBreakdown = parseSupportInteger(params.breakdownConfirmedCustomer);
  if (fromBreakdown != null) {
    return { value: fromBreakdown, source: "support_breakdown", formula: null };
  }

  const fromQuote =
    parseSupportInteger(params.quoteConfirmedCustomer) ??
    parseSupportInteger(params.quoteFinalCustomerSupport);
  if (fromQuote != null) {
    return { value: fromQuote, source: "quote_field", formula: null };
  }

  const derived = deriveCustomerConfirmedSupport({
    normalPrice: params.normalPrice,
    finalDiscountPrice: params.finalDiscountPrice,
  });
  if (derived != null) {
    return {
      value: derived,
      source: "derived_from_price",
      formula: CONFIRMED_CUSTOMER_DERIVE_FORMULA,
    };
  }

  return { value: null, source: "missing", formula: null };
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
  return calculatePlannedDiscountPrice(normalPrice, customerSupportAmount);
}

/** 지원금 할인 예정가 = 일반견적가 − 고객 예정 */
export function calculatePlannedDiscountPrice(
  normalPrice: number | null,
  customerSupportAmount: number,
): number | null {
  if (normalPrice == null) return null;
  return Math.max(
    normalPrice - Math.max(0, customerSupportAmount),
    0,
  );
}

export function resolvePlannedTotalSupport(
  quote: QuoteSupportInput,
  ctx?: PlannedSupportResolveContext,
): number | null {
  const fromQuotePlanned =
    parseSupportInteger(quote.planned_total_support) ??
    parseSupportInteger(quote.preapproved_support_amount);
  if (fromQuotePlanned != null) return Math.max(0, fromQuotePlanned);

  const fromApplication = ctx?.applicationTotalPlannedSupport;
  if (fromApplication != null) return Math.max(0, fromApplication);

  const fromEstimate =
    parseSupportInteger(quote.estimated_support_amount) ??
    parseSupportInteger(ctx?.sponsorEstimatedSupportAmount) ??
    parseSupportInteger(quote.sponsor_support_amount);
  if (fromEstimate != null) return Math.max(0, fromEstimate);

  const hasAnyPlannedSource =
    quote.planned_total_support != null ||
    quote.preapproved_support_amount != null ||
    ctx?.applicationTotalPlannedSupport != null ||
    quote.estimated_support_amount != null ||
    ctx?.sponsorEstimatedSupportAmount != null ||
    quote.sponsor_support_amount != null;

  if (!hasAnyPlannedSource) {
    const approvedFallback =
      parseSupportInteger(quote.approved_support_amount) ??
      parseSupportInteger(ctx?.sponsorApprovedSupportAmount);
    if (approvedFallback != null) return Math.max(0, approvedFallback);
  }

  return null;
}

export function resolvePlannedCustomerSupport(quote: QuoteSupportInput): number {
  return (
    parseSupportInteger(quote.planned_customer_support) ??
    parseSupportInteger(quote.customer_support_amount) ??
    parseSupportInteger(quote.client_reward_amount) ??
    0
  );
}

/** 총 확정 지원금 — 파트너 상단 카드·breakdown 공통 */
export function resolveConfirmedTotalSupport(
  quote: QuoteSupportInput,
  options?: BuildQuoteSupportBreakdownOptions,
): number | null {
  const fromBreakdown = quote.support_breakdown?.totalConfirmedSupport;
  if (fromBreakdown != null && Number.isFinite(fromBreakdown)) {
    return Math.max(0, Math.trunc(fromBreakdown));
  }

  const direct =
    parseSupportInteger(quote.confirmed_total_support) ??
    parseSupportInteger(quote.approved_support_amount);

  if (direct != null) return Math.max(0, direct);

  if (options?.applicationApprovedSupportTotal != null) {
    return Math.max(0, options.applicationApprovedSupportTotal);
  }
  if (options?.sponsorApprovedSupportAmount != null) {
    return Math.max(0, options.sponsorApprovedSupportAmount);
  }

  return null;
}

export function calculatePlannedDriverSupport(
  totalPlanned: number,
  customerPlanned: number,
): number {
  return Math.max(
    Math.max(0, totalPlanned) - Math.max(0, customerPlanned),
    0,
  );
}

/** 총 예정 지원금이 null일 때만 null — 고객/기사 0원은 정상 */
export function resolvePlannedSupportSnapshot(
  quote: QuoteSupportInput,
  normalPrice: number | null,
  ctx?: PlannedSupportResolveContext,
): PlannedSupportSnapshot | null {
  const total = resolvePlannedTotalSupport(quote, ctx);
  if (total == null) return null;

  const customerRaw = resolvePlannedCustomerSupport(quote);
  const customer = Math.min(
    Math.max(0, customerRaw),
    total,
    normalPrice ?? Number.MAX_SAFE_INTEGER,
  );
  const driver =
    parseSupportInteger(quote.planned_driver_support) ??
    parseSupportInteger(quote.driver_support_amount) ??
    calculatePlannedDriverSupport(total, customer);

  const discountPrice =
    parseSupportInteger(quote.planned_discount_price) ??
    parseSupportInteger(quote.member_price) ??
    parseSupportInteger(quote.sponsor_discounted_price) ??
    calculatePlannedDiscountPrice(normalPrice, customer);

  const resolvedDiscount =
    discountPrice ?? (normalPrice != null ? calculatePlannedDiscountPrice(normalPrice, customer) : 0) ?? 0;

  const finalPrice =
    parseSupportInteger(quote.planned_final_price) ?? Math.max(0, resolvedDiscount);

  return {
    total,
    customer,
    driver,
    discountPrice: Math.max(0, resolvedDiscount),
    finalPrice: Math.max(0, finalPrice),
  };
}

/** 견적 작성/수정 폼 미리보기 (파트너 대시보드) */
export function buildQuoteFormPlannedPreview(input: {
  normalPrice: number | null;
  totalPlanned: number | null;
  customerPlanned: number | null;
}): {
  totalPlannedSupport: number | null;
  customerPlannedSupport: number;
  partnerPlannedSupport: number;
  supportDiscountPlannedPrice: number | null;
} {
  const total = input.totalPlanned;
  if (total == null) {
    return {
      totalPlannedSupport: null,
      customerPlannedSupport: Math.max(0, input.customerPlanned ?? 0),
      partnerPlannedSupport: 0,
      supportDiscountPlannedPrice: null,
    };
  }
  const customer = Math.max(0, input.customerPlanned ?? 0);
  return {
    totalPlannedSupport: total,
    customerPlannedSupport: customer,
    partnerPlannedSupport: calculatePlannedDriverSupport(total, customer),
    supportDiscountPlannedPrice: calculatePlannedDiscountPrice(
      input.normalPrice,
      customer,
    ),
  };
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
  options?: BuildQuoteSupportBreakdownOptions,
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
      finalDiscountAppliedPrice: null,
      isConfirmed: false,
    };
  }

  try {
    const planned = resolvePlannedSupportSnapshot(row, normalPrice, {
      applicationTotalPlannedSupport: options?.applicationTotalPlannedSupport,
      sponsorEstimatedSupportAmount: options?.sponsorEstimatedSupportAmount,
      sponsorApprovedSupportAmount: options?.sponsorApprovedSupportAmount,
    });
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
        finalDiscountAppliedPrice: null,
        isConfirmed: false,
      };
    }

    const confirmedTotal = resolveConfirmedTotalSupport(row, options);

    const isConfirmed =
      confirmedTotal != null &&
      (confirmedTotal > 0 ||
        quote.support_breakdown?.isConfirmed === true ||
        parseSupportInteger(quote.confirmed_total_support) != null ||
        parseSupportInteger(quote.approved_support_amount) != null);

    let customerConfirmed: number | null = null;
    let partnerConfirmed: number | null = null;
    let supportDiscountAppliedPrice: number | null = null;
    let finalDiscountAppliedPrice: number | null = null;

    if (isConfirmed && confirmedTotal != null) {
      const stored = readStoredConfirmedSupport(row);
      if (stored && stored.total === confirmedTotal) {
        customerConfirmed = stored.customer;
        partnerConfirmed = stored.driver;
        supportDiscountAppliedPrice = stored.discountPrice;
        finalDiscountAppliedPrice = stored.finalPrice;
      } else {
        const computed = computeConfirmedFromPlanned({
          normalPrice,
          settlementType,
          planned,
          confirmedTotal,
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
            finalDiscountAppliedPrice: null,
            isConfirmed: true,
          };
        }
        customerConfirmed = computed.customer;
        partnerConfirmed = computed.driver;
        supportDiscountAppliedPrice = computed.discountPrice;
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
    finalDiscountAppliedPrice: breakdown.finalDiscountAppliedPrice,
    breakdown,
  };
}
