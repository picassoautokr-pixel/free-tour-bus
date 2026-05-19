"use client";

import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import { LABEL, SUPPORT_UI } from "@/lib/partner-dashboard-labels";
import { fmt, settlementLabel } from "@/lib/partner-call-view-model";

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof SUPPORT_UI;
}) {
  return (
    <div className={`rounded-xl p-3 ring-1 ${SUPPORT_UI[tone]}`}>
      <p className="text-[11px] font-bold opacity-80">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

export function PartnerSupportSummary({
  breakdown,
  showSettlement = true,
}: {
  breakdown: QuoteSupportBreakdown;
  showSettlement?: boolean;
}) {
  if (breakdown.calculationStatus === "failed") {
    return (
      <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-800 ring-1 ring-red-100">
        {breakdown.calculationError ?? "계산 실패"}
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Tile
        label={LABEL.normalPrice}
        value={fmt(breakdown.normalPrice, "planned", breakdown)}
        tone="unconfirmed"
      />
      <Tile
        label={LABEL.supportDiscountPlannedPrice}
        value={fmt(breakdown.supportDiscountPlannedPrice, "planned", breakdown)}
        tone="planned"
      />
      <Tile
        label={LABEL.customerPlannedSupport}
        value={fmt(breakdown.customerPlannedSupport, "planned", breakdown)}
        tone="planned"
      />
      <Tile
        label={LABEL.extensionSupport}
        value={fmt(
          breakdown.extensionSupport,
          breakdown.isConfirmed ? "final" : "planned",
          breakdown,
        )}
        tone="extension"
      />
      {showSettlement ? (
        <div className={`rounded-xl p-3 ring-1 sm:col-span-2 ${SUPPORT_UI.unconfirmed}`}>
          <p className="text-[11px] font-bold opacity-80">{LABEL.settlementMode}</p>
          <p className="mt-1 text-sm font-black">{settlementLabel(breakdown.settlementType)}</p>
        </div>
      ) : null}
      {breakdown.isConfirmed ? (
        <>
          <Tile
            label={LABEL.supportDiscountAppliedPrice}
            value={fmt(breakdown.supportDiscountAppliedPrice, "confirmed", breakdown)}
            tone="confirmed"
          />
          <Tile
            label={LABEL.finalDiscountPrice}
            value={fmt(breakdown.finalDiscountAppliedPrice, "final", breakdown)}
            tone="extension"
          />
        </>
      ) : null}
    </div>
  );
}
