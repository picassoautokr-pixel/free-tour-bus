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
import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
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
    quotes: (app.quotes ?? []).map(normalizeClientQuote),
  };
}

export function normalizeClientQuote(quote: ClientQuote): ClientQuote {
  const raw = quote as ClientQuote & LooseRecord;
  const breakdown = quote.support_breakdown ?? null;
  return {
    ...quote,
    confirmed_total_support:
      quote.confirmed_total_support ??
      breakdown?.totalConfirmedSupport ??
      parseNum(raw.confirmed_total_support),
    confirmed_discount_price:
      quote.confirmed_discount_price ??
      breakdown?.supportDiscountAppliedPrice ??
      parseNum(raw.confirmed_discount_price),
    support_discount_applied_price:
      quote.support_discount_applied_price ??
      breakdown?.supportDiscountAppliedPrice ??
      parseNum(raw.support_discount_applied_price),
    final_discount_applied_price:
      quote.final_discount_applied_price ??
      breakdown?.finalDiscountAppliedPrice ??
      parseNum(raw.final_discount_applied_price),
    support_status: pickText(quote.support_status, raw.support_status, quote.sponsor_support_status),
    sponsor_support_status: pickText(quote.sponsor_support_status, raw.sponsor_support_status),
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

export function isQuoteSupportConfirmed(quote: ClientQuote): boolean {
  if (quote.source === "guest") return false;
  const raw = quote as ClientQuote & LooseRecord;
  const breakdown = quote.support_breakdown;
  if (breakdown?.totalConfirmedSupport != null) return true;
  if (parseNum(quote.confirmed_total_support) != null) return true;
  if (parseNum(raw.confirmed_total_support) != null) return true;
  if (parseNum(quote.confirmed_discount_price) != null) return true;
  if (parseNum(raw.confirmed_discount_price) != null) return true;
  if (parseNum(quote.support_discount_applied_price) != null) return true;
  if (parseNum(quote.final_discount_applied_price) != null) return true;
  if (quote.sponsor_support_status === "approved") return true;
  if (quote.support_status === "approved") return true;
  if (breakdown?.isConfirmed === true) return true;
  return false;
}

export function resolveSupportAppliedPrice(quote: ClientQuote): number | null {
  const breakdown = quote.support_breakdown;
  const raw = quote as ClientQuote & LooseRecord;
  const candidates: unknown[] = [
    breakdown?.supportDiscountAppliedPrice,
    breakdown?.finalDiscountAppliedPrice,
    quote.confirmed_discount_price,
    raw.confirmed_discount_price,
    quote.support_discount_applied_price,
    quote.final_discount_applied_price,
    quote.member_price,
    quote.price,
  ];
  for (const candidate of candidates) {
    const n = parseNum(candidate);
    if (n != null) return n;
  }
  return quote.price;
}

export function resolveSupportPlannedPrice(quote: ClientQuote): number | null {
  const breakdown = quote.support_breakdown;
  return (
    breakdown?.supportDiscountPlannedPrice ??
    quote.support_discount_planned_price ??
    quote.member_price ??
    quote.price
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
  const appApproved = application?.sponsor_support_status === "approved";
  const isConfirmed = isQuoteSupportConfirmed(quote) || appApproved;
  return {
    normalPrice,
    plannedPrice: resolveSupportPlannedPrice(quote),
    appliedPrice: isConfirmed ? resolveSupportAppliedPrice(quote) : null,
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
  if (isQuoteSupportConfirmed(quote) || quote.sponsor_support_status === "approved") {
    return CLIENT_UI.supportConfirmed;
  }
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

/** breakdown 상세 금액은 고객 화면에 노출하지 않음 */
export function formatClientQuotePrice(
  value: number | null | undefined,
  _breakdown?: QuoteSupportBreakdown | null,
): string {
  return formatClientWon(value);
}
