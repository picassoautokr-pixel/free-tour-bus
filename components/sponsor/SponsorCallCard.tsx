"use client";

import type { ReactNode } from "react";

import { QuoteStatusSummary } from "@/components/QuoteStatusSummary";
import { SponsorCatalogSelect } from "@/components/sponsor/SponsorCatalogSelect";
import {
  CANCEL_REASONS,
  LABEL,
  SUPPORT_UI,
  type CardExpandMode,
} from "@/lib/sponsor-dashboard-labels";
import {
  displaySupportCondition,
  displaySupportForm,
  displaySupportKind,
  formatDepartureAt,
  formatQuoteCount,
  formatQuoteDeadline,
  formatWon,
  isMatchCompleted,
  matchStageLabel,
  payoutStatusLabel,
  type SponsorCallRow,
} from "@/lib/sponsor-call-view-model";
import { formatRouteWithStopovers, formatStopovers } from "@/lib/stopovers";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export type SponsorCardForm = {
  amount: string;
  staffId: string;
  memo: string;
  supportKind: string;
  supportForm: string;
  supportCondition: string;
  payoutStatus: string;
  cancelReason: string;
  cancelReasonCustom: string;
};

function CompactCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-900">{children}</p>
    </div>
  );
}

export function SponsorCallCard({
  call,
  listMode,
  detailExpanded,
  onToggleDetail,
  actionMode,
  onActionMode,
  form,
  onFormChange,
  catalog,
  onAddCatalogOption,
  staff,
  busy,
  onSubmitApprove,
  onSubmitReject,
  onSubmitChange,
  onSubmitRevert,
  onSubmitPayoutComplete,
}: {
  call: SponsorCallRow;
  listMode: "review" | "confirmed";
  detailExpanded: boolean;
  onToggleDetail: () => void;
  actionMode: CardExpandMode;
  onActionMode: (mode: CardExpandMode) => void;
  form: SponsorCardForm;
  onFormChange: (patch: Partial<SponsorCardForm>) => void;
  catalog: {
    supportKinds: string[];
    supportForms: string[];
    supportConditions: string[];
  };
  onAddCatalogOption: (
    field: "supportKinds" | "supportForms" | "supportConditions",
    value: string,
  ) => void;
  staff: Array<{ id: string; name?: string; phone?: string; is_active?: boolean }>;
  busy: boolean;
  onSubmitApprove: () => void;
  onSubmitReject: () => void;
  onSubmitChange: () => void;
  onSubmitRevert: () => void;
  onSubmitPayoutComplete: () => void;
}) {
  const matched = isMatchCompleted(call);
  const route = formatRouteWithStopovers(call.departure, call.stopovers, call.destination);
  const stopoverText = formatStopovers(call.stopovers);

  const openAction = (mode: CardExpandMode) => {
    if (actionMode === mode) {
      onActionMode(null);
      return;
    }
    onActionMode(mode);
    if (!detailExpanded) onToggleDetail();
  };

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      <button
        type="button"
        onClick={onToggleDetail}
        className="w-full px-3 py-3 text-left"
        style={tapStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-950">{route}</p>
            <p className="mt-1 text-[11px] font-semibold text-slate-500">
              {formatDepartureAt(call)} · {call.passenger_count ?? LABEL.dash}
              {LABEL.passengers}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ring-1 ${
              matched ? SUPPORT_UI.confirmed : SUPPORT_UI.muted
            }`}
          >
            {matchStageLabel(call)}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <CompactCell label={LABEL.departureRegion}>
            {call.departure_region || LABEL.dash}
          </CompactCell>
          <CompactCell label={LABEL.departure}>{call.departure || LABEL.dash}</CompactCell>
          <CompactCell label={LABEL.waypoint}>{stopoverText || LABEL.dash}</CompactCell>
          <CompactCell label={LABEL.destination}>
            {call.destination || LABEL.dash}
          </CompactCell>
          <CompactCell label={LABEL.tripType}>{call.trip_type || LABEL.dash}</CompactCell>
          <CompactCell label={LABEL.busGrade}>{call.bus_grade || LABEL.dash}</CompactCell>
          <CompactCell label={LABEL.groupType}>{call.group_type || LABEL.dash}</CompactCell>
          <CompactCell label={LABEL.quoteDeadline}>
            {formatQuoteDeadline(call.quote_deadline_at)}
          </CompactCell>
          <CompactCell label={LABEL.quoteProgress}>{formatQuoteCount(call)}</CompactCell>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {listMode === "review" ? (
            <span
              className={`rounded-xl px-2.5 py-1 text-xs font-black ring-1 ${SUPPORT_UI.planned}`}
            >
              {LABEL.totalPlannedSupport}: {formatWon(call.estimated_support_amount)}
            </span>
          ) : (
            <>
              <span
                className={`rounded-xl px-2.5 py-1 text-xs font-black ring-1 ${SUPPORT_UI.confirmed}`}
              >
                {LABEL.confirmedSupport}: {formatWon(call.approved_support_amount)}
              </span>
              <span className={`rounded-xl px-2.5 py-1 text-xs font-black ring-1 ${SUPPORT_UI.payout}`}>
                {LABEL.payoutStatus}: {payoutStatusLabel(call.payout_status)}
              </span>
              <span className="rounded-xl bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                {LABEL.supportKind}: {displaySupportKind(call)}
              </span>
            </>
          )}
        </div>
      </button>

      {detailExpanded ? (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          {listMode === "confirmed" ? (
            <div className="mb-2 flex flex-wrap gap-1 text-[10px] font-bold text-slate-500">
              <span>{LABEL.supportForm}: {displaySupportForm(call)}</span>
              <span>·</span>
              <span>{LABEL.supportCondition}: {displaySupportCondition(call)}</span>
            </div>
          ) : (
            <p
              className={`mb-2 inline-flex rounded-xl px-2 py-1 text-xs font-black ring-1 ${SUPPORT_UI.planned}`}
            >
              {LABEL.estimatedSupport}: {formatWon(call.estimated_support_amount)}
            </p>
          )}
          <QuoteStatusSummary quoteStatus={call.quote_status} compact />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-3">
        {listMode === "review" ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => openAction("approve")}
              className="min-h-10 flex-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-50"
              style={tapStyle}
            >
              {LABEL.confirmSupport}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => openAction("reject")}
              className="min-h-10 flex-1 rounded-xl border border-red-200 bg-white px-3 text-xs font-black text-red-700 disabled:opacity-50"
              style={tapStyle}
            >
              {LABEL.cancelSupport}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => openAction("change")}
              className="min-h-10 flex-1 rounded-xl bg-blue-600 px-3 text-xs font-black text-white disabled:opacity-50"
              style={tapStyle}
            >
              {LABEL.changeSupport}
            </button>
            <button
              type="button"
              disabled={busy || matched}
              onClick={() => openAction("reject")}
              className="min-h-10 flex-1 rounded-xl border border-red-200 bg-white px-3 text-xs font-black text-red-700 disabled:opacity-50"
              style={tapStyle}
              title={matched ? LABEL.matchedLockHint : undefined}
            >
              {LABEL.cancelSupport}
            </button>
            {call.payout_status !== "completed" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSubmitPayoutComplete()}
                className={`min-h-10 w-full rounded-xl px-3 text-xs font-black ring-1 sm:w-auto ${SUPPORT_UI.payout}`}
                style={tapStyle}
              >
                {LABEL.completePayout}
              </button>
            ) : null}
          </>
        )}
      </div>

      {matched && listMode === "confirmed" ? (
        <p className="px-3 pb-2 text-[11px] font-bold text-amber-800">{LABEL.matchedLockHint}</p>
      ) : null}

      {actionMode === "approve" && listMode === "review" ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/80 px-3 py-4">
          <p className={`text-sm font-black ${SUPPORT_UI.planned} inline-flex rounded-lg px-2 py-1 ring-1`}>
            {LABEL.estimatedSupport}: {formatWon(call.estimated_support_amount)}
          </p>
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.confirmedSupport}</span>
            <input
              value={form.amount}
              onChange={(e) => onFormChange({ amount: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.staff}</span>
            <select
              value={form.staffId}
              onChange={(e) => onFormChange({ staffId: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            >
              <option value="">{LABEL.dash}</option>
              {staff
                .filter((s) => s.is_active !== false)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.id} / {s.phone ?? LABEL.dash}
                  </option>
                ))}
            </select>
          </label>
          <textarea
            value={form.memo}
            onChange={(e) => onFormChange({ memo: e.target.value })}
            placeholder={LABEL.memo}
            className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <SponsorCatalogSelect
            label={LABEL.supportKind}
            value={form.supportKind}
            options={catalog.supportKinds}
            onChange={(v) => onFormChange({ supportKind: v })}
            onAddOption={(v) => onAddCatalogOption("supportKinds", v)}
          />
          <SponsorCatalogSelect
            label={LABEL.supportForm}
            value={form.supportForm}
            options={catalog.supportForms}
            onChange={(v) => onFormChange({ supportForm: v })}
            onAddOption={(v) => onAddCatalogOption("supportForms", v)}
          />
          <SponsorCatalogSelect
            label={LABEL.supportCondition}
            value={form.supportCondition}
            options={catalog.supportConditions}
            onChange={(v) => onFormChange({ supportCondition: v })}
            onAddOption={(v) => onAddCatalogOption("supportConditions", v)}
          />
          <button
            type="button"
            disabled={busy || !form.staffId}
            onClick={() => void onSubmitApprove()}
            className="min-h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
          >
            {LABEL.confirmSupport}
          </button>
        </div>
      ) : null}

      {actionMode === "change" && listMode === "confirmed" ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/80 px-3 py-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.confirmedSupport}</span>
            <input
              value={form.amount}
              onChange={(e) => onFormChange({ amount: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.staff}</span>
            <select
              value={form.staffId}
              onChange={(e) => onFormChange({ staffId: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            >
              <option value="">{LABEL.dash}</option>
              {staff
                .filter((s) => s.is_active !== false)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name ?? s.id} / {s.phone ?? LABEL.dash}
                  </option>
                ))}
            </select>
          </label>
          <textarea
            value={form.memo}
            onChange={(e) => onFormChange({ memo: e.target.value })}
            placeholder={LABEL.memo}
            className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <SponsorCatalogSelect
            label={LABEL.supportKind}
            value={form.supportKind}
            options={catalog.supportKinds}
            onChange={(v) => onFormChange({ supportKind: v })}
            onAddOption={(v) => onAddCatalogOption("supportKinds", v)}
          />
          <SponsorCatalogSelect
            label={LABEL.supportForm}
            value={form.supportForm}
            options={catalog.supportForms}
            onChange={(v) => onFormChange({ supportForm: v })}
            onAddOption={(v) => onAddCatalogOption("supportForms", v)}
          />
          <SponsorCatalogSelect
            label={LABEL.supportCondition}
            value={form.supportCondition}
            options={catalog.supportConditions}
            onChange={(v) => onFormChange({ supportCondition: v })}
            onAddOption={(v) => onAddCatalogOption("supportConditions", v)}
          />
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.payoutStatus}</span>
            <select
              value={form.payoutStatus}
              onChange={(e) => onFormChange({ payoutStatus: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            >
              <option value="processing">{LABEL.payoutProcessing}</option>
              <option value="completed">{LABEL.payoutCompleted}</option>
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onSubmitChange()}
              className="min-h-11 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
            >
              {LABEL.changeSupport}
            </button>
            <button
              type="button"
              disabled={busy || matched}
              onClick={() => void onSubmitRevert()}
              className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 text-sm font-black text-amber-900 disabled:opacity-50"
              title={matched ? LABEL.matchedLockHint : undefined}
            >
              {LABEL.revertToPlanned}
            </button>
          </div>
          <button
            type="button"
            disabled={busy || matched}
            onClick={() => openAction("reject")}
            className="min-h-10 w-full rounded-xl border border-red-200 bg-white text-sm font-black text-red-700 disabled:opacity-50"
          >
            {LABEL.cancelSupport}
          </button>
        </div>
      ) : null}

      {actionMode === "reject" ? (
        <div className="space-y-3 border-t border-slate-100 bg-red-50/50 px-3 py-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.cancelReason}</span>
            <select
              value={form.cancelReason}
              onChange={(e) => onFormChange({ cancelReason: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            >
              <option value="">{LABEL.dash}</option>
              {CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={form.cancelReasonCustom}
            onChange={(e) => onFormChange({ cancelReasonCustom: e.target.value })}
            placeholder={LABEL.cancelReasonCustom}
            className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
          />
          <button
            type="button"
            disabled={busy || (listMode === "confirmed" && matched) || !form.cancelReason}
            onClick={() => void onSubmitReject()}
            className="min-h-11 w-full rounded-xl bg-red-600 text-sm font-black text-white disabled:opacity-50"
          >
            {LABEL.cancelConfirm}
          </button>
        </div>
      ) : null}
    </article>
  );
}
