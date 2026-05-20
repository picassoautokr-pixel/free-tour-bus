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
  member_price?: number | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  support_breakdown?: QuoteSupportBreakdown | null;
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
  quote_status: string;
  quote_deadline_at?: string;
  quote_limit_count?: number | null;
  target_normal_price?: number | null;
  target_member_price?: number | null;
  auto_selected_quote_id?: string;
  auto_selected_quote_source?: string;
  final_selected_quote_id?: string;
  final_selected_quote_source?: string;
  final_price_selection_kind?: string | null;
  contact_revealed_at?: string;
  sponsor_support_status?: string;
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

export function clientQuotePrices(quote: ClientQuote): ClientQuotePrices {
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
  const sponsorConfirmed =
    quote.sponsor_support_status === "approved" || breakdown.isConfirmed;
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

export function fmtClientPrice(
  value: number | null | undefined,
  phase: "planned" | "confirmed" | "final" = "planned",
  breakdown?: QuoteSupportBreakdown | null,
): string {
  if (breakdown) {
    return formatSupportAmount(value ?? null, {
      phase,
      calculationStatus: breakdown.calculationStatus,
      isConfirmed: breakdown.isConfirmed,
    });
  }
  return formatSupportAmount(value, { phase });
}

export function sponsorStatusLabel(status?: string): string {
  if (status === "approved") return LABEL.supportConfirmed;
  if (status === "rejected") return LABEL.supportRejected;
  if (status === "none" || !status) return LABEL.noSupport;
  return LABEL.supportReviewing;
}

export function contactRevealedFor(app: ClientApplication): boolean {
  return (
    isMatchedApplication(app) &&
    (app.contact_revealed_at ?? "").trim() !== "" &&
    ["final_selected", "contract_pending", "completed"].includes(app.quote_status)
  );
}

export function priceSelectionLabel(kind?: string | null): string {
  if (kind === "normal_price_selected") return LABEL.selectedNormal;
  if (kind === "support_price_selected") return LABEL.selectedSupportApplied;
  if (kind === "support_planned_selected") return LABEL.selectedSupportPlanned;
  return LABEL.unconfirmed;
}

export function routeLabel(app: ClientApplication): string {
  const parts = [app.departure, formatStopovers(app.stopovers), app.destination].filter(
    Boolean,
  );
  return parts.join(" → ") || LABEL.dash;
}
