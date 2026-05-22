"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import { SupportQuoteBreakdown } from "@/components/SupportQuoteBreakdown";
import {
  PartnerMatchedPricePanel,
  partnerCallShowsSponsorBlocks,
} from "@/components/partner/PartnerMatchedPricePanel";
import { PartnerSupportSummary } from "@/components/partner/PartnerSupportSummary";
import {
  LABEL,
  MATCHED_RUN_FILTERS,
  SETTLEMENT_OPTIONS,
  SUPPORT_UI,
  type PartnerDashboardTab,
} from "@/lib/partner-dashboard-labels";
import {
  fmt,
  partnerSupportSummaryForCard,
  formatQuoteDeadline,
  formatQuoteProgress,
  formatUntilDeparture,
  matchedRunStatus,
  quoteFormPlannedAmounts,
  sponsorStageLabel,
  type PartnerCallLike,
} from "@/lib/partner-call-view-model";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
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

function formatWon(value: number | null | undefined): string {
  if (value == null) return LABEL.unconfirmed;
  return `${value.toLocaleString("ko-KR")}${LABEL.wonSuffix}`;
}

function formatDeparture(call: PartnerCallLike): string {
  const date = call.departure_date.trim() || LABEL.undated;
  const time = call.departure_time.trim();
  if (time === "" || time === LABEL.dash) return date;
  return `${date} ${time}`;
}

function parsePriceInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <dt className="text-[11px] font-bold text-slate-400">{label}</dt>
      <dd className="mt-1 font-black text-slate-900">{children}</dd>
    </div>
  );
}

