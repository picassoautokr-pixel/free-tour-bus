import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import {
  buildQuoteFormPlannedPreview,
  buildQuoteSupportBreakdown,
  calculatePlannedDiscountPrice,
  extensionPlannedFromPartnerSupport,
  formatSupportAmount,
  formatSupportAmountFromBreakdown,
  SETTLEMENT_TYPE_LABELS,
  type BuildQuoteSupportBreakdownOptions,
  type QuoteSupportInput,
} from "@/lib/support-calculation";
import {
  buildQuoteSupportDisplayModel,
  type QuoteSupportDisplayModel,
} from "@/lib/quote-support-display-model";

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
  selected_price_type?: string | null;
  selected_price_label?: string | null;
  selected_price?: number | null;
  client_price_selection_kind?: string | null;
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
  client_reward_amount?: number | null;
  extension_support_amount?: number | null;
  confirmed_total_support?: number | null;
  approved_support_amount?: number | null;
  sponsor_approved_support_amount?: number | null;
  vehicle_type?: string;
  available_time?: string;
  message?: string;
  created_at?: string;
  sponsor_quote_enabled?: boolean;
};

function quoteSupportInputFromCall(call: PartnerCallLike): QuoteSupportInput {
  const q = call.my_quote;
  if (!q) return { sponsor_quote_enabled: false };
  return {
    price: q.price,
    support_settlement_type: q.support_settlement_type,
    planned_total_support: q.planned_total_support,
    planned_customer_support: q.planned_customer_support,
    planned_driver_support: q.planned_driver_support,
    planned_discount_price: q.planned_discount_price,
    preapproved_support_amount: q.preapproved_support_amount,
    confirmed_total_support: q.confirmed_total_support,
    approved_support_amount: q.approved_support_amount,
    customer_support_amount: q.customer_support_amount,
    client_reward_amount: q.client_reward_amount,
    support_discount_amount: q.support_discount_amount,
    driver_support_amount: q.driver_support_amount,
    extension_support_amount: q.extension_support_amount,
    sponsor_approved_support_amount:
      q.sponsor_approved_support_amount ?? call.sponsor_approved_support_amount,
    sponsor_quote_enabled: q.sponsor_quote_enabled ?? true,
    support_breakdown: q.support_breakdown ?? undefined,
  };
}

function supportBreakdownOptions(call: PartnerCallLike): BuildQuoteSupportBreakdownOptions {
  const app = applicationSupportTotals(call);
  return {
    applicationApprovedSupportTotal: call.sponsor_approved_support_amount,
    applicationTotalPlannedSupport: app.totalPlanned,
    sponsorEstimatedSupportAmount: call.sponsor_estimated_support_amount,
    sponsorApprovedSupportAmount: call.sponsor_approved_support_amount,
    applicationExtensionSupportAmount:
      call.my_quote?.extension_support_amount ?? null,
  };
}

export function quoteBreakdownForCall(call: PartnerCallLike): QuoteSupportBreakdown | null {
  if (!call.my_quote || call.my_quote.source !== "member") return null;
  const options = supportBreakdownOptions(call);
  const input = quoteSupportInputFromCall(call);

  if (call.my_quote.support_breakdown) {
    const cached = call.my_quote.support_breakdown;
    if (cached.calculationStatus === "ok") {
      return cached;
    }
    if (
      cached.calculationStatus === "failed" &&
      (applicationSupportTotals(call).totalPlanned ?? 0) > 0
    ) {
      return buildQuoteSupportBreakdown(input, options);
    }
    return cached;
  }
  return buildQuoteSupportBreakdown(input, options);
}

