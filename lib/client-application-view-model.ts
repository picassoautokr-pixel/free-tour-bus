import {
  LABEL,
  type ClientListSort,
  type ClientMainTab,
  type MatchedRunFilter,
} from "@/lib/client-dashboard-labels";
import {
  buildQuoteSupportBreakdown,
  formatSupportAmount,
  type QuoteSupportBreakdown,
} from "@/lib/support-calculation";
import { formatRemainingText } from "@/lib/quote-status";
import { formatStopovers } from "@/lib/stopovers";

export type ClientQuote = {
  source: "member" | "guest";
  id: string;
  company_name?: string;
  driver_name?: string;
  phone?: string;
  price: number | null;
  normal_price?: number | null;
  member_price?: number | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  support_breakdown?: QuoteSupportBreakdown | null;
  planned_total_support?: number | null;
  planned_customer_support?: number | null;
  planned_driver_support?: number | null;
  customer_support_amount?: number | null;
  client_reward_amount?: number | null;
  confirmed_total_support?: number | null;
  confirmed_customer_support?: number | null;
  confirmed_driver_support?: number | null;
  confirmed_discount_price?: number | null;
  support_settlement_type?: string;
  extension_support_amount?: number | null;
  preapproved_support_amount?: number | null;
  approved_support_amount?: number | null;
  sponsor_approved_support_amount?: number | null;
  final_customer_support_amount?: number | null;
  support_status?: string;
  sponsor_support_status?: string;
  sponsor_quote_enabled?: boolean;
  vehicle_type?: string;
  available_time?: string;
  memo?: string;
  message?: string;
  status?: string;
  created_at?: string;
};

export type ClientApplication = {
  id: string;
  receipt_number: string;
  contract_number?: string;
  applicant_name?: string;
  phone?: string;
  departure: string;
  departure_region?: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  return_date?: string;
  trip_type: string;
  bus_grade: string;
  passenger_count: number | null;
  request_message?: string;
  application_type?: string;
  organization_type?: string;
  group_type?: string;
  organization_name?: string;
  quote_status: string;
  quote_deadline_at?: string;
  auto_final_confirm_at?: string;
  quote_limit_count?: number | null;
  target_normal_price?: number | null;
  target_member_price?: number | null;
  auto_selected_quote_id?: string;
  auto_selected_quote_source?: string;
  final_selected_quote_id?: string;
  final_selected_quote_source?: string;
  final_price_selection_kind?: string | null;
  selected_price_type?: string | null;
  selected_price_label?: string | null;
  selected_price?: number | null;
  contact_revealed_at?: string;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  quote_count?: number;
  quotes?: ClientQuote[];
};

const AUTO_CLOSED_STATUSES = new Set([
  "auto_selected",
  "closed_by_time",
  "closed_by_quote_count",
  "closed_by_price",
  "manually_closed",
]);

export function isMatchedApplication(app: ClientApplication): boolean {
  return (app.final_selected_quote_id ?? "").trim() !== "";
}

export function clientApplicationTab(app: ClientApplication): ClientMainTab {
  if (isMatchedApplication(app)) return "matched";
  const status = (app.quote_status ?? "").trim();
  if (AUTO_CLOSED_STATUSES.has(status)) return "auto_closed";
  return "requesting";
}

export function matchedRunStatus(app: ClientApplication): MatchedRunFilter {
  const date = app.departure_date?.trim();
  if (!date) return "in_progress";
  const time = app.departure_time?.trim();
  const iso = time && time !== LABEL.dash ? `${date}T${time}` : `${date}T23:59:59`;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "in_progress";
  return t > Date.now() ? "in_progress" : "completed";
}

export function applicationTypeLabel(raw?: string): string {
  const t = (raw ?? "").trim();
  if (t.includes("타사") || t.includes("기존")) return LABEL.quoteTypeOther;
  return LABEL.quoteTypeNew;
}