export function PartnerCallCard({
  call,
  stage,
  expanded,
  onToggleExpand,
  highlighted,
  quoteClosed,
  formOpen,
  referralOpen,
  quoteForm,
  setQuoteForm,
  onOpenQuoteForm,
  onCloseQuoteForm,
  onOpenReferral,
  onCloseReferral,
  onSubmitQuote,
  onSubmitReferral,
  quoteBusy,
  referralBusy,
  referralForm,
  setReferralForm,
  referralResults,
  referralPreview,
  onOpenQuoteDetail,
  onOpenCustomerDetail,
  customerInfoVisible,
  isEditMode,
}: {
  call: PartnerCallLike & {
    quote_count: number;
    quote_limit_count: number | null;
    quote_deadline_at: string;
    target_normal_price: number | null;
    target_member_price: number | null;
    my_quote: (PartnerCallLike["my_quote"] & { id?: string; source?: "member" | "guest" }) | null;
  };
  stage: PartnerDashboardTab;
  expanded: boolean;
  onToggleExpand: () => void;
  highlighted: boolean;
  quoteClosed: boolean;
  formOpen: boolean;
  referralOpen: boolean;
  quoteForm: PartnerQuoteFormState;
  setQuoteForm: Dispatch<SetStateAction<PartnerQuoteFormState>>;
  onOpenQuoteForm: () => void;
  onCloseQuoteForm: () => void;
  onOpenReferral: () => void;
  onCloseReferral: () => void;
  onSubmitQuote: () => void;
  onSubmitReferral: () => void;
  quoteBusy: boolean;
  referralBusy: boolean;
  referralForm: PartnerReferralFormState;
  setReferralForm: Dispatch<SetStateAction<PartnerReferralFormState>>;
  referralResults: ReferralResult[];
  referralPreview: string;
  onOpenQuoteDetail?: () => void;
  onOpenCustomerDetail?: () => void;
  customerInfoVisible: boolean;
  isEditMode?: boolean;
}) {
  const supportSummary = partnerSupportSummaryForCard(call);
  const breakdown = supportSummary.breakdown;
  const sponsorConfirmed = supportSummary.showConfirmed;
  const memberQuoted = call.my_quote?.source === "member";
  const runStatus = matchedRunStatus(call);
  const runLabel =
    MATCHED_RUN_FILTERS.find((f) => f.id === runStatus)?.label ??
    (runStatus === "in_progress" ? LABEL.inProgress : LABEL.completed);

  const quotePriceValue = parsePriceInput(quoteForm.price);
  const customerPlannedInput = parsePriceInput(quoteForm.supportDiscountAmount);
  const totalPlannedForForm =
    supportSummary.totalPlannedForForm > 0
      ? supportSummary.totalPlannedForForm
      : customerPlannedInput ?? 0;
  const formPlannedPreview = quoteFormPlannedAmounts({
    normalPrice: quotePriceValue,
    customerPlanned: customerPlannedInput,
    totalPlanned: totalPlannedForForm > 0 ? totalPlannedForForm : null,
    extensionRound: call.extension_round,
  });
  const extensionPreview = formPlannedPreview.extensionSupport;
  const plannedDiscountPreview = formPlannedPreview.supportDiscountPlannedPrice;
  const partnerPlannedPreview = formPlannedPreview.partnerPlannedSupport;
  const supportInputLimit =
    quotePriceValue == null
      ? totalPlannedForForm
      : Math.min(totalPlannedForForm, quotePriceValue);
  const supportDiscountInvalid =
    customerPlannedInput != null && customerPlannedInput > supportInputLimit;
  const showSponsorBlocks = partnerCallShowsSponsorBlocks(call, stage);

  return (
    <article
      id={`partner-call-${call.id}`}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 transition ${
        highlighted ? "border-blue-300 ring-blue-200" : "border-slate-200 ring-slate-100"
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full p-4 text-left"
        style={tapStyle}
        aria-expanded={expanded}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400">
              {formatDeparture(call)}
              {highlighted ? (
                <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">
                  NEW
                </span>
              ) : null}
            </p>
            <h2 className="mt-1 text-base font-black text-slate-900 sm:text-lg">
              {formatRouteWithStopovers(call.departure, call.stopovers, call.destination)}
            </h2>
            <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
              <span>
                {call.passenger_count != null
                  ? `${call.passenger_count}${LABEL.passengerUnit}`
                  : LABEL.unconfirmed}
              </span>
              <span>{LABEL.separator}</span>
              <span>{call.trip_type || LABEL.dash}</span>
              <span>{LABEL.separator}</span>
              <span>{call.bus_grade || LABEL.dash}</span>
              <span>{LABEL.separator}</span>
              <span className="text-blue-700">
                {call.quote_deadline_at
                  ? formatQuoteDeadline(call.quote_deadline_at)
                  : LABEL.unconfirmed}
              </span>
              <span>{LABEL.separator}</span>
              <span>{formatQuoteProgress(call)}</span>
            </p>
          </div>
          {stage === "matched" ? (
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                runStatus === "in_progress"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {runLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
          <QuoteDebugButton context={partnerQuoteDebugContext(call)} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {stage === "new" && !memberQuoted ? (
            <button
              type="button"
              onClick={onOpenQuoteForm}
              disabled={quoteClosed}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:bg-slate-300"
              style={tapStyle}
            >
              {quoteClosed ? LABEL.quoteClosed : LABEL.submitQuote}
            </button>
          ) : null}
          {stage === "quoted" && memberQuoted ? (
            <>
              <button
                type="button"
                onClick={onOpenQuoteForm}
                disabled={quoteClosed}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:bg-slate-300"
                style={tapStyle}
              >
                {LABEL.editQuote}
              </button>
              {onOpenQuoteDetail ? (
                <button
                  type="button"
                  onClick={onOpenQuoteDetail}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-900"
                  style={tapStyle}
                >
                  {LABEL.myQuote}
                </button>
              ) : null}
            </>
          ) : null}
          {stage === "matched" && onOpenCustomerDetail ? (
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
          {stage !== "matched" ? (
            <button
              type="button"
              onClick={onOpenReferral}
              disabled={quoteClosed}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-900 disabled:opacity-45"
              style={tapStyle}
            >
              {LABEL.referColleague}
            </button>
          ) : null}
          <span className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600">
            {expanded ? LABEL.collapse : LABEL.expand}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-2">
          <dl className="grid gap-2 sm:grid-cols-2">
            <DetailRow label={LABEL.passengerCount}>
              {call.passenger_count ?? LABEL.unconfirmed}
            </DetailRow>
            <DetailRow label={LABEL.tripType}>{call.trip_type || LABEL.dash}</DetailRow>
            <DetailRow label={LABEL.busGrade}>{call.bus_grade || LABEL.dash}</DetailRow>
            <DetailRow label={LABEL.departure}>{call.departure}</DetailRow>
            {formatStopovers(call.stopovers) ? (
              <DetailRow label={LABEL.waypoint}>{formatStopovers(call.stopovers)}</DetailRow>
            ) : null}
            <DetailRow label={LABEL.destination}>{call.destination}</DetailRow>
          </dl>

          {showSponsorBlocks ? (
            <>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-black text-slate-700">{LABEL.sponsor}</p>
                {(call.sponsors ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {call.sponsors!.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold"
                      >
                        <span>{s.company_name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                            s.status === "approved" ? SUPPORT_UI.confirmed : SUPPORT_UI.planned
                          }`}
                        >
                          {sponsorStageLabel(s.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">{LABEL.noSponsorInfo}</p>
                )}
                <p className="mt-2 text-xs font-bold text-slate-500">
                  {LABEL.sponsorStagePrefix}: {sponsorStageLabel(call.sponsor_support_status)}
                </p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className={`rounded-xl p-3 ring-1 ${SUPPORT_UI.planned}`}>
                  <p className="text-[11px] font-bold">
                    {sponsorConfirmed ? LABEL.totalConfirmedSupport : LABEL.totalPlannedSupport}
                  </p>
                  <p className="mt-1 text-sm font-black">{supportSummary.summaryFormatted}</p>
                </div>
                <DetailRow label={LABEL.quoteDeadline}>
                  {call.quote_deadline_at
                    ? formatQuoteDeadline(call.quote_deadline_at)
                    : LABEL.unconfirmed}
                </DetailRow>
                <DetailRow label={LABEL.quoteProgress}>{formatQuoteProgress(call)}</DetailRow>
                <DetailRow label={LABEL.priorityTarget}>
                  <span className="block text-xs font-semibold text-slate-600">
                    {LABEL.priorityNormal} {formatWon(call.target_normal_price)}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-blue-700">
                    {LABEL.priorityDiscount} {formatWon(call.target_member_price)}
                  </span>
                </DetailRow>
              </div>
            </>
          ) : null}

          {stage === "quoted" && breakdown ? (
            <div className="mt-4 space-y-3">
              <div className={`rounded-xl p-3 ring-1 ${SUPPORT_UI.planned}`}>
                <p className="text-[11px] font-bold">{LABEL.partnerPlannedSupport}</p>
                <p className="mt-1 font-black">
                  {fmt(breakdown.partnerPlannedSupport, "planned", breakdown)}
                </p>
              </div>
              <PartnerSupportSummary breakdown={breakdown} />
              <SupportQuoteBreakdown breakdown={breakdown} compact />
            </div>
          ) : null}

          {stage === "matched" ? (
            <>
              <PartnerMatchedPricePanel
                call={call}
                breakdown={breakdown}
                sponsorConfirmed={sponsorConfirmed}
              />
              <DetailRow label={LABEL.untilDeparture}>{formatUntilDeparture(call)}</DetailRow>
            </>
          ) : null}

          {formOpen ? (
            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
              <p className="text-sm font-black text-blue-950">
                {isEditMode ? LABEL.editQuote : LABEL.submitQuote}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-500">{LABEL.normalPrice}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={quoteForm.price}
                    onChange={(e) => setQuoteForm((p) => ({ ...p, price: e.target.value }))}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-500">
                    {LABEL.customerPlannedSupport}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={quoteForm.supportDiscountAmount}
                    onChange={(e) =>
                      setQuoteForm((p) => ({
                        ...p,
                        supportDiscountAmount: e.target.value.replace(/[^\d]/g, ""),
                      }))
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                  />
                  {supportDiscountInvalid ? (
                    <span className="mt-1 block text-xs font-black text-red-600">
                      {formatWon(supportInputLimit)} {LABEL.supportLimitHint}
                    </span>
                  ) : null}
                </label>
                <div className={`rounded-xl p-3 ring-1 sm:col-span-2 ${SUPPORT_UI.extension}`}>
                  <p className="text-xs font-bold">
                    {LABEL.extensionSupport} ({LABEL.extensionAuto})
                  </p>
                  <p className="mt-1 font-black">{formatWon(extensionPreview)}</p>
                </div>
                <div className={`rounded-xl p-3 ring-1 sm:col-span-2 ${SUPPORT_UI.planned}`}>
                  <p className="text-xs font-bold">{LABEL.supportDiscountPlannedPrice}</p>
                  <p className="mt-1 font-black">
                    {plannedDiscountPreview == null
                      ? LABEL.unconfirmed
                      : formatWon(plannedDiscountPreview)}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ring-1 sm:col-span-2 ${SUPPORT_UI.planned}`}>
                  <p className="text-xs font-bold">{LABEL.partnerPlannedSupport}</p>
                  <p className="mt-1 font-black">
                    {formPlannedPreview.totalPlannedSupport == null
                      ? LABEL.unconfirmed
                      : formatWon(partnerPlannedPreview)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold text-slate-500">{LABEL.settlementMode}</p>
                  <div className="mt-2 grid gap-2">
                    {SETTLEMENT_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex gap-3 rounded-xl border border-slate-100 bg-white p-3"
                      >
                        <input
                          type="radio"
                          name={`settlement-${call.id}`}
                          checked={quoteForm.supportSettlementType === opt.value}
                          onChange={() =>
                            setQuoteForm((p) => ({
                              ...p,
                              supportSettlementType: opt.value,
                            }))
                          }
                        />
                        <span>
                          <span className="block text-sm font-black">{opt.title}</span>
                          <span className="mt-1 block text-[11px] text-slate-500">
                            {opt.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs font-bold text-slate-500">{LABEL.vehicleType}</span>
                  <input
                    type="text"
                    value={quoteForm.vehicleType}
                    onChange={(e) =>
                      setQuoteForm((p) => ({ ...p, vehicleType: e.target.value }))
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-500">{LABEL.availableTime}</span>
                  <input
                    type="text"
                    value={quoteForm.availableTime}
                    onChange={(e) =>
                      setQuoteForm((p) => ({ ...p, availableTime: e.target.value }))
                    }
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-500">{LABEL.memo}</span>
                  <textarea
                    value={quoteForm.message}
                    onChange={(e) => setQuoteForm((p) => ({ ...p, message: e.target.value }))}
                    className="mt-1 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                  />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onSubmitQuote}
                  disabled={
                    quoteBusy ||
                    quoteForm.price.trim() === "" ||
                    quoteForm.vehicleType.trim() === "" ||
                    quoteForm.availableTime.trim() === "" ||
                    supportDiscountInvalid
                  }
                  className="min-h-11 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
                  style={tapStyle}
                >
                  {quoteBusy
                    ? LABEL.saving
                    : isEditMode
                      ? LABEL.saveEdit
                      : LABEL.submitQuote}
                </button>
                <button
                  type="button"
                  onClick={onCloseQuoteForm}
                  disabled={quoteBusy}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black"
                  style={tapStyle}
                >
                  {LABEL.cancel}
                </button>
              </div>
            </div>
          ) : null}

          {referralOpen ? (
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">{LABEL.colleaguePhones}</span>
                <textarea
                  value={referralForm.phones}
                  onChange={(e) => setReferralForm({ phones: e.target.value })}
                  className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                />
              </label>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl border bg-white p-3 text-xs text-slate-700">
                {referralPreview}
              </pre>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onSubmitReferral}
                  disabled={referralBusy || referralForm.phones.trim() === ""}
                  className="min-h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
                  style={tapStyle}
                >
                  {referralBusy ? LABEL.sending : LABEL.sendSms}
                </button>
                <button
                  type="button"
                  onClick={onCloseReferral}
                  className="min-h-11 rounded-xl border bg-white px-4 text-sm font-black"
                  style={tapStyle}
                >
                  {LABEL.cancel}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
