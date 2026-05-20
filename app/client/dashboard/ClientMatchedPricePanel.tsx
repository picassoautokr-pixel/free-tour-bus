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
} from "@/lib/selected-price-display";

export function ClientMatchedPricePanel({
  application,
  selectedQuote,
}: {
  application: ClientApplication;
  selectedQuote: ClientQuote;
}) {
  const lines = quoteSubmitPriceLines(selectedQuote, application);
  const hideSupport = isNormalPriceSelection(application);
  const finalPay = resolveFinalPaymentPrice(application, {
    normalPrice: lines.normalPrice,
    supportPlannedPrice: lines.supportConfirmed ? null : lines.supportPrice,
    supportAppliedPrice: lines.supportConfirmed ? lines.supportPrice : null,
  });
  const supportBadge = quoteSupportBadgeLabel(selectedQuote, application);

  return (
    <div className="mt-2 space-y-2 text-xs font-bold text-emerald-900">
      <p>
        {LABEL.selectedPriceKind}: {resolveSelectedPriceLabel(application)}
      </p>
      <p className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
        {LABEL.finalPaymentPrice}: {formatWon(finalPay)}
      </p>
      {!hideSupport ? (
        <>
          <p>
            {CLIENT_UI.normalPrice}: {formatQuotePriceForScreen(lines.normalPrice)}
          </p>
          <p className={lines.supportConfirmed ? "text-emerald-800" : "text-blue-800"}>
            {lines.supportLabel}: {formatQuotePriceForScreen(lines.supportPrice)}
          </p>
          {supportBadge ? (
            <p className="text-[10px] font-bold text-slate-500">{supportBadge}</p>
          ) : null}
        </>
      ) : null}
      {isSupportPriceSelection(application) && application.sponsor_support_status ? (
        <p className="text-[10px] text-slate-600">
          후원 상태: {application.sponsor_support_status}
        </p>
      ) : null}
    </div>
  );
}
