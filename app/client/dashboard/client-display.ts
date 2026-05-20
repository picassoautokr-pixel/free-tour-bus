/** 클라이언트 대시보드 화면 표시 전용 (page.tsx 렌더 트리) — UTF-8 */

import {
  applicationTypeLabel,
  contactRevealedFor,
  formatAutoCloseRemaining,
  formatAutoCloseRemainingCount,
  formatDepartureAt,
  formatQuoteCount,
  formatReturnDate,
  formatWon,
  priceSelectionLabel,
  routeLabel,
  type ClientApplication,
  type ClientQuote,
} from "@/lib/client-application-view-model";
import { LABEL } from "@/lib/client-dashboard-labels";
import {
  buildQuoteSupportBreakdown,
  resolveConfirmedTotalSupport,
  resolvePlannedSupportSnapshot,
  resolveSettlementType,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportBreakdown,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import type { QuoteSupportRow } from "@/lib/quote-support-snapshot";
import { formatStopovers } from "@/lib/stopovers";

/** 화면에 직접 쓰는 문구 (남은시간/남은건수/지원금 없음/견적 상세 금지) */
export const CLIENT_UI = {
  remainingTime: "자동마감까지 남은 시간",
  remainingCount: "자동마감까지 남은 건수",
  groupType: "단체유형",
  normalPrice: "일반견적가",
  supportDiscountPlanned: "지원금 할인 예정가",
  supportDiscountApplied: "지원금 할인 적용가",
  supportReviewing: "지원금 검토중",
  supportConfirmed: "지원금 확정",
  generalQuote: "일반견적",
  memberQuote: "제휴기사 견적",
  guestQuote: "일반기사 견적",
  matchComplete: "매칭완료",
  dash: "—",
} as const;

export {
  applicationTypeLabel,
  contactRevealedFor,
  formatAutoCloseRemaining,
  formatAutoCloseRemainingCount,
  formatDepartureAt,
  formatQuoteCount,
  formatReturnDate,
  formatWon,
  priceSelectionLabel,
  routeLabel,
  formatStopovers,
  LABEL,
};

type LooseRecord = Record<string, unknown>;

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text !== "" && text !== "—" && text !== "-") return text;
  }
  return "";
}

function parseNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function firstNum(...values: unknown[]): number | null {
  for (const value of values) {
    const n = parseNum(value);
    if (n != null) return n;
  }
  return null;
}

function supportBuildOptions(
  quote: ClientQuote,
  application?: ClientApplication,
): BuildQuoteSupportBreakdownOptions {
  const raw = quote as ClientQuote & LooseRecord;
  return {
    applicationApprovedSupportTotal:
      parseNum(quote.sponsor_approved_support_amount) ??
      parseNum(application?.sponsor_approved_support_amount) ??
      parseNum(raw.sponsor_approved_support_amount),
    sponsorApprovedSupportAmount:
      parseNum(quote.approved_support_amount) ??
      parseNum(quote.sponsor_approved_support_amount) ??
      parseNum(raw.approved_support_amount),
  };
}

/** buildQuoteSupportBreakdown 입력 — API 견적 필드 통합 */
export function clientQuoteSupportInput(
  quote: ClientQuote,
  application?: ClientApplication,
): QuoteSupportInput {
  const raw = quote as ClientQuote & LooseRecord;
  const breakdown = quote.support_breakdown;
  return {
    price: quote.price,
    member_price: quote.member_price,
    sponsor_discounted_price: raw.sponsor_discounted_price,
    support_settlement_type: quote.support_settlement_type ?? raw.support_settlement_type,
    planned_total_support: quote.planned_total_support ?? breakdown?.totalPlannedSupport,
    planned_customer_support:
      quote.planned_customer_support ?? breakdown?.customerPlannedSupport,
    planned_driver_support: quote.planned_driver_support ?? breakdown?.partnerPlannedSupport,
    planned_discount_price: quote.support_discount_planned_price ?? raw.planned_discount_price,
    planned_final_price: raw.planned_final_price,
    confirmed_total_support: quote.confirmed_total_support ?? breakdown?.totalConfirmedSupport,
    confirmed_customer_support:
      quote.confirmed_customer_support ?? breakdown?.customerConfirmedSupport,
    confirmed_driver_support:
      quote.confirmed_driver_support ?? breakdown?.partnerConfirmedSupport,
    confirmed_discount_price:
      quote.confirmed_discount_price ?? breakdown?.supportDiscountAppliedPrice,
    confirmed_final_price: quote.final_discount_applied_price ?? breakdown?.finalDiscountAppliedPrice,
    customer_support_amount: raw.customer_support_amount,
    support_discount_amount: raw.support_discount_amount,
    driver_support_amount: raw.driver_support_amount,
    preapproved_support_amount:
      quote.preapproved_support_amount ?? raw.preapproved_support_amount,
    approved_support_amount: quote.approved_support_amount ?? raw.approved_support_amount,
    sponsor_approved_support_amount:
      quote.sponsor_approved_support_amount ??
      application?.sponsor_approved_support_amount,
    estimated_support_amount: raw.estimated_support_amount,
    extension_support_amount: quote.extension_support_amount ?? breakdown?.extensionSupport,
    sponsor_quote_enabled: quote.sponsor_quote_enabled,
    support_breakdown: breakdown,
  };
}

