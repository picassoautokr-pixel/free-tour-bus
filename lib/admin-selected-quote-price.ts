/**
 * 어드민 — 매칭기사 선택 견적가 (application.selected_price_type 최우선, UTF-8)
 */

import type { AdminMemberQuoteCard } from "@/lib/admin-application-detail-build";
import { legacyKindToSelectedPriceType } from "@/lib/client-quote-match-selection";
import { breakdownField, breakdownRecord } from "@/lib/admin-quote-breakdown-helpers";
import { buildQuoteSupportDisplayModel } from "@/lib/quote-support-display-model";
import { safeText } from "@/lib/sponsor";

export type SelectedPriceType = "normal" | "support_planned" | "support_confirmed";

export type AdminSelectedQuoteResolution = {
  selected_price: number | null;
  selected_price_label: string;
  selected_price_type: SelectedPriceType | "";
  calculation_source: string;
};

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function rowByLabel(
  rows: AdminMemberQuoteCard["support_rows"] | undefined,
  ...labels: string[]
): number | null {
  if (!rows) return null;
  for (const label of labels) {
    const row = rows.find((r) => r.label === label || r.label.includes(label));
    if (row?.value != null) return row.value;
  }
  return null;
}

/** applications.selected_price_type · client_price_selection_kind · 라벨 */
export function resolveApplicationSelectedPriceType(
  application: Record<string, unknown>,
): SelectedPriceType | "" {
  const direct = safeText(application.selected_price_type).toLowerCase();
  if (direct === "normal" || direct === "support_planned" || direct === "support_confirmed") {
    return direct;
  }
  const fromLegacy = legacyKindToSelectedPriceType(
    safeText(application.client_price_selection_kind) || null,
  );
  if (fromLegacy) return fromLegacy;

  const label = safeText(application.selected_price_label);
  if (/할인 적용/.test(label)) return "support_confirmed";
  if (/할인 예상/.test(label)) return "support_planned";
  if (label.includes("일반견적")) return "normal";
  return "";
}

function storedSupportPrice(
  storedPrice: number | null,
  normalPrice: number | null,
): number | null {
  if (storedPrice == null) return null;
  if (normalPrice != null && storedPrice >= normalPrice) return null;
  return storedPrice;
}

function confirmedDiscountFromQuote(
  quote: Record<string, unknown> | null | undefined,
  normalPrice: number | null,
): number | null {
  if (!quote) return null;
  const breakdown = breakdownRecord(quote);
  const fromBreakdown =
    breakdownField(breakdown, "final_discount_price", "finalDiscountAppliedPrice") ??
    breakdownField(breakdown, "support_discount_applied_price", "supportDiscountAppliedPrice");
  if (fromBreakdown != null) return fromBreakdown;

  const direct =
    parseInteger(quote.final_discount_applied_price) ??
    parseInteger(quote.support_discount_applied_price) ??
    parseInteger(quote.confirmed_discount_price) ??
    parseInteger(quote.final_member_price);
  if (direct != null) return direct;

  const customer =
    breakdownField(breakdown, "confirmed_customer_support", "customerConfirmedSupport") ??
    parseInteger(quote.confirmed_customer_support);

  if (normalPrice != null && customer != null) {
    return Math.max(normalPrice - customer, 0);
  }
  return null;
}

function plannedDiscountFromQuote(
  quote: Record<string, unknown> | null | undefined,
  normalPrice: number | null,
): number | null {
  if (!quote) return null;
  const breakdown = breakdownRecord(quote);
  const fromBreakdown =
    breakdownField(breakdown, "planned_discount_price", "supportDiscountPlannedPrice") ??
    breakdownField(breakdown, "support_discount_planned_price", "supportDiscountPlannedPrice");
  if (fromBreakdown != null) return fromBreakdown;

  const direct =
    parseInteger(quote.planned_discount_price) ??
    parseInteger(quote.support_discount_planned_price) ??
    parseInteger(quote.member_price);
  if (direct != null) return direct;

  const customer =
    breakdownField(breakdown, "planned_customer_support", "customerPlannedSupport") ??
    parseInteger(quote.planned_customer_support);

  if (normalPrice != null && customer != null) {
    return Math.max(normalPrice - customer, 0);
  }
  return null;
}

function quoteRecordFromMemberCard(
  memberQuote: AdminMemberQuoteCard | null | undefined,
): Record<string, unknown> | null {
  if (!memberQuote) return null;
  return {
    price: memberQuote.price,
    support_breakdown: memberQuote.support_breakdown,
    final_discount_applied_price: rowByLabel(memberQuote.support_rows, "지원금 할인 적용가"),
    support_discount_applied_price: rowByLabel(memberQuote.support_rows, "지원금 할인 적용가"),
    planned_discount_price: rowByLabel(memberQuote.support_rows, "지원금 할인 예상가"),
    support_discount_planned_price: rowByLabel(memberQuote.support_rows, "지원금 할인 예상가"),
  };
}

