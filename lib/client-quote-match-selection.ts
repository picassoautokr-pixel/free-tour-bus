/**
 * 클라이언트 견적 매칭 — 가격 종류별 선택 (UTF-8)
 */

import {
  QUOTE_SCREEN_LABEL,
  quoteSubmitPriceLines,
  quoteSupportIsConfirmed,
} from "@/app/client/dashboard/page-quote-screen";
import { LABEL } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";

export type SelectedPriceType = "normal" | "support_planned" | "support_confirmed";

export type QuoteMatchPriceSelection = {
  selected_price_type: SelectedPriceType;
  selected_price_label: string;
  selected_price: number;
};

const REVIEWING_SPONSOR_STATUSES = new Set([
  "pending",
  "reviewing",
  "preapproved",
  "collecting",
  "mixed",
  "none",
  "",
]);

type BreakdownRow = Record<string, unknown>;

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function breakdownAmount(
  breakdown: unknown,
  camelKey: string,
  snakeKey: string,
): number | null {
  if (!breakdown || typeof breakdown !== "object") return null;
  const row = breakdown as BreakdownRow;
  return parseAmount(row[camelKey]) ?? parseAmount(row[snakeKey]);
}

function resolveConfirmedTotalSupport(
  quote: ClientQuote,
  application?: ClientApplication,
): number | null {
  const breakdown = quote.support_breakdown;
  return (
    breakdownAmount(breakdown, "totalConfirmedSupport", "confirmed_total_support") ??
    parseAmount(quote.confirmed_total_support) ??
    parseAmount(quote.sponsor_approved_support_amount) ??
    parseAmount(quote.approved_support_amount) ??
    parseAmount(application?.sponsor_approved_support_amount)
  );
}

/** 후원사 지원확정 */
export function quoteSponsorSupportConfirmed(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source === "guest") return true;
  return quoteSupportIsConfirmed(quote, application);
}

/** 후원사 지원금 검토중 (제휴기사) */
export function quoteSponsorSupportReviewing(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  if (quote.source !== "member") return false;
  if (quoteSponsorSupportConfirmed(quote, application)) return false;

  const status = (
    quote.sponsor_support_status ??
    quote.support_status ??
    application?.sponsor_support_status ??
    ""
  )
    .trim()
    .toLowerCase();

  if (REVIEWING_SPONSOR_STATUSES.has(status)) return true;

  const confirmedTotal = resolveConfirmedTotalSupport(quote, application);
  return confirmedTotal == null || confirmedTotal <= 0;
}

export type ClientPriceSelectionKind =
  | "normal_selected"
  | "support_planned_selected"
  | "support_confirmed_selected"
  | "normal_price_selected"
  | "support_price_selected";

export function selectedPriceTypeToLegacyKind(type: SelectedPriceType): ClientPriceSelectionKind {
  if (type === "normal") return "normal_selected";
  if (type === "support_planned") return "support_planned_selected";
  return "support_confirmed_selected";
}

export function legacyKindToSelectedPriceType(
  kind?: string | null,
): SelectedPriceType | null {
  if (kind === "normal_selected" || kind === "normal_price_selected") return "normal";
  if (kind === "support_planned_selected") return "support_planned";
  if (kind === "support_confirmed_selected" || kind === "support_price_selected") {
    return "support_confirmed";
  }
  return null;
}

/** 견적서 제출현황 — 가격 종류별 매칭 버튼 */
export function quoteMatchButtonOptions(
  quote: ClientQuote,
  application?: ClientApplication,
): QuoteMatchPriceSelection[] {
  const lines = quoteSubmitPriceLines(quote, application);
  const normalPrice = lines.normalPrice;
  const options: QuoteMatchPriceSelection[] = [];

  if (normalPrice != null) {
    options.push({
      selected_price_type: "normal",
      selected_price_label: QUOTE_SCREEN_LABEL.normalPrice,
      selected_price: normalPrice,
    });
  }

  if (quote.source === "member" && quoteSponsorSupportReviewing(quote, application)) {
    if (lines.supportPrice != null) {
      options.push({
        selected_price_type: "support_planned",
        selected_price_label: QUOTE_SCREEN_LABEL.supportDiscountPlanned,
        selected_price: lines.supportPrice,
      });
    }
  } else if (quote.source === "member" && quoteSponsorSupportConfirmed(quote, application)) {
    if (lines.supportPrice != null) {
      options.push({
        selected_price_type: "support_confirmed",
        selected_price_label: QUOTE_SCREEN_LABEL.supportDiscountApplied,
        selected_price: lines.supportPrice,
      });
    }
  } else if (quote.source === "guest") {
    const applied = normalPrice ?? lines.supportPrice;
    if (applied != null) {
      options.push({
        selected_price_type: "support_confirmed",
        selected_price_label: QUOTE_SCREEN_LABEL.supportDiscountApplied,
        selected_price: applied,
      });
    }
  }

  return options;
}

export function quoteMatchButtonLabel(selection: QuoteMatchPriceSelection): string {
  if (selection.selected_price_type === "normal") return LABEL.matchWithNormal;
  if (selection.selected_price_type === "support_planned") return LABEL.matchWithSupportPlanned;
  return LABEL.matchWithSupportApplied;
}

export function quoteMatchButtonsWithLabels(
  quote: ClientQuote,
  application?: ClientApplication,
): Array<QuoteMatchPriceSelection & { buttonLabel: string }> {
  return quoteMatchButtonOptions(quote, application).map((opt) => ({
    ...opt,
    buttonLabel: quoteMatchButtonLabel(opt),
  }));
}

export function quoteCardShowsSupportPriceRow(
  quote: ClientQuote,
  application?: ClientApplication,
): boolean {
  return quoteMatchButtonOptions(quote, application).some(
    (o) => o.selected_price_type !== "normal",
  );
}