export function buildClientQuoteSupportBreakdown(
  quote: ClientQuote,
  application?: ClientApplication,
): QuoteSupportBreakdown {
  return buildQuoteSupportBreakdown(
    clientQuoteSupportInput(quote, application),
    supportBuildOptions(quote, application),
  );
}

function hasSupportPricingContext(quote: ClientQuote, application?: ClientApplication): boolean {
  const raw = quote as ClientQuote & LooseRecord;
  const breakdown = quote.support_breakdown;
  if (
    firstNum(
      quote.confirmed_total_support,
      breakdown?.totalConfirmedSupport,
      quote.approved_support_amount,
      quote.preapproved_support_amount,
      quote.sponsor_approved_support_amount,
      application?.sponsor_approved_support_amount,
      quote.planned_total_support,
      breakdown?.totalPlannedSupport,
      quote.planned_customer_support,
      breakdown?.customerPlannedSupport,
    ) != null
  ) {
    return true;
  }
  if (
    quote.sponsor_support_status === "approved" ||
    quote.support_status === "approved" ||
    application?.sponsor_support_status === "approved"
  ) {
    return true;
  }
  return parseNum(raw.customer_support_amount) != null || parseNum(raw.planned_total_support) != null;
}

/** API/스토어 필드명 혼용 대응 */
export function normalizeClientApplication(app: ClientApplication): ClientApplication {
  const raw = app as ClientApplication & LooseRecord;
  return {
    ...app,
    organization_type:
      pickText(
        app.organization_type,
        raw.organizationType,
        raw.group_type,
        raw.groupType,
        raw.customer_group_type,
        raw.customerGroupType,
      ) || app.organization_type,
    applicant_name: pickText(app.applicant_name, raw.group_name, raw.groupName) || app.applicant_name,
    auto_final_confirm_at:
      pickText(app.auto_final_confirm_at, raw.autoFinalConfirmAt) || app.auto_final_confirm_at,
    final_price_selection_kind:
      app.final_price_selection_kind ??
      (typeof raw.client_price_selection_kind === "string"
        ? raw.client_price_selection_kind
        : null),
    quotes: (app.quotes ?? []).map((q) => normalizeClientQuote(q, app)),
  };
}

export function normalizeClientQuote(
  quote: ClientQuote,
  application?: ClientApplication,
): ClientQuote {
  const rebuilt = buildClientQuoteSupportBreakdown(quote, application);
  return {
    ...quote,
    support_breakdown: rebuilt,
    planned_total_support: quote.planned_total_support ?? rebuilt.totalPlannedSupport,
    planned_customer_support:
      quote.planned_customer_support ?? rebuilt.customerPlannedSupport,
    planned_driver_support: quote.planned_driver_support ?? rebuilt.partnerPlannedSupport,
    confirmed_total_support: quote.confirmed_total_support ?? rebuilt.totalConfirmedSupport,
    confirmed_customer_support:
      quote.confirmed_customer_support ?? rebuilt.customerConfirmedSupport,
    confirmed_driver_support:
      quote.confirmed_driver_support ?? rebuilt.partnerConfirmedSupport,
    confirmed_discount_price:
      quote.confirmed_discount_price ?? rebuilt.supportDiscountAppliedPrice,
    support_discount_applied_price:
      quote.support_discount_applied_price ?? rebuilt.supportDiscountAppliedPrice,
    final_discount_applied_price:
      quote.final_discount_applied_price ?? rebuilt.finalDiscountAppliedPrice,
    support_discount_planned_price:
      quote.support_discount_planned_price ?? rebuilt.supportDiscountPlannedPrice,
    support_status: pickText(quote.support_status, quote.sponsor_support_status),
    sponsor_support_status: pickText(quote.sponsor_support_status),
  };
}

export function resolveGroupTypeDisplay(app: ClientApplication): string {
  const raw = app as ClientApplication & LooseRecord;
  const value = pickText(
    raw.group_type,
    raw.groupType,
    app.organization_type,
    raw.organizationType,
    raw.customer_group_type,
    raw.customerGroupType,
    raw.group_name,
    raw.groupName,
  );
  return value || CLIENT_UI.dash;
}

