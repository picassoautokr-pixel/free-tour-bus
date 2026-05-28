"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  LABEL,
  SETTLEMENT_OPTIONS,
  type PartnerDashboardTab,
} from "@/lib/partner-dashboard-labels";
import {
  fmt,
  partnerSupportSummaryForCard,
  quoteSupportDisplayModelForCall,
  quoteFormPlannedAmounts,
  settlementLabel,
  sponsorStageLabel,
  applicationSupportTotals,
  type PartnerCallLike,
} from "@/lib/partner-call-view-model";
import {
  formatListWon,
  partnerCallHidesSupportDetail,
  partnerListDiscountAmount,
  partnerListDiscountLabel,
  partnerMatchedListQuote,
  partnerSupportStageShort,
} from "@/lib/partner-call-list-display";
import { formatStopovers } from "@/lib/stopovers";
import type { PartnerQuoteFormState } from "@/components/partner/PartnerCallCard";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-[11px] font-bold text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

function parsePriceInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function formatWon(value: number | null | undefined): string {
  return formatListWon(value);
}

export function PartnerCallExpandPanel({
  call,
  stage,
  mode,
  quoteForm,
  setQuoteForm,
  onSubmitQuote,
  onCloseQuoteForm,
  quoteBusy,
  isEditMode,
  quoteClosed,
  referralForm,
  setReferralForm,
  onSubmitReferral,
  onCloseReferral,
  referralBusy,
  referralPreview,
  customerInfoVisible,
  customerContractNumber,
  customerName,
  customerPhone,
}: {
  call: PartnerCallLike & {
    target_normal_price: number | null;
    target_member_price: number | null;
    request_message?: string;
    extension_round: number;
    sponsors?: Array<{
      id: string;
      company_name: string;
      status: string;
      support_kind?: string | null;
      support_type?: string | null;
      support_condition?: string | null;
    }>;
  };
  stage: PartnerDashboardTab;
  mode: "quote" | "detail" | "referral";
  quoteForm: PartnerQuoteFormState;
  setQuoteForm: Dispatch<SetStateAction<PartnerQuoteFormState>>;
  onSubmitQuote: () => void;
  onCloseQuoteForm: () => void;
  quoteBusy: boolean;
  isEditMode?: boolean;
  quoteClosed: boolean;
  referralForm: { phones: string };
  setReferralForm: Dispatch<SetStateAction<{ phones: string }>>;
  onSubmitReferral: () => void;
  onCloseReferral: () => void;
  referralBusy: boolean;
  referralPreview: string;
  customerInfoVisible?: boolean;
  customerContractNumber?: string;
  customerName?: string;
  customerPhone?: string;
}) {
  const supportSummary = partnerSupportSummaryForCard(call);
  const supportModel = quoteSupportDisplayModelForCall(call);
  const breakdown = supportSummary.breakdown;
  const sponsorConfirmed = supportSummary.showConfirmed;
  const hideSupport = partnerCallHidesSupportDetail(call, stage);
  const supportStage = partnerSupportStageShort(call.sponsor_support_status);

  const quotePriceValue = parsePriceInput(quoteForm.price);
  const customerPlannedInput = parsePriceInput(quoteForm.supportDiscountAmount);

  // 지원확정 총지원금: my_quote 유무와 관계없이 call 레벨 데이터에서 직접 읽음
  const appTotals = applicationSupportTotals(call);
  const confirmedTotal =
    supportModel?.confirmed_total_support ??
    appTotals.totalConfirmed ??
    null;

  // 지원확정 상태에서는 확정 총지원금 기준, 그 외에는 예상 총지원금 기준
  const totalPlannedForForm = (() => {
    if (sponsorConfirmed && confirmedTotal != null && confirmedTotal > 0) {
      return confirmedTotal;
    }
    return supportSummary.totalPlannedForForm > 0
      ? supportSummary.totalPlannedForForm
      : customerPlannedInput ?? 0;
  })();

  const formPlannedPreview = quoteFormPlannedAmounts({
    normalPrice: quotePriceValue,
    customerPlanned: customerPlannedInput,
    totalPlanned: totalPlannedForForm > 0 ? totalPlannedForForm : null,
    extensionRound: call.extension_round,
  });

  // 지원확정 상태에서 폼 입력값으로 확정 수치를 동적 계산 (DB 저장 전 미리보기)
  const formConfirmedPreview = (() => {
    if (!sponsorConfirmed || confirmedTotal == null || customerPlannedInput == null) {
      return null;
    }
    const driverBase = Math.max(confirmedTotal - customerPlannedInput, 0);
    const extensionRound = call.extension_round;
    const extension =
      extensionRound > 0 && driverBase > 0
        ? Math.min(Math.round(driverBase * extensionRound * 0.2), driverBase)
        : 0;
    const driver = Math.max(driverBase - extension, 0);
    const discountPrice =
      quotePriceValue != null
        ? Math.max(quotePriceValue - customerPlannedInput - extension, 0)
        : null;
    return { driver, extension, discountPrice };
  })();

  const supportInputLimit =
    quotePriceValue == null
      ? totalPlannedForForm
      : Math.min(totalPlannedForForm, quotePriceValue);
  const supportDiscountInvalid =
    customerPlannedInput != null && customerPlannedInput > supportInputLimit;

  if (mode === "referral") {
    return (
      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
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
          >
            {referralBusy ? LABEL.sending : LABEL.sendSms}
          </button>
          <button
            type="button"
            onClick={onCloseReferral}
            className="min-h-11 rounded-xl border bg-white px-4 text-sm font-black"
          >
            {LABEL.cancel}
          </button>
        </div>
      </div>
    );
  }

  const discountLabel = partnerListDiscountLabel(sponsorConfirmed);
  const discountAmount =
    supportModel?.support_stage === "지원확정"
      ? supportModel.final_discount_price
      : supportModel?.planned_discount_price ??
        partnerListDiscountAmount(breakdown, sponsorConfirmed);
  const matchedQuote = partnerMatchedListQuote(call, breakdown);

  return (
    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
      <dl className="divide-y divide-slate-100">
        {(call.request_message ?? "").trim() !== "" ? (
          <Field label={LABEL.customerMemo}>
            <span className="whitespace-pre-wrap">{call.request_message}</span>
          </Field>
        ) : null}

        {mode === "quote" ? (
          <>
            <Field label={LABEL.preferredTargetPrice}>
              <span>
                {LABEL.priorityNormal} {formatWon(call.target_normal_price)}
                <span className="mx-1 text-slate-300">{LABEL.separator}</span>
                {LABEL.priorityDiscount} {formatWon(call.target_member_price)}
              </span>
            </Field>
            <Field label={LABEL.preferredQuoteTypes}>
              {LABEL.preferredNormalQuote}, {LABEL.preferredDiscountQuote}
            </Field>
            {!hideSupport ? (
              <>
                <Field label={LABEL.sponsor}>
                  {(call.sponsors ?? []).length > 0 ? (
                    <ul className="space-y-1 text-right">
                      {call.sponsors!.map((s) => (
                        <li key={s.id}>
                          {s.company_name}{" "}
                          <span className="text-xs text-slate-500">
                            ({sponsorStageLabel(s.status)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    LABEL.noSponsorInfo
                  )}
                </Field>
                <Field label={LABEL.supportStage}>{supportStage}</Field>
                <Field
                  label={
                    sponsorConfirmed ? LABEL.totalConfirmedSupport : LABEL.totalPlannedSupport
                  }
                >
                  {supportSummary.summaryFormatted}
                </Field>
              </>
            ) : null}
          </>
        ) : null}

        {mode === "quote" ? (
          <div className="py-3">
            <p className="text-xs font-black text-blue-950">
              {isEditMode ? LABEL.editQuote : LABEL.submitQuote}
            </p>
            <div className="mt-3 grid gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500">{LABEL.normalPrice}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={quoteForm.price}
                  onChange={(e) => setQuoteForm((p) => ({ ...p, price: e.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                />
              </label>
              {!hideSupport ? (
                <>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-500">
                      {sponsorConfirmed
                        ? LABEL.customerConfirmedSupportInput
                        : LABEL.customerExpectedSupport}
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
                  <Field label={LABEL.extensionRound}>{call.extension_round}</Field>
                  <Field
                    label={
                      sponsorConfirmed
                        ? LABEL.partnerConfirmedSupportDisplay
                        : LABEL.partnerExpectedSupport
                    }
                  >
                    {sponsorConfirmed
                      ? formatWon(
                          supportModel?.confirmed_driver_support ??
                            formConfirmedPreview?.driver ??
                            null,
                        )
                      : formatWon(formPlannedPreview.partnerPlannedSupport)}
                  </Field>
                  <Field
                    label={
                      sponsorConfirmed
                        ? LABEL.confirmedExtensionSupport
                        : LABEL.plannedExtensionSupport
                    }
                  >
                    {sponsorConfirmed
                      ? formatWon(
                          supportModel?.confirmed_extension_support != null
                            ? supportModel.confirmed_extension_support
                            : (formConfirmedPreview?.extension ?? null),
                        )
                      : formatWon(formPlannedPreview.extensionSupport)}
                  </Field>
                  <Field label={discountLabel}>
                    {formatWon(
                      sponsorConfirmed
                        ? (supportModel?.final_discount_price ??
                            formConfirmedPreview?.discountPrice ??
                            formPlannedPreview.supportDiscountPlannedPrice)
                        : formPlannedPreview.supportDiscountPlannedPrice,
                    )}
                  </Field>
                  {!sponsorConfirmed ? (
                    <div>
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
                  ) : null}
                </>
              ) : null}
              <label className="block">
                <span className="text-xs font-bold text-slate-500">{LABEL.vehicleType}</span>
                <input
                  type="text"
                  value={quoteForm.vehicleType}
                  onChange={(e) => setQuoteForm((p) => ({ ...p, vehicleType: e.target.value }))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                />
              </label>
              <label className="block">
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
              <label className="block">
                <span className="text-xs font-bold text-slate-500">{LABEL.memo}</span>
                <textarea
                  value={quoteForm.message}
                  onChange={(e) => setQuoteForm((p) => ({ ...p, message: e.target.value }))}
                  className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onSubmitQuote}
                disabled={
                  quoteBusy ||
                  quoteClosed ||
                  quoteForm.price.trim() === "" ||
                  quoteForm.vehicleType.trim() === "" ||
                  quoteForm.availableTime.trim() === "" ||
                  supportDiscountInvalid
                }
                className="min-h-11 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
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
              >
                {LABEL.cancel}
              </button>
            </div>
          </div>
        ) : null}

        {mode === "detail" && !hideSupport ? (
          <>
            <Field label={LABEL.sponsor}>
              {(call.sponsors ?? []).length > 0 ? (
                <ul className="space-y-1 text-right">
                  {call.sponsors!.map((s) => (
                    <li key={s.id}>
                      {s.company_name}{" "}
                      <span className="text-xs text-slate-500">
                        ({sponsorStageLabel(s.status)})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                LABEL.noSponsorInfo
              )}
            </Field>
            <Field label={LABEL.supportStage}>{supportStage}</Field>
            <Field
              label={
                sponsorConfirmed ? LABEL.totalConfirmedSupport : LABEL.totalPlannedSupport
              }
            >
              {supportSummary.summaryFormatted}
            </Field>
            {breakdown && breakdown.calculationStatus === "ok" ? (
              <>
                <Field label={LABEL.extensionRound}>{call.extension_round}</Field>
                <Field label={LABEL.settlementMode}>
                  {settlementLabel(breakdown.settlementType)}
                </Field>
                <Field
                  label={
                    sponsorConfirmed
                      ? LABEL.customerConfirmedSupport
                      : LABEL.customerExpectedSupport
                  }
                >
                  {fmt(
                    sponsorConfirmed
                      ? breakdown.customerConfirmedSupport
                      : breakdown.customerPlannedSupport,
                    sponsorConfirmed ? "confirmed" : "planned",
                    breakdown,
                  )}
                </Field>
                <Field
                  label={
                    sponsorConfirmed
                      ? LABEL.partnerConfirmedSupportDisplay
                      : LABEL.partnerExpectedSupport
                  }
                >
                  {fmt(
                    sponsorConfirmed
                      ? breakdown.partnerConfirmedSupport
                      : breakdown.partnerPlannedSupport,
                    sponsorConfirmed ? "confirmed" : "planned",
                    breakdown,
                  )}
                </Field>
                {(breakdown.extensionSupport ?? 0) > 0 ? (
                  <Field label={LABEL.extensionSupport}>
                    {fmt(
                      breakdown.extensionSupport,
                      breakdown.isConfirmed ? "final" : "planned",
                      breakdown,
                    )}
                  </Field>
                ) : null}
                <Field label={discountLabel}>{formatWon(discountAmount)}</Field>
              </>
            ) : null}
          </>
        ) : null}

        {mode === "detail" && stage === "matched" ? (
          <Field label={LABEL.selectedQuote}>
            {matchedQuote.label} {formatWon(matchedQuote.amount)}
          </Field>
        ) : null}

        {mode === "detail" && stage === "matched" && customerInfoVisible ? (
          <>
            <p className="pt-3 text-xs font-black text-slate-700">{LABEL.customerInfo}</p>
            <Field label={LABEL.contractNumber}>
              {customerContractNumber?.trim() || LABEL.dash}
            </Field>
            <Field label={LABEL.customerName}>{customerName?.trim() || LABEL.dash}</Field>
            <Field label={LABEL.customerPhone}>
              {customerPhone?.trim() ? (
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {customerPhone}
                  <a
                    href={`tel:${customerPhone}`}
                    className="inline-flex min-h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-black text-white"
                  >
                    {LABEL.callCustomer}
                  </a>
                  <a
                    href={`sms:${customerPhone}`}
                    className="inline-flex min-h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-900"
                  >
                    {LABEL.smsCustomer}
                  </a>
                </span>
              ) : (
                LABEL.dash
              )}
            </Field>
          </>
        ) : null}
      </dl>
    </div>
  );
}
