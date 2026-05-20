import {
  LABEL,
  type ConfirmedPayoutFilter,
} from "@/lib/sponsor-dashboard-labels";
import { sponsorSupportTypeLabel } from "@/lib/sponsor";

export type SponsorCallRow = {
  id: string;
  application_id: string;
  sponsor_rule_id?: string;
  status: string;
  payout_status?: string | null;
  departure_region: string;
  departure: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  passenger_count: number | null;
  trip_type: string;
  bus_grade: string;
  group_type?: string;
  quote_status: string;
  quote_deadline_at?: string;
  quote_limit_count?: number | null;
  quote_count?: number;
  quote_closed_at?: string;
  final_selected_quote_id?: string;
  estimated_support_amount: number;
  approved_support_amount?: number | null;
  support_kind?: string;
  support_form_kind?: string;
  support_condition_label?: string;
  sponsor_rule_title?: string;
  support_type?: string;
  support_condition?: string;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  assigned_staff_phone?: string;
  decision_memo?: string;
  decided_at?: string;
  approved_at?: string;
  rejected_at?: string;
  matched_reason?: string;
  staff_sms_sent_at?: string;
  staff_sms_error?: string;
  sponsor_quote_count?: number;
  matched_quote_count?: number;
  final_quote_count?: number;
};

const REVIEW_STATUSES = new Set(["pending", "preapproved", "reviewing"]);

export function isReviewCall(call: SponsorCallRow): boolean {
  const s = (call.status ?? "").trim().toLowerCase();
  return REVIEW_STATUSES.has(s);
}

export function isConfirmedCall(call: SponsorCallRow): boolean {
  return call.status === "approved";
}

export function matchesPayoutFilter(
  call: SponsorCallRow,
  filter: ConfirmedPayoutFilter,
): boolean {
  if (filter === "all") return true;
  const ps = (call.payout_status ?? "processing").toLowerCase();
  if (filter === "completed") return ps === "completed";
  return ps === "processing" || ps === "pending" || ps === "";
}

export function isMatchCompleted(call: SponsorCallRow): boolean {
  return (call.final_selected_quote_id ?? "").trim() !== "";
}

export function matchStageLabel(call: SponsorCallRow): string {
  return isMatchCompleted(call) ? LABEL.matchDone : LABEL.matchBefore;
}

export function payoutStatusLabel(status?: string | null): string {
  if (status === "completed") return LABEL.payoutCompleted;
  if (status === "processing" || status === "pending") return LABEL.payoutProcessing;
  return LABEL.unconfirmed;
}

export function formatWon(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

export function formatQuoteDeadline(deadline?: string): string {
  if (!deadline?.trim()) return LABEL.unconfirmed;
  const time = new Date(deadline).getTime();
  if (!Number.isFinite(time)) return LABEL.unconfirmed;
  const diff = time - Date.now();
  if (diff <= 0) return "마감됨";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.ceil((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `${minutes}분`;
  return `${hours}시간 ${minutes}분`;
}

export function formatQuoteCount(call: SponsorCallRow): string {
  if (call.quote_limit_count != null) {
    return `${call.quote_count ?? 0} / ${call.quote_limit_count}건`;
  }
  return `${call.quote_count ?? 0}건`;
}

export function formatDepartureAt(call: SponsorCallRow): string {
  const date = call.departure_date?.trim() || LABEL.unconfirmed;
  const time = call.departure_time?.trim();
  if (!time || time === LABEL.dash) return date;
  return `${date} ${time}`;
}

export function displaySupportKind(call: SponsorCallRow): string {
  return (
    call.support_kind?.trim() ||
    call.sponsor_rule_title?.trim() ||
    LABEL.dash
  );
}

export function displaySupportForm(call: SponsorCallRow): string {
  const raw = call.support_form_kind?.trim() || call.support_type;
  if (!raw) return LABEL.dash;
  return sponsorSupportTypeLabel(raw) !== raw ? sponsorSupportTypeLabel(raw) : raw;
}

export function displaySupportCondition(call: SponsorCallRow): string {
  return (
    call.support_condition_label?.trim() ||
    call.support_condition?.trim() ||
    LABEL.dash
  );
}

export type SponsorTabCounts = {
  review: number;
  confirmed: number;
  payoutAll: number;
  payoutProcessing: number;
  payoutCompleted: number;
};

/** 진행 탭·리포트 카드 공통 건수 (목록 필터와 무관) */
export function sponsorTabCounts(calls: SponsorCallRow[]): SponsorTabCounts {
  let review = 0;
  let confirmed = 0;
  let payoutProcessing = 0;
  let payoutCompleted = 0;

  for (const call of calls) {
    if (isReviewCall(call)) review += 1;
    if (!isConfirmedCall(call)) continue;
    confirmed += 1;
    const ps = (call.payout_status ?? "processing").toLowerCase();
    if (ps === "completed") payoutCompleted += 1;
    else payoutProcessing += 1;
  }

  return {
    review,
    confirmed,
    payoutAll: confirmed,
    payoutProcessing,
    payoutCompleted,
  };
}

export type SponsorSummary = {
  totalBudget: number;
  usedConfirmed: number;
  todayConfirmed: number;
  monthConfirmed: number;
  remainingBudget: number;
  reviewCount: number;
  confirmedCount: number;
  payoutProcessingCount: number;
  payoutCompletedCount: number;
};

export function buildSummary(
  calls: SponsorCallRow[],
  settingsBudget?: number,
): SponsorSummary {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);

  let usedConfirmed = 0;
  let todayConfirmed = 0;
  let monthConfirmed = 0;
  let reviewCount = 0;
  let confirmedCount = 0;
  let payoutProcessingCount = 0;
  let payoutCompletedCount = 0;

  for (const call of calls) {
    if (isReviewCall(call)) reviewCount += 1;
    if (!isConfirmedCall(call)) continue;
    confirmedCount += 1;
    const amt = call.approved_support_amount ?? 0;
    usedConfirmed += amt;
    const decided = call as SponsorCallRow & { approved_at?: string };
    const at = (decided as { approved_at?: string }).approved_at;
    if (at?.startsWith(todayKey)) todayConfirmed += amt;
    if (at?.startsWith(monthKey)) monthConfirmed += amt;
    const ps = call.payout_status ?? "processing";
    if (ps === "completed") payoutCompletedCount += 1;
    else payoutProcessingCount += 1;
  }

  const totalBudget = settingsBudget ?? 0;
  const remainingBudget = totalBudget > 0 ? Math.max(totalBudget - usedConfirmed, 0) : 0;

  return {
    totalBudget,
    usedConfirmed,
    todayConfirmed,
    monthConfirmed,
    remainingBudget,
    reviewCount,
    confirmedCount,
    payoutProcessingCount,
    payoutCompletedCount,
  };
}