export function isQuoteSupportConfirmed(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return false;
  const breakdown = quote.support_breakdown ?? buildClientQuoteSupportBreakdown(quote, application);
  if (breakdown.totalConfirmedSupport != null) return true;
  if (parseNum(quote.confirmed_total_support) != null) return true;
  if (parseNum(quote.sponsor_approved_support_amount) != null) return true;
  if (parseNum(quote.approved_support_amount) != null) return true;
  if (parseNum(quote.preapproved_support_amount) != null) return true;
  if (parseNum(application?.sponsor_approved_support_amount) != null) return true;
  if (quote.sponsor_support_status === "approved") return true;
  if (quote.support_status === "approved") return true;
  if (application?.sponsor_support_status === "approved") return true;
  if (breakdown.isConfirmed === true) return true;
  return false;
}

/**
 * 제휴기사 지원금 할인 적용가 — member_price·일반견적가 fallback 금지.
 */
export function resolveSupportAppliedPrice(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  if (quote.source === "guest") return quote.price ?? null;

  const rebuilt = buildClientQuoteSupportBreakdown(quote, application);

  const applied = firstNum(
    rebuilt.finalDiscountAppliedPrice,
    rebuilt.supportDiscountAppliedPrice,
    quote.support_breakdown?.finalDiscountAppliedPrice,
    quote.support_breakdown?.supportDiscountAppliedPrice,
    quote.final_discount_applied_price,
    quote.confirmed_discount_price,
    quote.support_discount_applied_price,
  );
  if (applied != null) return applied;

  if (!hasSupportPricingContext(quote, application)) return null;

  const input = clientQuoteSupportInput(quote, application);
  const options = supportBuildOptions(quote, application);
  const normalPrice = parseNum(quote.price);
  const confirmedTotal = resolveConfirmedTotalSupport(input, options);
  if (normalPrice == null || confirmedTotal == null) return null;

  const planned = resolvePlannedSupportSnapshot(input as QuoteSupportRow, normalPrice, {
    sponsorApprovedSupportAmount: options.sponsorApprovedSupportAmount ?? undefined,
  });
  if (!planned) return null;

  const extension = parseNum(quote.extension_support_amount) ?? 0;
  const customerConfirmed = Math.min(planned.customer, confirmedTotal);
  return Math.max(normalPrice - customerConfirmed - extension, 0);
}

export function resolveSupportPlannedPrice(quote: ClientQuote, application?: ClientApplication): number | null {
  const rebuilt = buildClientQuoteSupportBreakdown(quote, application);
  return (
    rebuilt.supportDiscountPlannedPrice ??
    quote.support_discount_planned_price ??
    quote.member_price ??
    null
  );
}

export type ClientQuoteDisplayRow = {
  normalPrice: number | null;
  plannedPrice: number | null;
  appliedPrice: number | null;
  isGuest: boolean;
  isConfirmed: boolean;
  showNormal: boolean;
  showPlanned: boolean;
  showApplied: boolean;
};

export function clientQuoteDisplayRow(
  quote: ClientQuote,
  application?: ClientApplication,
): ClientQuoteDisplayRow {
  const isGuest = quote.source === "guest";
  const normalPrice = quote.price;
  if (isGuest) {
    return {
      normalPrice,
      plannedPrice: normalPrice,
      appliedPrice: normalPrice,
      isGuest: true,
      isConfirmed: false,
      showNormal: true,
      showPlanned: false,
      showApplied: false,
    };
  }
  const isConfirmed = isQuoteSupportConfirmed(quote, application);
  const appliedPrice = isConfirmed ? resolveSupportAppliedPrice(quote, application) : null;
  return {
    normalPrice,
    plannedPrice: resolveSupportPlannedPrice(quote, application),
    appliedPrice,
    isGuest: false,
    isConfirmed,
    showNormal: true,
    showPlanned: !isConfirmed,
    showApplied: isConfirmed,
  };
}

export function formatClientWon(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

export function quoteSupportBadgeLabel(
  quote: ClientQuote,
  application?: ClientApplication,
): string | null {
  if (quote.source === "guest") return CLIENT_UI.generalQuote;
  if (isQuoteSupportConfirmed(quote, application)) return CLIENT_UI.supportConfirmed;
  const status =
    quote.sponsor_support_status ??
    quote.support_status ??
    (quote.sponsor_quote_enabled !== false ? application?.sponsor_support_status : undefined);
  if (status === "approved") return CLIENT_UI.supportConfirmed;
  if (status === "preapproved" || status === "pending" || status === "mixed") {
    return CLIENT_UI.supportReviewing;
  }
  if (quote.sponsor_quote_enabled === false) return CLIENT_UI.generalQuote;
  return null;
}

export function formatClientQuotePrice(value: number | null | undefined): string {
  return formatClientWon(value);
}
