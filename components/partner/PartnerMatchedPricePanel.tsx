"use client";

import type { ReactNode } from "react";

import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import { PartnerSupportSummary } from "@/components/partner/PartnerSupportSummary";
import { LABEL, SUPPORT_UI } from "@/lib/partner-dashboard-labels";
import type { PartnerCallLike } from "@/lib/partner-call-view-model";
import { fmt } from "@/lib/partner-call-view-model";
import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import type { SelectedPriceDisplayOptions } from "@/lib/selected-price-display";
import {
  isNormalPriceSelection,
  isSupportPriceSelection,
  resolveClientMatchedQuoteLine,
} from "@/lib/selected-price-display";

function formatWon(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <dt className="text-[11px] font-bold text-slate-400">{label}</dt>
      <dd className="mt-1 font-black text-slate-900">{children}</dd>
    </div>
  );
}

export function PartnerMatchedPricePanel({
  call,
  breakdown,
  sponsorConfirmed,
}: {
  call: PartnerCallLike;
  breakdown: QuoteSupportBreakdown | null;
  sponsorConfirmed: boolean;
}) {
  const normalPrice = call.my_quote?.price ?? breakdown?.normalPrice ?? null;
  const plannedPrice = breakdown?.supportDiscountPlannedPrice ?? null;
  const appliedPrice =
    breakdown?.finalDiscountAppliedPrice ?? breakdown?.supportDiscountAppliedPrice ?? null;

  const priceOptions: SelectedPriceDisplayOptions = {
    normalPrice,
    supportPlannedPrice: plannedPrice,
    supportAppliedPrice: appliedPrice,
    supportConfirmed: sponsorConfirmed,
  };
  const { kindLabel, amount: matchedAmount } = resolveClientMatchedQuoteLine(call, priceOptions);
  const hideSupport = isNormalPriceSelection(call, priceOptions);

  return (
    <div className="mt-3 space-y-2">
      <DetailRow label={LABEL.selectedPriceKind}>
        {[kindLabel, formatWon(matchedAmount)].filter((s) => s !== LABEL.dash && s !== "").join(" ") ||
          LABEL.dash}
      </DetailRow>

      {!hideSupport && breakdown ? (
        <div className="space-y-2">
          <DetailRow label={LABEL.normalPrice}>{formatWon(normalPrice)}</DetailRow>
          <div className={`rounded-xl p-3 ring-1 ${SUPPORT_UI.planned}`}>
            <p className="text-[11px] font-bold">
              {sponsorConfirmed ? LABEL.totalConfirmedSupport : LABEL.totalPlannedSupport}
            </p>
            <p className="mt-1 text-sm font-black">
              {formatWon(
                sponsorConfirmed
                  ? breakdown.totalConfirmedSupport
                  : breakdown.totalPlannedSupport,
              )}
            </p>
          </div>
          <DetailRow label={LABEL.customerPlannedSupport}>
            {fmt(
              sponsorConfirmed
                ? breakdown.customerConfirmedSupport
                : breakdown.customerPlannedSupport,
              sponsorConfirmed ? "confirmed" : "planned",
              breakdown,
            )}
          </DetailRow>
          <DetailRow label={LABEL.partnerPlannedSupport}>
            {fmt(
              sponsorConfirmed
                ? breakdown.partnerConfirmedSupport
                : breakdown.partnerPlannedSupport,
              sponsorConfirmed ? "confirmed" : "planned",
              breakdown,
            )}
          </DetailRow>
          {breakdown.extensionSupport != null && breakdown.extensionSupport > 0 ? (
            <DetailRow label={LABEL.extensionSupport}>
              {formatWon(breakdown.extensionSupport)}
            </DetailRow>
          ) : null}
          <PartnerSupportSummary breakdown={breakdown} />
          <SupportQuoteBreakdown breakdown={breakdown} compact />
        </div>
      ) : null}
    </div>
  );
}

export function partnerCallShowsSponsorBlocks(
  call: PartnerCallLike,
  stage: string,
): boolean {
  if (stage === "matched" && isNormalPriceSelection(call)) return false;
  if (stage === "matched" && isSupportPriceSelection(call)) return false;
  return true;
}
