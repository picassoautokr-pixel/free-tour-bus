/**
 * 어드민 제휴기사 견적 카드 — 지원금 표시 (application/sponsor fallback, UTF-8)
 */

import type { AdminMemberQuoteDebug, AdminMemberQuoteSupportRow } from "@/lib/admin-application-detail-build";
import type { AdminSponsorDetail } from "@/lib/admin-application-detail-build";
import {
  resolveApplicationApprovedSupportTotal,
  resolveApplicationEstimatedSupportTotal,
} from "@/lib/application-approved-support";
import {
  deriveCustomerConfirmedSupport,
  resolveConfirmedCustomerSupportDisplay,
  resolvePartnerConfirmedSupport,
} from "@/lib/support-calculation";
import { buildQuoteSupportDisplayModel } from "@/lib/quote-support-display-model";
import { resolveAdminSponsorConfirmed } from "@/lib/admin-sponsor-confirmed";
import { resolveApplicationSelectedPriceType } from "@/lib/admin-selected-quote-price";
import { safeText } from "@/lib/sponsor";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

import { breakdownField, breakdownRecord } from "@/lib/admin-quote-breakdown-helpers";

export { breakdownField, breakdownRecord };

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
  return resolveApplicationApprovedSupportTotal(ctx.application, ctx.sponsor);
}

function appEstimated(ctx: AdminMemberQuoteSupportContext): number | null {
  return resolveApplicationEstimatedSupportTotal(ctx.application, ctx.sponsor);
}

function amountOrZero(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function rowValue(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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
    ["application.approved_support_amount", parseInteger(ctx.application.approved_support_amount)],
    ["application.sponsor_approved_support_amount", parseInteger(ctx.application.sponsor_approved_support_amount)],
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
): { value: number | null; source: string | null } {
  const breakdown = breakdownRecord(ctx.quote);
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
  ];
  for (const [source, value] of chain) {
    if (value != null) return { value, source };
  }
  return { value: null, source: null };
}

export function buildAdminMemberQuoteSupportDisplay(
  ctx: AdminMemberQuoteSupportContext,
): AdminMemberQuoteSupportDisplay {
  const model = buildQuoteSupportDisplayModel({
    application: ctx.application,
    quote: {
      ...ctx.quote,
      sponsor_support_status: ctx.sponsorConfirmed
        ? "approved"
        : ctx.quote.sponsor_support_status,
    },
    sponsor_preapproval: ctx.sponsor
      ? {
          status: ctx.sponsor.sponsor_confirmed ? "approved" : ctx.sponsor.support_status,
          estimated_support_amount: ctx.sponsor.estimated_support_amount,
          approved_support_amount: ctx.sponsor.approved_support_amount,
        }
      : null,
    support_breakdown: ctx.quote.support_breakdown,
    extension_count: ctx.application.extension_round,
  });

  const fallbacksUsed = [
    model.debug.normal_price_source,
    model.debug.planned_total_support_source,
    model.debug.confirmed_total_support_source,
    model.debug.customer_support_source,
    model.debug.discount_price_source,
  ].filter(
    (source): source is string =>
      typeof source === "string" && !source.startsWith("support_breakdown."),
  );

  return {
    rows: model.display_rows,
    fallbacksUsed,
    debug: {
      has_support_breakdown: model.debug.support_breakdown_raw != null,
      support_breakdown_raw: model.debug.support_breakdown_raw,
      planned_total_support: model.planned_total_support,
      confirmed_total_support: model.confirmed_total_support,
      application_selected_price_type: model.debug.selected_price_type,
      application_selected_price_label: model.debug.selected_price_label,
      application_selected_price: model.debug.selected_price,
      application_client_price_selection_kind: model.debug.client_price_selection_kind,
      application_final_selected_quote_id: safeText(ctx.application.final_selected_quote_id) || null,
      quote_price: model.normal_price,
      sponsor_status_resolution: model.debug.support_stage_source,
      sponsor_confirmed_resolved: model.support_stage === "지원확정",
      selected_price_calculation_source: model.debug.discount_price_source,
      calculation_status: safeText(model.debug.support_breakdown_raw?.calculation_status) || "ok",
      calculation_error:
        safeText(model.debug.support_breakdown_raw?.calculation_error) ||
        safeText(model.debug.support_breakdown_raw?.calculationError) ||
        null,
      fallback_used: null,
      missing_fields: model.debug.support_breakdown_raw?.missing_fields ?? null,
      failed_reason: null,
      missing_required_fields: null,
      missing_snapshot_fields: [],
      selected_price: model.selected_price,
      approved_support_amount: model.confirmed_total_support,
      estimated_support_amount: model.planned_total_support,
      resolved_discount_price:
        model.support_stage === "지원확정"
          ? model.final_discount_price
          : model.planned_discount_price,
      confirmed_customer_support_source: model.debug.customer_support_source,
      confirmed_customer_support_formula:
        model.debug.customer_support_source === "derived:normal-final_discount-extension"
          ? "normal_price - final_discount_price - confirmed_extension_support"
          : null,
      confirmed_customer_support_derived_preview: model.confirmed_customer_support,
      confirmed_driver_support: model.confirmed_driver_support,
      fallbacks_used: fallbacksUsed,
    },
  };
}

function buildAdminMemberQuoteDebug(
  ctx: AdminMemberQuoteSupportContext,
  breakdown: Record<string, unknown> | null,
  resolved: {
    confirmedTotal: number | null;
    plannedTotal: number | null;
    discount: number | null;
    customerDisplay: ReturnType<typeof resolveConfirmedCustomerSupportDisplay> | null;
    driverConfirmed: number | null;
    extensionRaw: number | null;
    normalPrice: number | null;
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

  const derivedPreview =
    resolved.normalPrice != null && resolved.discount != null
      ? deriveCustomerConfirmedSupport({
          normalPrice: resolved.normalPrice,
          finalDiscountPrice: resolved.discount,
          confirmedExtensionSupport: resolved.extensionRaw,
        })
      : null;

  const sponsorResolution = resolveAdminSponsorConfirmed({
    application: ctx.application,
    sponsor: ctx.sponsor,
  });

  return {
    has_support_breakdown: breakdown != null,
    support_breakdown_raw: breakdown,
    planned_total_support: resolved.plannedTotal,
    confirmed_total_support: resolved.confirmedTotal,
    application_selected_price_type: resolveApplicationSelectedPriceType(ctx.application) || null,
    application_selected_price_label: safeText(ctx.application.selected_price_label) || null,
    application_selected_price: parseInteger(ctx.application.selected_price),
    application_client_price_selection_kind:
      safeText(ctx.application.client_price_selection_kind) || null,
    application_final_selected_quote_id:
      safeText(ctx.application.final_selected_quote_id) || null,
    quote_price: parseInteger(ctx.quote.price),
    sponsor_status_resolution: sponsorResolution.source,
    sponsor_confirmed_resolved: sponsorResolution.confirmed,
    selected_price_calculation_source: null,
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
    confirmed_customer_support_source: resolved.customerDisplay?.source ?? null,
    confirmed_customer_support_formula: resolved.customerDisplay?.formula ?? null,
    confirmed_customer_support_derived_preview: derivedPreview,
    confirmed_driver_support: resolved.driverConfirmed,
    fallbacks_used: [],
  };
}
