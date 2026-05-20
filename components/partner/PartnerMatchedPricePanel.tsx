"use client";

import type { ReactNode } from "react";

import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import { PartnerSupportSummary } from "@/components/partner/PartnerSupportSummary";
import { LABEL, SUPPORT_UI } from "@/lib/partner-dashboard-labels";
import type { PartnerCallLike } from "@/lib/partner-call-view-model";
import { fmt } from "@/lib/partner-call-view-model";
import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import {
  isNormalPriceSelection,
  isSupportPriceSelection,
  resolveFinalPaymentPrice,
  resolveSelectedPriceLabel,
  resolveSelectedPriceType,
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
  const plannedPrice = breakdown?.supportDiscountPlannedPrice ?? call.my_quote?.member_price ?? null;
  const appliedPrice =
    breakdown?.finalDiscountAppliedPrice ?? breakdown?.supportDiscountAppliedPrice ?? null;

  const finalPay = resolveFinalPaymentPrice(call, {
    normalPrice,
    supportPlannedPrice: plannedPrice,
    supportAppliedPrice: appliedPrice,
  });
  const selectedType = resolveSelectedPriceType(call);
  const hideSupport = isNormalPriceSelection(call);

  return (
    <div className="mt-3 space-y-2">
      <DetailRow label={LABEL.selectedPriceKind}>
        {resolveSelectedPriceLabel(call) || LABEL.dash}
      </DetailRow>
      <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
        <p className="text-[11px] font-bold text-emerald-800">{LABEL.finalPaymentPrice}</p>
        <p className="mt-1 text-lg font-black text-emerald-950">{formatWon(finalPay)}</p>
      </div>

      {!hideSupport && breakdown ? (
        <div className="space-y-2">
          <DetailRow label={LABEL.normalPrice}>{formatWon(normalPrice)}</DetailRow>
          <DetailRow
            label={
              selectedType === "support_planned"
                ? LABEL.supportDiscountPlannedPrice
                : LABEL.supportDiscountAppliedPrice
            }
          >
            {formatWon(
              selectedType === "support_planned"
                ? (plannedPrice ?? finalPay)
                : (appliedPrice ?? finalPay),
            )}
          </DetailRow>
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
