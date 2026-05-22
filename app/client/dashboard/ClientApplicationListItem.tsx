"use client";

import { useState, type ReactNode } from "react";

import { ClientQuoteDetailModal } from "@/components/client/ClientQuoteDetailModal";
import {
  CLIENT_UI,
  applicationTypeLabel,
  contactRevealedFor,
  formatAutoCloseRemaining,
  formatAutoCloseRemainingCount,
  formatDepartureAt,
  formatQuoteCount,
  formatReturnDate,
  formatStopovers,
  formatWon,
  quoteSupportBadgeLabel,
  resolveGroupTypeDisplay,
  routeLabel,
  LABEL,
} from "@/app/client/dashboard/client-display";
import { ClientMatchedPricePanel } from "@/app/client/dashboard/ClientMatchedPricePanel";
import { QuoteMatchButtonGroup } from "@/app/client/dashboard/QuoteMatchButtonGroup";
import {
  quoteSubmitPriceLines,
  resolveQuoteNormalPrice,
  resolveQuoteSupportAppliedPrice,
  resolveQuoteSupportPlannedPrice,
} from "@/app/client/dashboard/page-quote-screen";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import { clientQuoteDebugContext } from "@/lib/quote-debug-trace";
import { isNormalPriceSelection } from "@/lib/selected-price-display";
import type { ClientMainTab } from "@/lib/client-dashboard-labels";
import type { ClientApplication, ClientQuote } from "@/lib/client-application-view-model";
import type { QuoteMatchPriceSelection } from "@/lib/client-quote-match-selection";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <dt className="text-[11px] font-bold text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-black text-slate-900">{children}</dd>
    </div>
  );
}

