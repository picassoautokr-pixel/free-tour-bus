import type { PartnerCallLike } from "@/lib/partner-call-view-model";
import {
  quoteBreakdownForCall,
  quoteSupportDisplayModelForCall,
  sponsorStageConfirmed,
} from "@/lib/partner-call-view-model";
import { LABEL } from "@/lib/partner-dashboard-labels";
import {
  isNormalPriceSelection,
  resolveApplicationMatchedPriceDisplay,
  type MatchedPriceCompare,
  type SelectedPriceDisplayOptions,
} from "@/lib/selected-price-display";
import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import { isSponsorConfirmed, normalizeSponsorStage } from "@/lib/status-normalizer";

export function partnerSupportStageShort(status?: string): string {
  return isSponsorConfirmed(status) ? LABEL.sponsorStageConfirmed : LABEL.sponsorStageReview;
}

export function partnerPriceCompareFromCall(
  call: PartnerCallLike,
  breakdown: QuoteSupportBreakdown | null,
): MatchedPriceCompare {
  // display model 우선 사용 (buildQuoteSupportDisplayModel 기준)
  const model = quoteSupportDisplayModelForCall(call);
  if (model) {
    return {
      quoteNormalPrice: model.normal_price,
      quoteSupportPlannedPrice: model.planned_discount_price,
      quoteSupportAppliedPrice: model.final_discount_price,
    };
  }
  // fallback: breakdown raw 필드
  const normalPrice = call.my_quote?.price ?? breakdown?.normalPrice ?? null;
  return {
    quoteNormalPrice: normalPrice,
    quoteSupportPlannedPrice: breakdown?.supportDiscountPlannedPrice ?? null,
    quoteSupportAppliedPrice:
      breakdown?.finalDiscountAppliedPrice ??
      breakdown?.supportDiscountAppliedPrice ??
      null,
  };
}

export function partnerSelectedPriceOptions(
  call: PartnerCallLike,
  breakdown: QuoteSupportBreakdown | null,
): SelectedPriceDisplayOptions {
  const compare = partnerPriceCompareFromCall(call, breakdown);
  const model = quoteSupportDisplayModelForCall(call);
  return {
    normalPrice: compare.quoteNormalPrice,
    supportPlannedPrice: compare.quoteSupportPlannedPrice,
    supportAppliedPrice: compare.quoteSupportAppliedPrice,
    // display model support_stage를 우선 사용, fallback으로 breakdown.isConfirmed / app status
    supportConfirmed:
      (model != null && normalizeSponsorStage(model.support_stage) === "confirmed") ||
      breakdown?.isConfirmed === true ||
      sponsorStageConfirmed(call.sponsor_support_status),
  };
}

export function partnerCallHidesSupportDetail(
  call: PartnerCallLike,
  stage: string,
): boolean {
  if (stage !== "matched") return false;
  const breakdown = quoteBreakdownForCall(call);
  return isNormalPriceSelection(call, partnerSelectedPriceOptions(call, breakdown));
}

export function partnerListDiscountLabel(sponsorConfirmed: boolean): string {
  return sponsorConfirmed
    ? LABEL.supportDiscountAppliedPrice
    : LABEL.supportDiscountExpectedPrice;
}

export function partnerListDiscountAmount(
  breakdown: QuoteSupportBreakdown | null,
  sponsorConfirmed: boolean,
): number | null {
  if (!breakdown || breakdown.calculationStatus !== "ok") return null;
  if (sponsorConfirmed) {
    return (
      breakdown.finalDiscountAppliedPrice ??
      breakdown.supportDiscountAppliedPrice ??
      null
    );
  }
  return breakdown.supportDiscountPlannedPrice ?? null;
}

export function partnerMatchedListQuote(
  call: PartnerCallLike,
  breakdown: QuoteSupportBreakdown | null,
): { label: string; amount: number | null } {
  const model = quoteSupportDisplayModelForCall(call);
  if (model) {
    return {
      label: model.selected_price_label,
      amount: model.selected_price,
    };
  }
  const compare = partnerPriceCompareFromCall(call, breakdown);
  const quoteFallback = call.my_quote
    ? {
        price: call.my_quote.price,
        support_discount_planned_price: call.my_quote.planned_discount_price,
        support_discount_applied_price: null,
        support_breakdown: call.my_quote.support_breakdown ?? undefined,
      }
    : null;
  return resolveApplicationMatchedPriceDisplay(call, compare, quoteFallback);
}

export function formatListWon(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}
