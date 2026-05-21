"use client";

import { CLIENT_UI, quoteSupportBadgeLabel } from "@/app/client/dashboard/client-display";
import { quoteSubmitPriceLines } from "@/app/client/dashboard/page-quote-screen";
import { LABEL } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import {
  isNormalPriceSelection,
  isSupportPriceSelection,
  resolveClientMatchedQuoteLine,
} from "@/lib/selected-price-display";

function formatMatchedAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

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

  const { kindLabel, amount } = resolveClientMatchedQuoteLine(application, {
    normalPrice: lines.normalPrice,
    supportPlannedPrice: lines.supportConfirmed ? null : lines.supportPrice,
    supportAppliedPrice: lines.supportConfirmed ? lines.supportPrice : null,
    supportConfirmed: lines.supportConfirmed,
  });

  const matchedQuoteText = [kindLabel, formatMatchedAmount(amount)].filter(Boolean).join(" ");
  const supportBadge = !hideSupport ? quoteSupportBadgeLabel(selectedQuote, application) : null;

  return (
    <div className="mt-2 space-y-2 text-xs font-bold text-emerald-900">
      <p className="text-sm font-black text-emerald-950">
        {LABEL.matchedPriceKind}: {matchedQuoteText || LABEL.unconfirmed}
      </p>
      {!hideSupport && isSupportPriceSelection(application) ? (
        <div className="space-y-1.5">
          {lines.normalPrice != null ? (
            <p>
              {CLIENT_UI.normalPrice}: {lines.normalPrice.toLocaleString("ko-KR")}
              {LABEL.wonSuffix}
            </p>
          ) : null}
          {supportBadge ? (
            <p className="text-[10px] font-bold text-slate-600">{supportBadge}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