export function ClientApplicationListItem({
  application,
  tab,
  expanded,
  onToggleExpand,
  onMatch,
  busy,
  quoteSubmitPriceLines: resolveSubmitPriceLines = quoteSubmitPriceLines,
}: {
  application: ClientApplication;
  tab: ClientMainTab;
  expanded: boolean;
  onToggleExpand: () => void;
  onMatch: (quote: ClientQuote, selection: QuoteMatchPriceSelection) => void;
  busy?: boolean;
  quoteSubmitPriceLines?: (
    quote: ClientQuote,
    application: ClientApplication,
  ) => ReturnType<typeof quoteSubmitPriceLines>;
}) {
  const [quoteModal, setQuoteModal] = useState<ClientQuote | null>(null);
  const [memoQuoteId, setMemoQuoteId] = useState<string | null>(null);
  const quotes = application.quotes ?? [];
  const revealed = contactRevealedFor(application);
  const selectedQuote =
    quotes.find(
      (q) =>
        q.id === application.final_selected_quote_id &&
        q.source === (application.final_selected_quote_source === "guest" ? "guest" : "member"),
    ) ?? null;

  const targetSupportLabel =
    application.sponsor_support_status === "approved"
      ? LABEL.targetSupportApplied
      : LABEL.targetSupportPlanned;
  const matchedPriceOptions = selectedQuote
    ? {
        normalPrice: resolveQuoteNormalPrice(selectedQuote),
        supportPlannedPrice: resolveQuoteSupportPlannedPrice(selectedQuote),
        supportAppliedPrice: resolveQuoteSupportAppliedPrice(selectedQuote),
      }
    : undefined;
  const hideMatchedSupportTargets = isNormalPriceSelection(application, matchedPriceOptions);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full p-4 text-left"
        style={tapStyle}
        aria-expanded={expanded}
      >
        <p className="text-xs font-black text-slate-500">{application.receipt_number}</p>
        <p className="mt-1 text-sm font-black text-slate-950">{routeLabel(application)}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-bold text-slate-600 sm:grid-cols-4">
          <span>
            {LABEL.departure}: {application.departure || LABEL.dash}
          </span>
          <span>
            {LABEL.waypoint}: {formatStopovers(application.stopovers) || LABEL.dash}
          </span>
          <span>
            {LABEL.destination}: {application.destination || LABEL.dash}
          </span>
          <span>
            {LABEL.departureAt}: {formatDepartureAt(application)}
          </span>
          <span>
            {LABEL.passengers}: {application.passenger_count ?? LABEL.dash}
          </span>
          <span>
            {LABEL.quoteCount}: {formatQuoteCount(application)}
          </span>
        </div>
        <span className="mt-2 inline-block text-xs font-black text-blue-700">
          {expanded ? LABEL.collapse : LABEL.expand}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2">
          <dl className="grid gap-2 sm:grid-cols-2">
            <DetailRow label={LABEL.quoteType}>
              {applicationTypeLabel(application.application_type)}
            </DetailRow>
            <DetailRow label={LABEL.tripType}>{application.trip_type || LABEL.dash}</DetailRow>
            <DetailRow label={LABEL.busGrade}>{application.bus_grade || LABEL.dash}</DetailRow>
            <DetailRow label={LABEL.returnDate}>{formatReturnDate(application)}</DetailRow>
            {!(tab === "matched" && hideMatchedSupportTargets) ? (
              <>
                <DetailRow label={CLIENT_UI.remainingTime}>
                  {formatAutoCloseRemaining(application)}
                </DetailRow>
                <DetailRow label={CLIENT_UI.remainingCount}>
                  {formatAutoCloseRemainingCount(application)}
                </DetailRow>
              </>
            ) : null}
            {tab !== "matched" || !hideMatchedSupportTargets ? (
              <>
                <DetailRow label={LABEL.targetNormalPrice}>
                  {formatWon(application.target_normal_price)}
                </DetailRow>
                <DetailRow label={targetSupportLabel}>
                  {formatWon(application.target_member_price)}
                </DetailRow>
              </>
            ) : null}
            <DetailRow label={LABEL.groupName}>
              {application.applicant_name?.trim() ||
                application.organization_name?.trim() ||
                LABEL.dash}
            </DetailRow>
            <DetailRow label={CLIENT_UI.groupType}>{resolveGroupTypeDisplay(application)}</DetailRow>
          </dl>
          {application.request_message?.trim() ? (
            <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-100">
              <span className="font-black text-slate-500">{LABEL.requestMemo}: </span>
              {application.request_message}
            </p>
          ) : null}

          {tab === "matched" && selectedQuote ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-sm font-black text-emerald-950">{LABEL.matchedDetailTitle}</p>
              <ClientMatchedPricePanel application={application} selectedQuote={selectedQuote} />
              {revealed ? (
                <div className="mt-4 space-y-2 rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                  <p className="text-xs font-black text-emerald-700">
                    {selectedQuote.source === "member" ? LABEL.partnerDriver : LABEL.guestDriver}
                  </p>
                  <p className="font-black text-slate-950">
                    {LABEL.companyName}: {selectedQuote.company_name || LABEL.dash}
                  </p>
                  <p className="font-bold text-slate-800">
                    {LABEL.driverName}: {selectedQuote.driver_name || LABEL.dash}
                  </p>
                  {selectedQuote.phone ? (
                    <>
                      <p className="font-black text-emerald-900">
                        {LABEL.phone}: {selectedQuote.phone}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`tel:${selectedQuote.phone}`}
                          className="min-h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white"
                          style={tapStyle}
                        >
                          {LABEL.call}
                        </a>
                        <a
                          href={`sms:${selectedQuote.phone}`}
                          className="min-h-10 rounded-xl border border-emerald-200 bg-white px-4 text-xs font-black text-emerald-900"
                          style={tapStyle}
                        >
                          {LABEL.sms}
                        </a>
                      </div>
                    </>
                  ) : null}
                  <p className="text-xs text-slate-600">
                    {LABEL.availableTime}: {selectedQuote.available_time || LABEL.dash}
                  </p>
                  {(selectedQuote.memo ?? selectedQuote.message)?.trim() ? (
                    <p className="text-xs text-slate-600">
                      {LABEL.driverMemo}: {selectedQuote.memo ?? selectedQuote.message}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs font-bold text-slate-500">{LABEL.contactHidden}</p>
              )}
            </div>
          ) : (
            <>
              <p className="mt-4 text-xs font-black text-slate-600">{LABEL.quoteSubmitList}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-500">{LABEL.contactHidden}</p>
              <ul className="mt-2 space-y-2">
                {quotes.length === 0 ? (
                  <li className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-bold text-slate-500">
                    {LABEL.unconfirmed}
                  </li>
                ) : null}
                {quotes.map((quote) => {
                  const memo = quote.memo ?? quote.message ?? "";
                  const memoOpen = memoQuoteId === `${quote.source}-${quote.id}`;
                  const supportBadge = quoteSupportBadgeLabel(quote, application);
                  return (
                    <li
                      key={`${quote.source}-${quote.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setQuoteModal(quote)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setQuoteModal(quote);
                        }
                      }}
                      className="cursor-pointer rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                            quote.source === "member"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {quote.source === "member" ? CLIENT_UI.memberQuote : CLIENT_UI.guestQuote}
                        </span>
                        <QuoteDebugButton
                          context={clientQuoteDebugContext(application, quote)}
                        />
                        {supportBadge ? (
                          <span className="text-[10px] font-bold text-slate-500">{supportBadge}</span>
                        ) : null}
                      </div>
                      <span className="mt-2 block text-xs font-bold text-slate-700">
                        {LABEL.availableTime}: {quote.available_time || LABEL.dash}
                      </span>
                      {tab !== "matched" ? (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <QuoteMatchButtonGroup
                            quote={quote}
                            application={application}
                            busy={busy}
                            onMatch={onMatch}
                          />
                        </div>
                      ) : null}
                      <div
                        className="mt-2 flex flex-wrap gap-2"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {memo ? (
                          <button
                            type="button"
                            onClick={() =>
                              setMemoQuoteId(memoOpen ? null : `${quote.source}-${quote.id}`)
                            }
                            className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700"
                            style={tapStyle}
                          >
                            {LABEL.viewDriverMemo}
                          </button>
                        ) : null}
                      </div>
                      {memoOpen && memo ? (
                        <p className="mt-2 rounded-lg bg-white p-2 text-xs text-slate-700">{memo}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {quoteModal ? (
        <ClientQuoteDetailModal
          quote={quoteModal}
          application={application}
          tab={tab}
          onClose={() => setQuoteModal(null)}
          busy={busy}
          onMatch={(selection) => {
            const q = quoteModal;
            setQuoteModal(null);
            onMatch(q, selection);
          }}
        />
      ) : null}
    </article>
  );
}
