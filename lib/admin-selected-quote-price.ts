/**
 * 어드민 — 매칭기사 선택 견적가 재계산 (UTF-8)
 *
 * application.selected_price가 일반견적가(500,000)로 잘못 저장된 경우
 * support_breakdown / support_rows 기준으로 지원금 할인가를 사용한다.
 */

import type { AdminMemberQuoteCard } from "@/lib/admin-application-detail-build";
import { breakdownField, breakdownRecord } from "@/lib/admin-quote-breakdown-helpers";
import { safeText } from "@/lib/sponsor";

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

function isSupportPriceSelection(application: Record<string, unknown>): boolean {
  const priceType = safeText(application.selected_price_type);
  const label = safeText(application.selected_price_label);
  return (
    priceType === "support_confirmed" ||
    priceType === "support_planned" ||
    /지원금|할인 적용|할인 예상/.test(label)
  );
}

function confirmedDiscountFromQuote(
  quote: Record<string, unknown>,
  normalPrice: number | null,
): number | null {
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
  const extension =
    breakdownField(breakdown, "confirmed_extension_support", "extensionSupport") ??
    parseInteger(quote.extension_support_amount) ??
    0;

  if (normalPrice != null && customer != null) {
    return Math.max(normalPrice - customer - Math.max(0, extension), 0);
  }
  return null;
}

function plannedDiscountFromQuote(
  quote: Record<string, unknown>,
  normalPrice: number | null,
): number | null {
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
  const extension =
    breakdownField(breakdown, "planned_extension_support", "extensionSupport") ??
    parseInteger(quote.extension_support_amount) ??
    0;

  if (normalPrice != null && customer != null) {
    return Math.max(normalPrice - customer - Math.max(0, extension), 0);
  }
  return null;
}

export function resolveAdminSelectedQuoteDisplay(params: {
  application: Record<string, unknown>;
  memberQuote?: AdminMemberQuoteCard | null;
  quoteRow?: Record<string, unknown> | null;
  sponsorConfirmed: boolean;
}): { selected_price: number | null; selected_price_label: string } {
  const application = params.application;
  const priceType = safeText(application.selected_price_type);
  const storedLabel = safeText(application.selected_price_label);
  const storedPrice = parseInteger(application.selected_price);

  const normalPrice =
    params.memberQuote?.price ??
    parseInteger(params.quoteRow?.price) ??
    storedPrice;

  if (!isSupportPriceSelection(application) && priceType !== "support_confirmed" && priceType !== "support_planned") {
    return {
      selected_price: normalPrice,
      selected_price_label: storedLabel || "일반견적가",
    };
  }

  const confirmed =
    params.sponsorConfirmed ||
    priceType === "support_confirmed" ||
    params.memberQuote?.sponsor_stage_badge === "지원확정";

  const quoteForCalc =
    params.quoteRow ??
    (params.memberQuote
      ? {
          price: params.memberQuote.price,
          support_breakdown: params.memberQuote.support_breakdown,
          final_discount_applied_price: rowByLabel(
            params.memberQuote.support_rows,
            "지원금 할인 적용가",
          ),
          support_discount_applied_price: rowByLabel(
            params.memberQuote.support_rows,
            "지원금 할인 적용가",
          ),
        }
      : null);

  if (confirmed) {
    const fromRows = rowByLabel(params.memberQuote?.support_rows, "지원금 할인 적용가");
    const fromQuote = quoteForCalc ? confirmedDiscountFromQuote(quoteForCalc, normalPrice) : null;
    const storedOk =
      storedPrice != null &&
      normalPrice != null &&
      storedPrice < normalPrice &&
      storedPrice !== normalPrice
        ? storedPrice
        : null;
    const price = fromRows ?? fromQuote ?? storedOk;

    return {
      selected_price: price ?? normalPrice,
      selected_price_label: storedLabel || "지원금 할인 적용가",
    };
  }

  const fromRows = rowByLabel(params.memberQuote?.support_rows, "지원금 할인 예상가");
  const fromQuote = quoteForCalc ? plannedDiscountFromQuote(quoteForCalc, normalPrice) : null;
  const storedOk =
    storedPrice != null &&
    normalPrice != null &&
    storedPrice < normalPrice &&
    storedPrice !== normalPrice
      ? storedPrice
      : null;
  const price = fromRows ?? fromQuote ?? storedOk;

  return {
    selected_price: price ?? normalPrice,
    selected_price_label: storedLabel || "지원금 할인 예상가",
  };
}
