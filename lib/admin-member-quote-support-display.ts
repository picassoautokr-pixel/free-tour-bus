/**
 * 어드민 제휴기사 견적 카드 — 지원금 표시 (application/sponsor fallback, UTF-8)
 */

import type { AdminMemberQuoteDebug, AdminMemberQuoteSupportRow } from "@/lib/admin-application-detail-build";
import type { AdminSponsorDetail } from "@/lib/admin-application-detail-build";
import { safeText } from "@/lib/sponsor";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function breakdownRecord(
  quote: Record<string, unknown>,
): Record<string, unknown> | null {
  const raw = quote.support_breakdown;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

export function breakdownField(
  breakdown: Record<string, unknown> | null,
  snake: string,
  camel: string,
): number | null {
  if (!breakdown) return null;
  return parseInteger(breakdown[snake] ?? breakdown[camel]);
}

export type AdminMemberQuoteSupportContext = {
  quote: Record<string, unknown>;
  application: Record<string, unknown>;
  sponsor: AdminSponsorDetail | null;
  sponsorConfirmed: boolean;
};

export type AdminMemberQuoteSupportDisplay = {
  rows: AdminMemberQuoteSupportRow[];
  debug: AdminMemberQuoteDebug;
  fallbacksUsed: string[];
};

function appApproved(ctx: AdminMemberQuoteSupportContext): number | null {
  return (
    parseInteger(ctx.application.sponsor_approved_support_amount) ??
    parseInteger(ctx.application.approved_support_amount) ??
    ctx.sponsor?.approved_support_amount ??
    null
  );
}

function appEstimated(ctx: AdminMemberQuoteSupportContext): number | null {
  return (
    parseInteger(ctx.application.estimated_support_amount) ??
    parseInteger(ctx.application.sponsor_estimated_support_amount) ??
    ctx.sponsor?.estimated_support_amount ??
    null
  );
}

export function resolveConfirmedTotalSupport(ctx: AdminMemberQuoteSupportContext): {
  value: number | null;
  source: string | null;
} {
  const breakdown = breakdownRecord(ctx.quote);
  const chain: Array<[string, number | null]> = [
    ["support_breakdown.confirmed_total_support", breakdownField(breakdown, "confirmed_total_support", "totalConfirmedSupport")],
    ["quote.confirmed_total_support", parseInteger(ctx.quote.confirmed_total_support)],
    ["quote.total_confirmed_support", parseInteger(ctx.quote.total_confirmed_support)],
    ["quote.approved_support_amount", parseInteger(ctx.quote.approved_support_amount)],
    ["quote.sponsor_approved_support_amount", parseInteger(ctx.quote.sponsor_approved_support_amount)],
    ["application.sponsor_approved_support_amount", parseInteger(ctx.application.sponsor_approved_support_amount)],
    ["application.approved_support_amount", parseInteger(ctx.application.approved_support_amount)],
    ["sponsor.approved_support_amount", ctx.sponsor?.approved_support_amount ?? null],
  ];
  for (const [source, value] of chain) {
    if (value != null) return { value, source };
  }
  return { value: null, source: null };
}

export function resolvePlannedTotalSupport(ctx: AdminMemberQuoteSupportContext): {
  value: number | null;
  source: string | null;
} {
  const breakdown = breakdownRecord(ctx.quote);
  const chain: Array<[string, number | null]> = [
    ["support_breakdown.planned_total_support", breakdownField(breakdown, "planned_total_support", "totalPlannedSupport")],
    ["quote.planned_total_support", parseInteger(ctx.quote.planned_total_support)],
    ["quote.total_planned_support", parseInteger(ctx.quote.total_planned_support)],
    ["quote.estimated_support_amount", parseInteger(ctx.quote.estimated_support_amount)],
    ["application.estimated_support_amount", parseInteger(ctx.application.estimated_support_amount)],
    ["application.sponsor_estimated_support_amount", parseInteger(ctx.application.sponsor_estimated_support_amount)],
    ["sponsor.estimated_support_amount", ctx.sponsor?.estimated_support_amount ?? null],
  ];
  for (const [source, value] of chain) {
    if (value != null) return { value, source };
  }
  return { value: null, source: null };
}

function resolveDiscountAppliedPrice(
  ctx: AdminMemberQuoteSupportContext,
  confirmedTotal: number | null,
): { value: number | null; source: string | null } {
  const breakdown = breakdownRecord(ctx.quote);
  const normal = parseInteger(ctx.quote.price);
  const selected = parseInteger(ctx.application.selected_price);

  const chain: Array<[string, number | null]> = [
    ["support_breakdown.final_discount_price", breakdownField(breakdown, "final_discount_price", "finalDiscountAppliedPrice")],
    [
      "support_breakdown.support_discount_applied_price",
      breakdownField(breakdown, "support_discount_applied_price", "supportDiscountAppliedPrice"),
    ],
    ["quote.confirmed_discount_price", parseInteger(ctx.quote.confirmed_discount_price)],
    ["quote.final_discount_applied_price", parseInteger(ctx.quote.final_discount_applied_price)],
    ["quote.support_discount_applied_price", parseInteger(ctx.quote.support_discount_applied_price)],
    ["quote.final_member_price", parseInteger(ctx.quote.final_member_price)],
    ["quote.sponsor_discounted_price", parseInteger(ctx.quote.sponsor_discounted_price)],
    [
      "derived.selected_price_minus_confirmed",
      selected != null && confirmedTotal != null ? Math.max(selected - confirmedTotal, 0) : null,
    ],
    [
      "derived.normal_minus_confirmed",
      normal != null && confirmedTotal != null ? Math.max(normal - confirmedTotal, 0) : null,
    ],
    ["application.selected_price", selected],
  ];
  for (const [source, value] of chain) {
    if (value != null) return { value, source };
  }
  return { value: null, source: null };
}

export function buildAdminMemberQuoteSupportDisplay(
  ctx: AdminMemberQuoteSupportContext,
): AdminMemberQuoteSupportDisplay {
  const breakdown = breakdownRecord(ctx.quote);
  const fallbacksUsed: string[] = [];

  const pick = (label: string, resolved: { value: number | null; source: string | null }) => {
    if (resolved.source && !resolved.source.startsWith("support_breakdown.")) {
      fallbacksUsed.push(`${label}:${resolved.source}`);
    }
    return resolved.value;
  };

  if (ctx.sponsorConfirmed) {
    const confirmed = resolveConfirmedTotalSupport(ctx);
    const confirmedTotal = pick("confirmed_total", confirmed);

    const customerRaw =
      breakdownField(breakdown, "confirmed_customer_support", "customerConfirmedSupport") ??
      parseInteger(ctx.quote.confirmed_customer_support) ??
      parseInteger(ctx.quote.customer_confirmed_support) ??
      parseInteger(ctx.quote.final_customer_support_amount) ??
      confirmedTotal;

    if (customerRaw != null && customerRaw === confirmedTotal && confirmed.source?.startsWith("application.")) {
      fallbacksUsed.push("customer_confirmed:confirmed_total");
    }

    const extensionRaw =
      breakdownField(breakdown, "confirmed_extension_support", "extensionSupport") ??
      parseInteger(ctx.quote.confirmed_extension_support) ??
      0;

    const discount = resolveDiscountAppliedPrice(ctx, confirmedTotal);

    return {
      rows: [
        { label: "확정 지원금", value: confirmedTotal },
        { label: "고객 확정 지원금", value: customerRaw },
        { label: "확정 연장 지원금", value: extensionRaw },
        { label: "지원금 할인 적용가", value: pick("discount", discount) },
      ],
      fallbacksUsed,
      debug: buildAdminMemberQuoteDebug(ctx, breakdown, {
        confirmedTotal,
        plannedTotal: resolvePlannedTotalSupport(ctx).value,
        discount: discount.value,
      }),
    };
  }

  const planned = resolvePlannedTotalSupport(ctx);
  const plannedTotal = pick("planned_total", planned);

  const customerPlanned =
    breakdownField(breakdown, "planned_customer_support", "customerPlannedSupport") ??
    parseInteger(ctx.quote.planned_customer_support) ??
    parseInteger(ctx.quote.customer_planned_support) ??
    parseInteger(ctx.quote.customer_support_amount);

  const extensionPlanned =
    breakdownField(breakdown, "planned_extension_support", "extensionSupport") ??
    parseInteger(ctx.quote.planned_extension_support) ??
    parseInteger(ctx.quote.extension_support_amount) ??
    0;

  const discountPlanned =
    breakdownField(breakdown, "planned_discount_price", "supportDiscountPlannedPrice") ??
    parseInteger(ctx.quote.planned_discount_price) ??
    parseInteger(ctx.quote.support_discount_planned_price) ??
    parseInteger(ctx.quote.member_price);

  return {
    rows: [
      { label: "예상 지원금", value: plannedTotal },
      { label: "고객 예상 지원금", value: customerPlanned },
      { label: "예상 연장 지원금", value: extensionPlanned },
      { label: "지원금 할인 예상가", value: discountPlanned },
    ],
    fallbacksUsed,
    debug: buildAdminMemberQuoteDebug(ctx, breakdown, {
      confirmedTotal: resolveConfirmedTotalSupport(ctx).value,
      plannedTotal,
      discount: discountPlanned,
    }),
  };
}

function buildAdminMemberQuoteDebug(
  ctx: AdminMemberQuoteSupportContext,
  breakdown: Record<string, unknown> | null,
  resolved: {
    confirmedTotal: number | null;
    plannedTotal: number | null;
    discount: number | null;
  },
): AdminMemberQuoteDebug {
  const calcStatus =
    safeText(breakdown?.calculation_status) ||
    safeText(breakdown?.calculationStatus) ||
    "—";

  const missingSnapshotFields: string[] = [];
  const required = [
    "planned_total_support",
    "confirmed_total_support",
    "planned_customer_support",
    "confirmed_customer_support",
    "planned_discount_price",
    "final_discount_price",
  ] as const;
  for (const key of required) {
    if (breakdown && breakdown[key] == null) {
      missingSnapshotFields.push(key);
    }
  }

  return {
    has_support_breakdown: breakdown != null,
    support_breakdown_raw: breakdown,
    planned_total_support: resolved.plannedTotal,
    confirmed_total_support: resolved.confirmedTotal,
    calculation_status: calcStatus,
    calculation_error:
      safeText(breakdown?.calculation_error) || safeText(breakdown?.calculationError) || null,
    fallback_used: null,
    missing_fields: breakdown?.missing_fields ?? breakdown?.missingFields ?? null,
    failed_reason:
      calcStatus === "failed"
        ? safeText(breakdown?.calculation_error) ||
          safeText(breakdown?.calculationError) ||
          "snapshot planned/confirmed 필드 누락"
        : null,
    missing_required_fields: breakdown?.missing_required_fields ?? null,
    missing_snapshot_fields: missingSnapshotFields,
    selected_price: parseInteger(ctx.application.selected_price),
    approved_support_amount: appApproved(ctx),
    estimated_support_amount: appEstimated(ctx),
    resolved_discount_price: resolved.discount,
    fallbacks_used: [],
  };
}
