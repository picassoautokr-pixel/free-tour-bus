"use client";

import {
  CLIENT_UI,
  formatWon,
  quoteSupportBadgeLabel,
} from "@/app/client/dashboard/client-display";
import {
  formatQuotePriceForScreen,
  quoteSubmitPriceLines,
} from "@/app/client/dashboard/page-quote-screen";
import { LABEL } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import {
  isNormalPriceSelection,
  isSupportPriceSelection,
  resolveFinalPaymentPrice,
  resolveSelectedPriceLabel,
  resolveSelectedPriceType,
} from "@/lib/selected-price-display";

/** 매칭완료 탭 — 매칭 세부내역 본문 */
export function ClientMatchedPricePanel({
  application,
  selectedQuote,
}: {
  application: ClientApplication;
  selectedQuote: ClientQuote;
}) {
  const lines = quoteSubmitPriceLines(selectedQuote, application);
  const hideSupport = isNormalPriceSelection(application);
  const selectedType = resolveSelectedPriceType(application);
  const matchedKindLabel = resolveSelectedPriceLabel(application);

  const finalPay = resolveFinalPaymentPrice(application, {
    normalPrice: lines.normalPrice,
    supportPlannedPrice: lines.supportConfirmed ? null : lines.supportPrice,
    supportAppliedPrice: lines.supportConfirmed ? lines.supportPrice : null,
  });

  const supportLineLabel =
    selectedType === "support_planned"
      ? CLIENT_UI.supportDiscountPlanned
      : selectedType === "support_confirmed"
        ? CLIENT_UI.supportDiscountApplied
        : lines.supportLabel;

  const supportBadge = !hideSupport ? quoteSupportBadgeLabel(selectedQuote, application) : null;

  return (
    <div className="mt-2 space-y-2 text-xs font-bold text-emerald-900">
      <p className="text-sm font-black text-emerald-950">
        {LABEL.matchedPriceKind}: {matchedKindLabel || LABEL.unconfirmed}
      </p>
      <p className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
        {LABEL.finalPaymentPrice}: {formatWon(finalPay)}
      </p>
      {!hideSupport && isSupportPriceSelection(application) ? (
        <div className="space-y-1.5">
          <p>
            {CLIENT_UI.normalPrice}: {formatQuotePriceForScreen(lines.normalPrice)}
          </p>
          <p className={selectedType === "support_confirmed" ? "text-emerald-800" : "text-blue-800"}>
            {supportLineLabel}: {formatQuotePriceForScreen(lines.supportPrice)}
          </p>
          {supportBadge ? (
            <p className="text-[10px] font-bold text-slate-600">{supportBadge}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
