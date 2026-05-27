/**
 * 지원금 표시 모델 — 클라이언트/파트너/스폰서/어드민 공통 (UTF-8)
 */

import {
  SETTLEMENT_TYPE_LABELS,
  type SupportSettlementType,
} from "@/lib/support-calculation";
import {
  resolveEffectiveSelectedPriceType,
  type SelectedPriceSource,
  type SelectedPriceType,
} from "@/lib/selected-price-display";
import { isSponsorConfirmed } from "@/lib/status-normalizer";

export type QuoteSupportStage = "지원검토" | "지원확정";
export type SelectedQuoteType = "일반견적" | "할인견적";

export type QuoteSupportDisplayRow = {
  label: string;
  value: number | null;
};

export type QuoteSupportDisplayDebug = {
  selected_price_type: string | null;
  selected_price_label: string | null;
  selected_price: number | null;
  client_price_selection_kind: string | null;
  support_stage_source: string;
  normal_price_source: string | null;
  planned_total_support_source: string | null;
  confirmed_total_support_source: string | null;
  customer_support_source: string | null;
  discount_price_source: string | null;
  support_breakdown_raw: Record<string, unknown> | null;
};

export type QuoteSupportDisplayModel = {
  support_stage: QuoteSupportStage;
  selected_quote_type: SelectedQuoteType;
  normal_price: number | null;
  planned_total_support: number | null;
  confirmed_total_support: number | null;
  planned_customer_support: number | null;
  confirmed_customer_support: number | null;
  planned_driver_support: number | null;
  confirmed_driver_support: number | null;
  extension_count: number;
  planned_extension_support: number;
  confirmed_extension_support: number;
  planned_discount_price: number | null;
  final_discount_price: number | null;
  selected_price_label: string;
  selected_price: number | null;
  show_normal_price: boolean;
  support_settlement_type: SupportSettlementType;
  support_settlement_label: string;
  display_rows: QuoteSupportDisplayRow[];
  debug: QuoteSupportDisplayDebug;
};

export type QuoteSupportDisplayInput = {
  application?: Record<string, unknown> | null;
  quote?: Record<string, unknown> | null;
  sponsor_support?: Record<string, unknown> | null;
  sponsor_preapproval?: Record<string, unknown> | null;
  support_breakdown?: unknown;
  selected_price_type?: unknown;
  selected_price?: unknown;
  selected_price_label?: unknown;
  extension_count?: unknown;
};

type ResolvedNumber = {
  value: number | null;
  source: string | null;
};

function safeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function positiveOrZero(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readBreakdown(input: QuoteSupportDisplayInput): Record<string, unknown> | null {
  return (
    asRecord(input.support_breakdown) ??
    asRecord(input.quote?.support_breakdown) ??
    asRecord(input.application?.support_breakdown_snapshot)
  );
}

function readBreakdownAmount(
  breakdown: Record<string, unknown> | null,
  snake: string,
  camel: string,
): number | null {
  if (!breakdown) return null;
  return parseAmount(breakdown[snake] ?? breakdown[camel]);
}

function pickAmount(candidates: Array<[string, unknown]>): ResolvedNumber {
  for (const [source, raw] of candidates) {
    const value = parseAmount(raw);
    if (value != null) return { value: Math.max(0, value), source };
  }
  return { value: null, source: null };
}

function settlementType(value: unknown): SupportSettlementType {
  return safeText(value) === "ratio" ? "ratio" : "client_priority";
}

function resolveStage(params: {
  input: QuoteSupportDisplayInput;
  breakdown: Record<string, unknown> | null;
  confirmedTotal: number | null;
}): { stage: QuoteSupportStage; source: string } {
  const app = params.input.application ?? {};
  const quote = params.input.quote ?? {};
  const sponsor = params.input.sponsor_support ?? {};
  const preapproval = params.input.sponsor_preapproval ?? {};

  const statusChecks: Array<[string, unknown]> = [
    ["application.sponsor_support_status", app.sponsor_support_status],
    ["application.status", app.status],
    ["quote.sponsor_support_status", quote.sponsor_support_status],
    ["quote.support_status", quote.support_status],
    ["sponsor_support.status", sponsor.status],
    ["sponsor_preapproval.status", preapproval.status],
  ];

  for (const [source, raw] of statusChecks) {
    if (isSponsorConfirmed(safeText(raw))) {
      return { stage: "지원확정", source };
    }
  }

  // sponsor_approved_count > 0: "mixed" 상태(approved + preapproved 공존) 포함하여 확정 처리
  const appApprovedCount =
    typeof app.sponsor_approved_count === "number"
      ? app.sponsor_approved_count
      : typeof app.sponsor_approved_count === "string"
        ? Number.parseInt(app.sponsor_approved_count, 10)
        : 0;
  if (Number.isFinite(appApprovedCount) && appApprovedCount > 0) {
    return { stage: "지원확정", source: "application.sponsor_approved_count" };
  }

  // boolean 플래그 직접 확인 (status 문자열이 아닌 경우)
  if (params.breakdown?.isConfirmed === true) {
    return { stage: "지원확정", source: "support_breakdown.isConfirmed" };
  }
  if (params.breakdown?.is_confirmed === true) {
    return { stage: "지원확정", source: "support_breakdown.is_confirmed" };
  }

  if (params.confirmedTotal != null && params.confirmedTotal > 0) {
    return { stage: "지원확정", source: "confirmed_total_support>0" };
  }
  return { stage: "지원검토", source: "default" };
}

function calculateExtension(partnerSupport: number, extensionCount: number): number {
  if (partnerSupport <= 0 || extensionCount <= 0) return 0;
  return Math.min(
    Math.round(partnerSupport * extensionCount * 0.2),
    partnerSupport,
  );
}

function calculateRatioCustomerSupport(params: {
  plannedCustomer: number | null;
  plannedTotal: number | null;
  confirmedTotal: number | null;
}): number | null {
  const plannedCustomer = params.plannedCustomer;
  const plannedTotal = params.plannedTotal;
  const confirmedTotal = params.confirmedTotal;
  if (plannedCustomer == null || plannedTotal == null || confirmedTotal == null) return null;
  if (plannedTotal <= 0) return null;
  return Math.max(0, Math.round(plannedCustomer * (confirmedTotal / plannedTotal)));
}

function selectedPriceSource(input: QuoteSupportDisplayInput): SelectedPriceSource {
  const app = input.application ?? {};
  return {
    selected_price_type: safeText(input.selected_price_type) || safeText(app.selected_price_type),
    selected_price_label:
      safeText(input.selected_price_label) || safeText(app.selected_price_label),
    selected_price: parseAmount(input.selected_price) ?? parseAmount(app.selected_price),
    client_price_selection_kind: safeText(app.client_price_selection_kind),
  };
}

export function buildQuoteSupportDisplayModel(
  input: QuoteSupportDisplayInput,
): QuoteSupportDisplayModel {
  const app = input.application ?? {};
  const quote = input.quote ?? {};
  const sponsor = input.sponsor_support ?? {};
  const preapproval = input.sponsor_preapproval ?? {};
  const breakdown = readBreakdown(input);

  const normal = pickAmount([
    ["support_breakdown.normal_price", readBreakdownAmount(breakdown, "normal_price", "normalPrice")],
    ["quote.price", quote.price],
    ["quote.normal_price", quote.normal_price],
    ["application.target_normal_price", app.target_normal_price],
  ]);

  const plannedTotal = pickAmount([
    [
      "support_breakdown.planned_total_support",
      readBreakdownAmount(breakdown, "planned_total_support", "totalPlannedSupport"),
    ],
    ["quote.planned_total_support", quote.planned_total_support],
    ["quote.preapproved_support_amount", quote.preapproved_support_amount],
    ["quote.estimated_support_amount", quote.estimated_support_amount],
    ["sponsor_preapproval.estimated_support_amount", preapproval.estimated_support_amount],
    ["sponsor_support.estimated_support_amount", sponsor.estimated_support_amount],
    ["application.estimated_support_amount", app.estimated_support_amount],
    ["application.sponsor_estimated_support_amount", app.sponsor_estimated_support_amount],
  ]);

  const plannedCustomer = pickAmount([
    [
      "support_breakdown.planned_customer_support",
      readBreakdownAmount(breakdown, "planned_customer_support", "customerPlannedSupport"),
    ],
    ["quote.planned_customer_support", quote.planned_customer_support],
    ["quote.customer_support_amount", quote.customer_support_amount],
    ["quote.client_reward_amount", quote.client_reward_amount],
    ["quote.support_discount_amount", quote.support_discount_amount],
  ]);

  const confirmedTotal = pickAmount([
    [
      "support_breakdown.confirmed_total_support",
      readBreakdownAmount(breakdown, "confirmed_total_support", "totalConfirmedSupport"),
    ],
    ["quote.confirmed_total_support", quote.confirmed_total_support],
    ["quote.approved_support_amount", quote.approved_support_amount],
    ["sponsor_preapproval.approved_support_amount", preapproval.approved_support_amount],
    ["sponsor_support.approved_support_amount", sponsor.approved_support_amount],
    ["application.approved_support_amount", app.approved_support_amount],
    ["application.sponsor_approved_support_amount", app.sponsor_approved_support_amount],
  ]);

  const stage = resolveStage({
    input,
    breakdown,
    confirmedTotal: confirmedTotal.value,
  });

  const extensionCount =
    parseAmount(input.extension_count) ??
    parseAmount(app.extension_round) ??
    parseAmount(app.extension_count) ??
    0;

  const settlement = settlementType(
    quote.support_settlement_type ??
      breakdown?.support_mode ??
      breakdown?.settlementType ??
      breakdown?.settlement_type,
  );

  const plannedDriverRaw = pickAmount([
    [
      "support_breakdown.planned_driver_support",
      readBreakdownAmount(breakdown, "planned_driver_support", "partnerPlannedSupport"),
    ],
    ["quote.planned_driver_support", quote.planned_driver_support],
    ["quote.driver_support_amount", quote.driver_support_amount],
  ]);

  const plannedDriver =
    plannedDriverRaw.value ??
    (plannedTotal.value != null && plannedCustomer.value != null
      ? Math.max(plannedTotal.value - plannedCustomer.value, 0)
      : null);

  const plannedExtensionRaw = pickAmount([
    [
      "support_breakdown.planned_extension_support",
      readBreakdownAmount(breakdown, "planned_extension_support", "plannedExtensionSupport"),
    ],
  ]);
  const plannedExtension =
    plannedExtensionRaw.value ?? calculateExtension(plannedDriver ?? 0, extensionCount);

  const plannedDiscountRaw = pickAmount([
    [
      "support_breakdown.planned_discount_price",
      readBreakdownAmount(breakdown, "planned_discount_price", "supportDiscountPlannedPrice"),
    ],
    ["quote.planned_discount_price", quote.planned_discount_price],
    ["quote.support_discount_planned_price", quote.support_discount_planned_price],
    ["quote.member_price", quote.member_price],
  ]);
  const plannedDiscount =
    plannedDiscountRaw.value ??
    (normal.value != null && plannedCustomer.value != null
      ? Math.max(normal.value - plannedCustomer.value - plannedExtension, 0)
      : null);

  const confirmedExtensionRaw = pickAmount([
    [
      "support_breakdown.confirmed_extension_support",
      readBreakdownAmount(breakdown, "confirmed_extension_support", "extensionSupport"),
    ],
    ["quote.extension_support_amount", quote.extension_support_amount],
  ]);

  const confirmedCustomerStored = pickAmount([
    [
      "support_breakdown.confirmed_customer_support",
      readBreakdownAmount(breakdown, "confirmed_customer_support", "customerConfirmedSupport"),
    ],
    ["quote.confirmed_customer_support", quote.confirmed_customer_support],
    ["quote.final_customer_support_amount", quote.final_customer_support_amount],
  ]);

  const finalDiscountStored = pickAmount([
    [
      "support_breakdown.final_discount_price",
      readBreakdownAmount(breakdown, "final_discount_price", "finalDiscountAppliedPrice"),
    ],
    [
      "support_breakdown.support_discount_applied_price",
      readBreakdownAmount(
        breakdown,
        "support_discount_applied_price",
        "supportDiscountAppliedPrice",
      ),
    ],
    ["quote.final_discount_applied_price", quote.final_discount_applied_price],
    ["quote.support_discount_applied_price", quote.support_discount_applied_price],
    ["quote.confirmed_discount_price", quote.confirmed_discount_price],
    ["quote.final_member_price", quote.final_member_price],
  ]);

  let confirmedExtension = confirmedExtensionRaw.value ?? 0;
  let confirmedCustomer = confirmedCustomerStored.value;
  let customerSupportSource = confirmedCustomerStored.source;

  if (stage.stage === "지원확정" && confirmedCustomer == null) {
    if (settlement === "ratio") {
      confirmedCustomer = calculateRatioCustomerSupport({
        plannedCustomer: plannedCustomer.value,
        plannedTotal: plannedTotal.value,
        confirmedTotal: confirmedTotal.value,
      });
      customerSupportSource = confirmedCustomer != null ? "ratio_formula" : customerSupportSource;
    } else if (plannedCustomer.value != null && confirmedTotal.value != null) {
      confirmedCustomer = Math.min(plannedCustomer.value, confirmedTotal.value);
      customerSupportSource = "client_priority_formula";
    }
  }

  if (
    stage.stage === "지원확정" &&
    confirmedCustomer == null &&
    normal.value != null &&
    finalDiscountStored.value != null
  ) {
    confirmedCustomer = Math.max(
      normal.value - finalDiscountStored.value - confirmedExtension,
      0,
    );
    customerSupportSource = "derived:normal-final_discount-extension";
  }

  const driverBeforeExtension =
    confirmedTotal.value != null && confirmedCustomer != null
      ? Math.max(confirmedTotal.value - confirmedCustomer, 0)
      : null;

  if (confirmedExtensionRaw.value == null && driverBeforeExtension != null) {
    confirmedExtension = calculateExtension(driverBeforeExtension, extensionCount);
  }

  const confirmedDriverStored = pickAmount([
    [
      "support_breakdown.confirmed_driver_support",
      readBreakdownAmount(breakdown, "confirmed_driver_support", "partnerConfirmedSupport"),
    ],
    ["quote.confirmed_driver_support", quote.confirmed_driver_support],
    ["quote.final_driver_support_amount", quote.final_driver_support_amount],
  ]);
  const confirmedDriver =
    confirmedDriverStored.value ??
    (driverBeforeExtension != null
      ? Math.max(driverBeforeExtension - confirmedExtension, 0)
      : null);

  const finalDiscount =
    finalDiscountStored.value ??
    (normal.value != null && confirmedCustomer != null
      ? Math.max(normal.value - confirmedCustomer - confirmedExtension, 0)
      : null);

  const selectedSource = selectedPriceSource(input);
  const effectiveType = resolveEffectiveSelectedPriceType(selectedSource, {
    normalPrice: normal.value,
    supportPlannedPrice: plannedDiscount,
    supportAppliedPrice: finalDiscount,
    supportConfirmed: stage.stage === "지원확정",
  });

  const selectedQuoteType: SelectedQuoteType =
    effectiveType === "normal" ? "일반견적" : "할인견적";
  const selectedPrice =
    effectiveType === "normal"
      ? parseAmount(selectedSource.selected_price) ?? normal.value
      : stage.stage === "지원확정"
        ? finalDiscount
        : plannedDiscount;
  const selectedLabel =
    effectiveType === "normal"
      ? "일반견적가"
      : stage.stage === "지원확정"
        ? "지원금 할인 적용가"
        : "지원금 할인 예상가";

  const rows =
    stage.stage === "지원확정"
      ? [
          { label: "일반견적가", value: normal.value },
          { label: "확정 지원금", value: confirmedTotal.value },
          { label: "고객 확정 지원금", value: confirmedCustomer },
          { label: "기사 확정 지원금", value: confirmedDriver },
          { label: "연장회차", value: extensionCount },
          { label: "확정 연장 지원금", value: confirmedExtension },
          { label: "지원금 할인 적용가", value: finalDiscount },
        ]
      : [
          { label: "일반견적가", value: normal.value },
          { label: "예상 지원금", value: plannedTotal.value },
          { label: "고객 예상 지원금", value: plannedCustomer.value },
          { label: "기사 예상 지원금", value: plannedDriver },
          { label: "연장회차", value: extensionCount },
          { label: "예상 연장 지원금", value: plannedExtension },
          { label: "지원금 할인 예상가", value: plannedDiscount },
        ];

  return {
    support_stage: stage.stage,
    selected_quote_type: selectedQuoteType,
    normal_price: normal.value,
    planned_total_support: plannedTotal.value,
    confirmed_total_support: confirmedTotal.value,
    planned_customer_support: plannedCustomer.value,
    confirmed_customer_support: confirmedCustomer,
    planned_driver_support: plannedDriver,
    confirmed_driver_support: confirmedDriver,
    extension_count: extensionCount,
    planned_extension_support: positiveOrZero(plannedExtension),
    confirmed_extension_support: positiveOrZero(confirmedExtension),
    planned_discount_price: plannedDiscount,
    final_discount_price: finalDiscount,
    selected_price_label: selectedLabel,
    selected_price: selectedPrice,
    show_normal_price: effectiveType !== "normal",
    support_settlement_type: settlement,
    support_settlement_label: SETTLEMENT_TYPE_LABELS[settlement],
    display_rows: rows,
    debug: {
      selected_price_type: safeText(selectedSource.selected_price_type) || null,
      selected_price_label: safeText(selectedSource.selected_price_label) || null,
      selected_price: parseAmount(selectedSource.selected_price),
      client_price_selection_kind:
        safeText(selectedSource.client_price_selection_kind) || null,
      support_stage_source: stage.source,
      normal_price_source: normal.source,
      planned_total_support_source: plannedTotal.source,
      confirmed_total_support_source: confirmedTotal.source,
      customer_support_source: customerSupportSource,
      discount_price_source:
        stage.stage === "지원확정"
          ? finalDiscountStored.source ??
            (finalDiscount != null ? "formula:normal-customer-extension" : null)
          : plannedDiscountRaw.source ??
            (plannedDiscount != null ? "formula:normal-customer-extension" : null),
      support_breakdown_raw: breakdown,
    },
  };
}