export function formatWon(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

export function formatDepartureAt(app: ClientApplication): string {
  const date = app.departure_date?.trim() || LABEL.unconfirmed;
  const time = app.departure_time?.trim();
  if (!time || time === LABEL.dash) return date;
  return `${date} ${time}`;
}

export function formatQuoteDeadlineRemaining(deadline?: string): string {
  if (!deadline?.trim()) return LABEL.unconfirmed;
  const remaining = formatRemainingText(deadline);
  if (!remaining) return LABEL.unconfirmed;
  if (remaining === "곧 진행") return "마감 임박";
  return remaining;
}

export function isOneWayTrip(tripType?: string): boolean {
  const t = (tripType ?? "").trim();
  return t === "편도" || t.includes("편도");
}

export function isRoundTrip(tripType?: string): boolean {
  const t = (tripType ?? "").trim();
  return t === "왕복" || t.includes("왕복");
}

export function formatReturnDate(app: ClientApplication): string {
  if (isOneWayTrip(app.trip_type)) return LABEL.returnDateNotApplicable;
  if (!isRoundTrip(app.trip_type) && !app.return_date?.trim()) {
    return LABEL.returnDateNotApplicable;
  }
  const raw = app.return_date?.trim();
  if (!raw) return LABEL.unconfirmed;
  if (raw.includes("T")) {
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return raw;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const meridiem = d.getHours() < 12 ? "오전" : "오후";
    return `${y}-${m}-${day} ${meridiem}`;
  }
  return raw;
}

export function formatGroupType(app: ClientApplication): string {
  const raw = app as ClientApplication & Record<string, unknown>;
  const value = [
    raw.group_type,
    raw.groupType,
    app.organization_type,
    raw.organizationType,
    raw.customer_group_type,
    raw.customerGroupType,
    raw.group_name,
    raw.groupName,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .find((t) => t !== "" && t !== "—");
  return value || LABEL.dash;
}

export function formatAutoCloseRemaining(app: ClientApplication): string {
  const deadline =
    app.auto_final_confirm_at?.trim() || app.quote_deadline_at?.trim() || "";
  return formatQuoteDeadlineRemaining(deadline);
}

export function formatAutoCloseRemainingCount(app: ClientApplication): string {
  if (app.quote_limit_count == null) return LABEL.dash;
  const remaining = Math.max(
    (app.quote_limit_count ?? 0) - (app.quote_count ?? app.quotes?.length ?? 0),
    0,
  );
  return `${remaining}${LABEL.countSuffix} 남음`;
}

export function formatQuoteCount(app: ClientApplication): string {
  const count = app.quote_count ?? app.quotes?.length ?? 0;
  const limit = app.quote_limit_count;
  if (limit != null) return `${count} / ${limit}${LABEL.countSuffix}`;
  return `${count}${LABEL.countSuffix}`;
}

export function clientTabCounts(apps: ClientApplication[]) {
  let requesting = 0;
  let autoClosed = 0;
  let matched = 0;
  let matchedInProgress = 0;
  let matchedCompleted = 0;
  for (const app of apps) {
    const tab = clientApplicationTab(app);
    if (tab === "requesting") requesting += 1;
    else if (tab === "auto_closed") autoClosed += 1;
    else {
      matched += 1;
      if (matchedRunStatus(app) === "in_progress") matchedInProgress += 1;
      else matchedCompleted += 1;
    }
  }
  return { requesting, autoClosed, matched, matchedInProgress, matchedCompleted };
}

export function sortClientApplications(
  apps: ClientApplication[],
  sort: ClientListSort,
): ClientApplication[] {
  const list = [...apps];
  list.sort((a, b) => {
    if (sort === "deadline") {
      const ta = new Date(a.quote_deadline_at ?? 0).getTime() || Number.MAX_SAFE_INTEGER;
      const tb = new Date(b.quote_deadline_at ?? 0).getTime() || Number.MAX_SAFE_INTEGER;
      return ta - tb;
    }
    if (sort === "quotes") {
      return (b.quote_count ?? 0) - (a.quote_count ?? 0);
    }
    if (sort === "region") {
      return (a.departure_region ?? a.departure).localeCompare(
        b.departure_region ?? b.departure,
        "ko",
      );
    }
    if (sort === "passengers") {
      return (b.passenger_count ?? 0) - (a.passenger_count ?? 0);
    }
    return 0;
  });
  return list;
}

export function quoteBreakdownForClient(quote: ClientQuote): QuoteSupportBreakdown {
  if (quote.support_breakdown) return quote.support_breakdown;
  if (quote.source === "guest") {
    return buildQuoteSupportBreakdown({
      price: quote.price,
      sponsor_quote_enabled: false,
    });
  }
  return buildQuoteSupportBreakdown({
    price: quote.price,
    member_price: quote.member_price,
    planned_discount_price: quote.support_discount_planned_price,
    confirmed_discount_price: quote.support_discount_applied_price,
    approved_support_amount: quote.support_discount_applied_price,
    sponsor_quote_enabled: quote.sponsor_quote_enabled ?? true,
    customer_support_amount: quote.support_discount_planned_price,
  });
}

export type ClientQuotePrices = {
  normalPrice: number | null;
  supportDiscountPlanned: number | null;
  supportDiscountApplied: number | null;
  finalDiscountApplied: number | null;
  isGuest: boolean;
  sponsorConfirmed: boolean;
};

export function clientQuotePrices(
  quote: ClientQuote,
  application?: Pick<ClientApplication, "sponsor_support_status">,
): ClientQuotePrices {
  const isGuest = quote.source === "guest";
  const normalPrice = quote.price;
  if (isGuest) {
    return {
      normalPrice,
      supportDiscountPlanned: normalPrice,
      supportDiscountApplied: normalPrice,
      finalDiscountApplied: normalPrice,
      isGuest: true,
      sponsorConfirmed: false,
    };
  }
  const breakdown = quoteBreakdownForClient(quote);
  const appSponsorApproved = application?.sponsor_support_status === "approved";
  const sponsorConfirmed =
    quote.sponsor_support_status === "approved" ||
    breakdown.isConfirmed ||
    appSponsorApproved;
  return {
    normalPrice,
    supportDiscountPlanned:
      breakdown.supportDiscountPlannedPrice ?? quote.support_discount_planned_price ?? null,
    supportDiscountApplied: sponsorConfirmed
      ? breakdown.supportDiscountAppliedPrice ?? quote.support_discount_applied_price ?? null
      : null,
    finalDiscountApplied: sponsorConfirmed
      ? breakdown.finalDiscountAppliedPrice ?? quote.final_discount_applied_price ?? null
      : breakdown.supportDiscountPlannedPrice ?? null,
    isGuest: false,
    sponsorConfirmed,
  };
}

export type ClientQuotePriceVisibility = {
  showNormal: boolean;
  showPlanned: boolean;
  showApplied: boolean;
};

export function clientQuotePriceVisibility(prices: ClientQuotePrices): ClientQuotePriceVisibility {
  if (prices.isGuest) {
    return { showNormal: true, showPlanned: false, showApplied: false };
  }
  return {
    showNormal: true,
    showPlanned: !prices.sponsorConfirmed,
    showApplied: prices.sponsorConfirmed,
  };
}

export function fmtClientPrice(
  value: number | null | undefined,
  phase: "planned" | "confirmed" | "final" = "planned",
  breakdown?: QuoteSupportBreakdown | null,
  options?: { treatAsConfirmed?: boolean },
): string {
  const forceConfirmed = options?.treatAsConfirmed === true;
  if (breakdown) {
    return formatSupportAmount(value ?? null, {
      phase,
      calculationStatus: breakdown.calculationStatus,
      isConfirmed: forceConfirmed || breakdown.isConfirmed || phase === "planned",
    });
  }
  return formatSupportAmount(value, {
    phase,
    isConfirmed: forceConfirmed || phase === "planned",
  });
}

/** 지원금 상태 뱃지 — 확정·검토중만, '지원금 없음' 등은 표시하지 않음 */
export function sponsorSupportBadge(status?: string): string | null {
  if (status === "approved") return LABEL.supportConfirmed;
  if (status === "preapproved" || status === "pending" || status === "mixed") {
    return LABEL.supportReviewing;
  }
  return null;
}

export function contactRevealedFor(app: ClientApplication): boolean {
  return (
    isMatchedApplication(app) &&
    (app.contact_revealed_at ?? "").trim() !== "" &&
    ["final_selected", "contract_pending", "completed"].includes(app.quote_status)
  );
}

export function priceSelectionLabel(
  kind?: string | null,
  selectedLabel?: string | null,
): string {
  if (selectedLabel?.trim()) return selectedLabel.trim();
  if (kind === "normal_price_selected") return LABEL.normalPrice;
  if (kind === "support_price_selected") return LABEL.supportDiscountApplied;
  if (kind === "support_planned_selected") return LABEL.supportDiscountPlanned;
  if (kind === "normal") return LABEL.normalPrice;
  if (kind === "support_confirmed") return LABEL.supportDiscountApplied;
  if (kind === "support_planned") return LABEL.supportDiscountPlanned;
  return LABEL.unconfirmed;
}

export function routeLabel(app: ClientApplication): string {
  const parts = [app.departure, formatStopovers(app.stopovers), app.destination].filter(
    Boolean,
  );
  return parts.join(" → ") || LABEL.dash;
}
