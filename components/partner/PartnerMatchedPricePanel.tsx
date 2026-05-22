"use client";

import type { PartnerCallLike } from "@/lib/partner-call-view-model";
import {
  isNormalPriceSelection,
  type SelectedPriceDisplayOptions,
} from "@/lib/selected-price-display";
import {
  partnerPriceCompareFromCall,
  partnerSelectedPriceOptions,
} from "@/lib/partner-call-list-display";
import { quoteBreakdownForCall } from "@/lib/partner-call-view-model";

/** 매칭 성공 + 일반견적 선택 시 후원·지원 상세 숨김 */
export function partnerCallShowsSponsorBlocks(
  call: PartnerCallLike,
  stage: string,
): boolean {
  if (stage !== "matched") return true;
  const breakdown = quoteBreakdownForCall(call);
  const options: SelectedPriceDisplayOptions = partnerSelectedPriceOptions(
    call,
    breakdown,
  );
  return !isNormalPriceSelection(call, options);
}
