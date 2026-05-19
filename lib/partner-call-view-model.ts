import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import {
  buildQuoteSupportBreakdown,
  formatSupportAmount,
  formatSupportAmountFromBreakdown,
  SETTLEMENT_TYPE_LABELS,
} from "@/lib/support-calculation";
import { extensionPlannedFromPartnerSupport } from "@/lib/support-calculation";

export type PartnerSponsorOnCall = {
  id: string;
  company_name: string;
  status: string;
  estimated_support_amount: number | null;
  approved_support_amount: number | null;
};

export type PartnerCallLike = {
  id: string;
  departure_date: string;
  departure_time: string;
  departure: string;
  destination: string;
  stopovers?: string[];
  passenger_count: number | null;
  trip_type: string;
  bus_grade: string;
  departure_region?: string;
  quote_deadline_at: string;
  quote_count: number;
  quote_limit_count: number | null;
  target_normal_price: number | null;
  target_member_price: number | null;
  extension_round: number;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  sponsor_estimated_support_amount?: number | null;
  sponsors?: PartnerSponsorOnCall[];
  final_selected_quote_id?: string;
  my_quote: PartnerMyQuoteLike | null;
};

export type PartnerMyQuoteLike = {
  source?: "member" | "guest";
  price: number | null;
  support_settlement_type?: string;
  support_breakdown?: QuoteSupportBreakdown | null;
  customer_support_amount?: number | null;
  support_discount_amount?: number | null;
  driver_support_amount?: number | null;
  preapproved_support_amount?: number | null;
  planned_total_support?: number | null;
  planned_customer_support?: number | null;
  planned_driver_support?: number | null;
  planned_discount_price?: number | null;
  member_price?: number | null;
  vehicle_type?: string;
  available_time?: string;
  message?: string;
  created_at?: string;
  sponsor_quote_enabled?: boolean;
};

export function quoteBreakdownForCall(call: PartnerCallLike): QuoteSupportBreakdown | null {
  if (!call.my_quote || call.my_quote.source !== "member") return null;
  if (call.my_quote.support_breakdown) return call.my_quote.support_breakdown;
  return buildQuoteSupportBreakdown(
    {
      price: call.my_quote.price,
      support_settlement_type: call.my_quote.support_settlement_type,
      planned_total_support:
        call.my_quote.planned_total_support ?? call.my_quote.preapproved_support_amount,
      planned_customer_support:
        call.my_quote.planned_customer_support ?? call.my_quote.customer_support_amount,
      planned_driver_support:
        call.my_quote.planned_driver_support ?? call.my_quote.driver_support_amount,
      planned_discount_price:
        call.my_quote.planned_discount_price ?? call.my_quote.member_price,
      customer_support_amount: call.my_quote.customer_support_amount,
      support_discount_amount: call.my_quote.support_discount_amount,
      driver_support_amount: call.my_quote.driver_support_amount,
      sponsor_quote_enabled: call.my_quote.sponsor_quote_enabled ?? true,
    },
    { applicationApprovedSupportTotal: call.sponsor_approved_support_amount },
  );
}

export function sponsorStageLabel(status?: string): string {
  if (status === "approved") return "지원금 확정";
  if (status === "preapproved" || status === "mixed" || status === "pending") {
    return "예상 지원금";
  }
  return "예상 지원금";
}

export function sponsorStageConfirmed(status?: string): boolean {
  return status === "approved";
}

/** 앱 단위 총 예정/확정 (후원업체 목록 합산 전 요약) */
export function applicationSupportTotals(call: PartnerCallLike) {
  const sponsors = call.sponsors ?? [];
  if (sponsors.length > 0) {
    let planned = 0;
    let confirmed = 0;
    let hasPlanned = false;
    let hasConfirmed = false;
    for (const s of sponsors) {
      if (s.estimated_support_amount != null && s.estimated_support_amount > 0) {
        planned += s.estimated_support_amount;
        hasPlanned = true;
      }
      if (s.approved_support_amount != null && s.approved_support_amount > 0) {
        confirmed += s.approved_support_amount;
        hasConfirmed = true;
      }
    }
    return {
      totalPlanned: hasPlanned ? planned : null,
      totalConfirmed: hasConfirmed ? confirmed : null,
      isConfirmed: hasConfirmed,
    };
  }
  const isConfirmed =
    call.sponsor_support_status === "approved" &&
    (call.sponsor_approved_support_amount ?? 0) > 0;
  return {
    totalPlanned:
      (call.sponsor_estimated_support_amount ?? 0) > 0
        ? call.sponsor_estimated_support_amount!
        : null,
    totalConfirmed: isConfirmed ? call.sponsor_approved_support_amount! : null,
    isConfirmed,
  };
}

export function extensionPlannedAmount(
  partnerPlannedSupport: number,
  extensionRound: number,
): number {
  return extensionPlannedFromPartnerSupport(partnerPlannedSupport, extensionRound);
}

export function departureTimestamp(call: PartnerCallLike): number | null {
  const date = call.departure_date.trim();
  if (!date) return null;
  const time = call.departure_time.trim();
  const iso = time && time !== "—" ? `${date}T${time}` : `${date}T00:00:00`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function matchedRunStatus(
  call: PartnerCallLike,
): "in_progress" | "completed" {
  const t = departureTimestamp(call);
  if (t == null) return "in_progress";
  return t > Date.now() ? "in_progress" : "completed";
}

export function formatUntilDeparture(call: PartnerCallLike): string {
  const t = departureTimestamp(call);
  if (t == null) return "미확정";
  const diffMs = t - Date.now();
  const abs = Math.abs(diffMs);
  const hours = Math.floor(abs / (60 * 60 * 1000));
  const minutes = Math.ceil((abs % (60 * 60 * 1000)) / (60 * 1000));
  const span =
    hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
  return diffMs >= 0 ? `${span} 남음` : `${span} 경과`;
}

export function formatQuoteDeadline(deadline: string): string {
  const time = new Date(deadline).getTime();
  if (!Number.isFinite(time)) return "미확정";
  const diff = time - Date.now();
  if (diff <= 0) return "마감됨";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.ceil((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `${minutes}분`;
  return `${hours}시간 ${minutes}분`;
}

export function formatQuoteProgress(call: PartnerCallLike): string {
  if (call.quote_limit_count != null) {
    return `${call.quote_count} / ${call.quote_limit_count}건`;
  }
  return `${call.quote_count}건`;
}

export function fmt(
  value: number | null | undefined,
  phase: "planned" | "confirmed" | "final",
  breakdown?: QuoteSupportBreakdown | null,
): string {
  if (breakdown) {
    return formatSupportAmountFromBreakdown(breakdown, value ?? null, phase);
  }
  return formatSupportAmount(value, { phase });
}

export function settlementLabel(type?: string): string {
  return SETTLEMENT_TYPE_LABELS[type === "ratio" ? "ratio" : "client_priority"];
}

/** 견적 작성 시 연장 지원금 (기사 예정 × 회차%) */
export function quoteFormExtensionPreview(params: {
  customerPlanned: number;
  totalPlanned: number;
  extensionRound: number;
}): number {
  const partnerPlanned = Math.max(params.totalPlanned - params.customerPlanned, 0);
  return extensionPlannedAmount(partnerPlanned, params.extensionRound);
}

export function quoteFormPlannedDiscountPrice(params: {
  normalPrice: number;
  customerPlanned: number;
  extensionPlanned: number;
}): number {
  return Math.max(
    params.normalPrice - params.customerPlanned - params.extensionPlanned,
    0,
  );
}