export function quoteSupportDisplayModelForCall(
  call: PartnerCallLike,
): QuoteSupportDisplayModel | null {
  if (!call.my_quote || call.my_quote.source !== "member") return null;
  const totals = applicationSupportTotals(call);
  const primarySponsor = (call.sponsors ?? [])[0] ?? null;
  const quote = call.my_quote as PartnerMyQuoteLike & Record<string, unknown>;
  return buildQuoteSupportDisplayModel({
    application: {
      ...call,
      approved_support_amount: call.sponsor_approved_support_amount,
      estimated_support_amount: call.sponsor_estimated_support_amount,
    } as unknown as Record<string, unknown>,
    quote: {
      ...quote,
      approved_support_amount:
        quote.approved_support_amount ??
        quote.sponsor_approved_support_amount ??
        call.sponsor_approved_support_amount ??
        totals.totalConfirmed,
      estimated_support_amount:
        quote.estimated_support_amount ??
        call.sponsor_estimated_support_amount ??
        totals.totalPlanned,
    } as unknown as Record<string, unknown>,
    sponsor_preapproval: primarySponsor
      ? {
          status: primarySponsor.status,
          estimated_support_amount: primarySponsor.estimated_support_amount,
          approved_support_amount: primarySponsor.approved_support_amount,
        }
      : {
          status: call.sponsor_support_status,
          estimated_support_amount: call.sponsor_estimated_support_amount,
          approved_support_amount: call.sponsor_approved_support_amount,
        },
    support_breakdown: call.my_quote.support_breakdown,
    extension_count: call.extension_round,
  });
}

/** 상단 요약 카드·하단 breakdown 동일 소스 */
export function partnerSupportSummaryForCard(call: PartnerCallLike): {
  breakdown: QuoteSupportBreakdown | null;
  showConfirmed: boolean;
  totalPlannedForForm: number;
  summaryFormatted: string;
} {
  const model = quoteSupportDisplayModelForCall(call);
  const breakdown = quoteBreakdownForCall(call);
  const sponsorApproved = sponsorStageConfirmed(call.sponsor_support_status);

  if (model) {
    const showConfirmed = model.support_stage === "지원확정";
    return {
      breakdown,
      showConfirmed,
      totalPlannedForForm: model.planned_total_support ?? 0,
      summaryFormatted: showConfirmed
        ? fmt(model.confirmed_total_support, "confirmed", breakdown ?? undefined)
        : fmt(model.planned_total_support, "planned", breakdown ?? undefined),
    };
  }

  if (breakdown && breakdown.calculationStatus === "ok") {
    const showConfirmed =
      breakdown.isConfirmed ||
      (sponsorApproved && breakdown.totalConfirmedSupport != null);
    return {
      breakdown,
      showConfirmed,
      totalPlannedForForm: breakdown.totalPlannedSupport ?? 0,
      summaryFormatted: showConfirmed
        ? fmt(breakdown.totalConfirmedSupport, "confirmed", breakdown)
        : fmt(breakdown.totalPlannedSupport, "planned", breakdown),
    };
  }

  const app = applicationSupportTotals(call);
  const showConfirmed = app.isConfirmed || sponsorApproved;
  return {
    breakdown,
    showConfirmed,
    totalPlannedForForm: app.totalPlanned ?? 0,
    summaryFormatted: showConfirmed
      ? formatSupportAmount(app.totalConfirmed, {
          phase: "confirmed",
          isConfirmed: app.totalConfirmed != null,
        })
      : formatSupportAmount(app.totalPlanned, { phase: "planned" }),
  };
}

export function sponsorStageLabel(status?: string): string {
  if (status === "approved") return "지원확정";
  if (status === "preapproved" || status === "mixed" || status === "pending") {
    return "지원검토";
  }
  return "지원검토";
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
  return (
    calculatePlannedDiscountPrice(
      params.normalPrice,
      params.customerPlanned,
      params.extensionPlanned,
    ) ?? 0
  );
}

/** 견적 폼 예정 지원금 미리보기 (공통 계산) */
export function quoteFormPlannedAmounts(params: {
  normalPrice: number | null;
  customerPlanned: number | null;
  totalPlanned: number | null;
  extensionRound: number;
}) {
  const extensionFromRound =
    params.totalPlanned != null && params.customerPlanned != null
      ? extensionPlannedAmount(
          Math.max(params.totalPlanned - params.customerPlanned, 0),
          params.extensionRound,
        )
      : 0;
  return buildQuoteFormPlannedPreview({
    normalPrice: params.normalPrice,
    totalPlanned: params.totalPlanned,
    customerPlanned: params.customerPlanned,
    extensionAmount: extensionFromRound,
  });
}