export function resolveAdminSelectedQuoteDisplay(params: {
  application: Record<string, unknown>;
  memberQuote?: AdminMemberQuoteCard | null;
  quoteRow?: Record<string, unknown> | null;
  sponsorConfirmed?: boolean;
}): AdminSelectedQuoteResolution {
  const model = buildQuoteSupportDisplayModel({
    application: params.application,
    quote: {
      ...(params.quoteRow ?? quoteRecordFromMemberCard(params.memberQuote) ?? {}),
      sponsor_support_status: params.sponsorConfirmed ? "approved" : undefined,
    },
    support_breakdown:
      params.quoteRow?.support_breakdown ?? params.memberQuote?.support_breakdown,
    selected_price_type: params.application.selected_price_type,
    selected_price_label: params.application.selected_price_label,
    selected_price: params.application.selected_price,
  });
  if (model.selected_quote_type === "할인견적") {
    return {
      selected_price: model.selected_price,
      selected_price_label: model.selected_price_label,
      selected_price_type:
        model.support_stage === "지원확정" ? "support_confirmed" : "support_planned",
      calculation_source: model.debug.discount_price_source ?? "support_display_model",
    };
  }

  const application = params.application;
  const priceType = resolveApplicationSelectedPriceType(application);
  const storedLabel = safeText(application.selected_price_label);
  const storedPrice = parseInteger(application.selected_price);

  const normalPrice =
    parseInteger(params.quoteRow?.price) ??
    params.memberQuote?.price ??
    null;

  const quoteForCalc =
    params.quoteRow ??
    quoteRecordFromMemberCard(params.memberQuote) ??
    null;

  if (priceType === "normal") {
    return {
      selected_price_type: "normal",
      selected_price: storedPrice ?? normalPrice,
      selected_price_label: storedLabel || "일반견적가",
      calculation_source: storedPrice != null ? "application.selected_price" : "quote.price",
    };
  }

  if (priceType === "support_confirmed") {
    const fromQuote = confirmedDiscountFromQuote(quoteForCalc, normalPrice);
    const fromRows = rowByLabel(params.memberQuote?.support_rows, "지원금 할인 적용가");
    const fromStored = storedSupportPrice(storedPrice, normalPrice);
    const price = fromQuote ?? fromRows ?? fromStored;
    const source = fromQuote
      ? "support_breakdown.final_discount_price"
      : fromRows
        ? "support_rows.지원금 할인 적용가"
        : fromStored
          ? "application.selected_price"
          : "unresolved";

    return {
      selected_price_type: "support_confirmed",
      selected_price: price,
      selected_price_label: storedLabel || "지원금 할인 적용가",
      calculation_source: source,
    };
  }

  if (priceType === "support_planned") {
    const fromQuote = plannedDiscountFromQuote(quoteForCalc, normalPrice);
    const fromRows = rowByLabel(params.memberQuote?.support_rows, "지원금 할인 예상가");
    const fromStored = storedSupportPrice(storedPrice, normalPrice);
    const price = fromQuote ?? fromRows ?? fromStored;
    const source = fromQuote
      ? "support_breakdown.planned_discount_price"
      : fromRows
        ? "support_rows.지원금 할인 예상가"
        : fromStored
          ? "application.selected_price"
          : "unresolved";

    return {
      selected_price_type: "support_planned",
      selected_price: price,
      selected_price_label: storedLabel || "지원금 할인 예상가",
      calculation_source: source,
    };
  }

  const label = storedLabel;
  if (/할인 적용/.test(label)) {
    const resolved = resolveAdminSelectedQuoteDisplay({
      ...params,
      application: { ...application, selected_price_type: "support_confirmed" },
    });
    return { ...resolved, calculation_source: `label_fallback:${resolved.calculation_source}` };
  }
  if (/할인 예상/.test(label)) {
    const resolved = resolveAdminSelectedQuoteDisplay({
      ...params,
      application: { ...application, selected_price_type: "support_planned" },
    });
    return { ...resolved, calculation_source: `label_fallback:${resolved.calculation_source}` };
  }

  return {
    selected_price_type: priceType || "normal",
    selected_price: storedPrice ?? normalPrice,
    selected_price_label: storedLabel || "일반견적가",
    calculation_source: "default_normal",
  };
}
