"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import { PartnerCallExpandPanel } from "@/components/partner/PartnerCallExpandPanel";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import {
  LABEL,
  MATCHED_RUN_FILTERS,
  type PartnerDashboardTab,
} from "@/lib/partner-dashboard-labels";
import {
  formatQuoteDeadline,
  formatQuoteProgress,
  matchedRunStatus,
  partnerSupportSummaryForCard,
  type PartnerCallLike,
} from "@/lib/partner-call-view-model";
import {
  formatListWon,
  partnerListDiscountAmount,
  partnerListDiscountLabel,
  partnerMatchedListQuote,
  partnerSupportStageShort,
} from "@/lib/partner-call-list-display";
import { partnerQuoteDebugContext } from "@/lib/quote-debug-trace";
import { formatRouteWithStopovers, formatStopovers } from "@/lib/stopovers";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export type PartnerQuoteFormState = {
  price: string;
  supportDiscountAmount: string;
  supportSettlementType: "client_priority" | "ratio";
  vehicleType: string;
  availableTime: string;
  message: string;
};

export type PartnerReferralFormState = { phones: string };

type ReferralResult = {
  phone: string;
  status: "sent" | "skipped_duplicate" | "invalid_phone" | "send_failed";
};

function ListCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}

export function PartnerCallCard({
  call,
  stage,
  formOpen,
  detailOpen,
  referralOpen,
  quoteForm,
  setQuoteForm,
  onOpenQuoteForm,
  onCloseQuoteForm,
  onOpenDetail,
  onCloseDetail,
  onOpenReferral,
  onCloseReferral,
  onSubmitQuote,
  onSubmitReferral,
  quoteBusy,
  referralBusy,
  referralForm,
  setReferralForm,
  referralPreview,
  onOpenCustomerDetail,
  customerInfoVisible,
  isEditMode,
  highlighted,
  quoteClosed,
  customerContractNumber,
  customerName,
  customerPhone,
}: {
  call: PartnerCallLike & {
    quote_count: number;
    quote_limit_count: number | null;
    quote_deadline_at: string;
    target_normal_price: number | null;
    target_member_price: number | null;
    request_message?: string;
    departure_region?: string;
    receipt_number?: string;
    contract_number?: string;
    my_quote: (PartnerCallLike["my_quote"] & { id?: string; source?: "member" | "guest" }) | null;
  };
  stage: PartnerDashboardTab;
  formOpen: boolean;
  detailOpen: boolean;
  referralOpen: boolean;
  quoteForm: PartnerQuoteFormState;
  setQuoteForm: Dispatch<SetStateAction<PartnerQuoteFormState>>;
  onOpenQuoteForm: () => void;
  onCloseQuoteForm: () => void;
  onOpenDetail: () => void;
  onCloseDetail: () => void;
  onOpenReferral: () => void;
  onCloseReferral: () => void;
  onSubmitQuote: () => void;
  onSubmitReferral: () => void;
  quoteBusy: boolean;
  referralBusy: boolean;
  referralForm: PartnerReferralFormState;
  setReferralForm: Dispatch<SetStateAction<PartnerReferralFormState>>;
  referralPreview: string;
  onOpenCustomerDetail?: () => void;
  customerInfoVisible: boolean;
  isEditMode?: boolean;
  highlighted: boolean;
  quoteClosed: boolean;
  customerContractNumber?: string;
  customerName?: string;
  customerPhone?: string;
}) {
  const supportSummary = partnerSupportSummaryForCard(call);
  const breakdown = supportSummary.breakdown;
  const sponsorConfirmed = supportSummary.showConfirmed;
  const memberQuoted = call.my_quote?.source === "member";
  const runStatus = matchedRunStatus(call);
  const runLabel =
    MATCHED_RUN_FILTERS.find((f) => f.id === runStatus)?.label ??
    (runStatus === "in_progress" ? LABEL.inProgress : LABEL.completed);

  const supportStage = partnerSupportStageShort(call.sponsor_support_status);
  const stopoverText = formatStopovers(call.stopovers) || LABEL.dash;
  const departureDate = call.departure_date.trim() || LABEL.undated;
  const departureTime =
    call.departure_time.trim() === "" || call.departure_time === LABEL.dash
      ? LABEL.dash
      : call.departure_time.trim();
  const region = (call.departure_region ?? "").trim() || LABEL.dash;

  const quotedNormal = call.my_quote?.price ?? null;
  const discountLabel = partnerListDiscountLabel(sponsorConfirmed);
  const discountAmount = partnerListDiscountAmount(breakdown, sponsorConfirmed);
  const matchedQuote = partnerMatchedListQuote(call, breakdown);

  const expandMode = formOpen ? "quote" : detailOpen ? "detail" : referralOpen ? "referral" : null;

  return (
    <article
      id={`partner-call-${call.id}`}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 transition ${
        highlighted ? "border-blue-300 ring-blue-200" : "border-slate-200 ring-slate-100"
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-sm font-black leading-snug text-slate-900 sm:text-base">
            {formatRouteWithStopovers(call.departure, call.stopovers, call.destination)}
          </h2>
          {stage === "matched" ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                runStatus === "in_progress"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {runLabel}
            </span>
          ) : null}
          {highlighted ? (
            <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">
              NEW
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <ListCell label={LABEL.departureDate} value={departureDate} />
          <ListCell label={LABEL.departureTime} value={departureTime} />
          <ListCell label={LABEL.departureRegion} value={region} />
          <ListCell label={LABEL.departure} value={call.departure || LABEL.dash} />
          <ListCell label={LABEL.waypoint} value={stopoverText} />
          <ListCell label={LABEL.destination} value={call.destination || LABEL.dash} />
          <ListCell
            label={LABEL.passengerCount}
            value={
              call.passenger_count != null
                ? `${call.passenger_count}${LABEL.passengerUnit}`
                : LABEL.unconfirmed
            }
          />
          <ListCell label={LABEL.tripType} value={call.trip_type || LABEL.dash} />
          <ListCell label={LABEL.busGrade} value={call.bus_grade || LABEL.dash} />
          {stage !== "matched" ? (
            <>
              <ListCell
                label={LABEL.quoteDeadline}
                value={
                  call.quote_deadline_at
                    ? formatQuoteDeadline(call.quote_deadline_at)
                    : LABEL.unconfirmed
                }
              />
              <ListCell label={LABEL.quoteCountRemaining} value={formatQuoteProgress(call)} />
            </>
          ) : null}
          <ListCell label={LABEL.supportStage} value={supportStage} />
          {stage === "quoted" && memberQuoted ? (
            <>
              <ListCell label={LABEL.normalPrice} value={formatListWon(quotedNormal)} />
              <ListCell label={discountLabel} value={formatListWon(discountAmount)} />
            </>
          ) : null}
          {stage === "matched" ? (
            <ListCell
              label={LABEL.selectedQuote}
              value={`${matchedQuote.label} ${formatListWon(matchedQuote.amount)}`}
            />
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {stage === "new" && !memberQuoted ? (
            <button
              type="button"
              onClick={() => (formOpen ? onCloseQuoteForm() : onOpenQuoteForm())}
              disabled={quoteClosed && !formOpen}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:bg-slate-300"
              style={tapStyle}
            >
              {quoteClosed ? LABEL.quoteClosed : formOpen ? LABEL.collapse : LABEL.submitQuote}
            </button>
          ) : null}
          {stage === "quoted" && memberQuoted ? (
            <button
              type="button"
              onClick={() => (formOpen ? onCloseQuoteForm() : onOpenQuoteForm())}
              disabled={quoteClosed && !formOpen}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:bg-slate-300"
              style={tapStyle}
            >
              {formOpen ? LABEL.collapse : LABEL.editQuote}
            </button>
          ) : null}
          {stage === "matched" ? (
            <>
              <button
                type="button"
                onClick={() => (detailOpen ? onCloseDetail() : onOpenDetail())}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-900"
                style={tapStyle}
              >
                {detailOpen ? LABEL.collapse : LABEL.confirmQuote}
              </button>
              {onOpenCustomerDetail ? (
                <button
                  type="button"
                  onClick={onOpenCustomerDetail}
                  disabled={!customerInfoVisible}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:bg-slate-300"
                  style={tapStyle}
                >
                  {customerInfoVisible ? LABEL.customerInfo : LABEL.matchedAfterReveal}
                </button>
              ) : null}
            </>
          ) : null}
          {stage !== "matched" ? (
            <button
              type="button"
              onClick={() => (referralOpen ? onCloseReferral() : onOpenReferral())}
              disabled={quoteClosed && !referralOpen}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-900 disabled:opacity-45"
              style={tapStyle}
            >
              {referralOpen ? LABEL.collapse : LABEL.referColleague}
            </button>
          ) : null}
          <QuoteDebugButton context={partnerQuoteDebugContext(call)} />
        </div>
      </div>

      {expandMode ? (
        <PartnerCallExpandPanel
          call={call}
          stage={stage}
          mode={expandMode}
          quoteForm={quoteForm}
          setQuoteForm={setQuoteForm}
          onSubmitQuote={onSubmitQuote}
          onCloseQuoteForm={onCloseQuoteForm}
          quoteBusy={quoteBusy}
          isEditMode={isEditMode}
          quoteClosed={quoteClosed}
          referralForm={referralForm}
          setReferralForm={setReferralForm}
          onSubmitReferral={onSubmitReferral}
          onCloseReferral={onCloseReferral}
          referralBusy={referralBusy}
          referralPreview={referralPreview}
          customerInfoVisible={customerInfoVisible}
          customerContractNumber={customerContractNumber}
          customerName={customerName}
          customerPhone={customerPhone}
        />
      ) : null}
    </article>
  );
}
