"use client";

import type { ReactNode } from "react";

import {
  LABEL,
  SUPPORT_UI,
  type CardExpandMode,
} from "@/lib/sponsor-dashboard-labels";
import {
  formatUntilDeparture,
  formatWon,
  isMatchCompleted,
  matchStageLabel,
  sponsorSupportDisplayModelForCall,
  type SponsorCallRow,
} from "@/lib/sponsor-call-view-model";
import {
  calculatePlannedSupportFromRule,
  filterRulesForCall,
  findDefaultRule,
  ruleSupportConditionLabel,
  ruleSupportFormLabel,
  sortStaffForCall,
  staffMatchesDepartureRegion,
  type SponsorRuleRecord,
} from "@/lib/sponsor-rule-helpers";
import { QuoteDebugButton } from "@/components/quote/QuoteDebugButton";
import { SponsorMatchedContactDebugButton } from "@/components/sponsor/SponsorMatchedContactDebugButton";
import { sponsorCallDebugContext } from "@/lib/quote-debug-trace";
import type { SponsorCustomerInfoPopup } from "@/lib/sponsor-matched-contact";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

export type SponsorCardForm = {
  ruleId: string;
  amount: string;
  staffId: string;
  memo: string;
};

function ListCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-900">{children}</p>
    </div>
  );
}

function applyRuleToForm(
  rule: SponsorRuleRecord,
  passengerCount: number | null,
  onFormChange: (patch: Partial<SponsorCardForm>) => void,
) {
  const passengers = passengerCount ?? 0;
  const planned = calculatePlannedSupportFromRule(rule, passengers);
  onFormChange({
    ruleId: rule.id,
    amount: String(planned),
  });
}

export function SponsorCallCard({
  call,
  listMode,
  expandMode,
  onToggleExpand,
  form,
  onFormChange,
  rules,
  staff,
  busy,
  onSubmitConfirm,
  onOpenCustomerInfo,
  sponsorRule = null,
}: {
  call: SponsorCallRow;
  listMode: "review" | "confirmed";
  expandMode: CardExpandMode;
  onToggleExpand: () => void;
  form: SponsorCardForm;
  onFormChange: (patch: Partial<SponsorCardForm>) => void;
  rules: SponsorRuleRecord[];
  staff: Array<{
    id: string;
    name?: string;
    phone?: string;
    role?: string;
    service_regions?: string[];
    is_active?: boolean;
  }>;
  busy: boolean;
  onSubmitConfirm: () => void;
  onOpenCustomerInfo?: () => void;
  sponsorRule?: Record<string, unknown> | null;
}) {
  const matched = isMatchCompleted(call);
  const supportModel = sponsorSupportDisplayModelForCall(call);
  const eligibleRules = filterRulesForCall(rules, {
    passengerCount: call.passenger_count,
    groupType: call.group_type ?? "",
    linkedRuleId: call.sponsor_rule_id,
  });
  const defaultRule = findDefaultRule(rules);
  const selectedRule =
    eligibleRules.find((r) => r.id === form.ruleId) ??
    eligibleRules.find((r) => r.id === call.sponsor_rule_id) ??
    defaultRule;
  const passengers = call.passenger_count ?? 0;
  const plannedPreview = selectedRule
    ? calculatePlannedSupportFromRule(selectedRule, passengers)
    : call.estimated_support_amount;
  const sortedStaff = sortStaffForCall(
    staff.filter((s) => s.is_active !== false),
    call.departure_region,
  );

  const expandOpen = expandMode != null;
  const readOnlyMatched = listMode === "confirmed" && matched;

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      <div className="p-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          <ListCell label={LABEL.departureRegion}>
            {call.departure_region || LABEL.dash}
          </ListCell>
          <ListCell label={LABEL.departure}>{call.departure || LABEL.dash}</ListCell>
          <ListCell label={LABEL.departureTime}>
            {call.departure_time?.trim() || LABEL.dash}
          </ListCell>
          <ListCell label={LABEL.passengers}>
            {call.passenger_count != null
              ? `${call.passenger_count}${LABEL.passengers}`
              : LABEL.unconfirmed}
          </ListCell>
          <ListCell label={LABEL.groupType}>{call.group_type || LABEL.dash}</ListCell>
          <ListCell label={LABEL.tripType}>{call.trip_type || LABEL.dash}</ListCell>
          <ListCell label={LABEL.untilDeparture}>{formatUntilDeparture(call)}</ListCell>
          {listMode === "confirmed" ? (
            <>
              <ListCell label={LABEL.confirmedSupport}>
                {formatWon(supportModel?.confirmed_total_support ?? call.approved_support_amount)}
              </ListCell>
              <ListCell label={LABEL.staff}>
                {call.assigned_staff_name || LABEL.dash}
              </ListCell>
              <ListCell label={LABEL.supportKind}>
                {call.support_kind || call.sponsor_rule_title || LABEL.dash}
              </ListCell>
              <ListCell label={LABEL.matchStage}>{matchStageLabel(call)}</ListCell>
            </>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {listMode === "review" ? (
            <div className={`rounded-xl px-3 py-2 ring-1 ${SUPPORT_UI.planned}`}>
              <p className="text-[10px] font-bold">{LABEL.estimatedSupport}</p>
              <p className="text-sm font-black">{formatWon(call.estimated_support_amount)}</p>
            </div>
          ) : null}
          {listMode === "review" ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-black text-white"
              style={tapStyle}
            >
              {expandOpen ? LABEL.collapse : LABEL.supportInput}
            </button>
          ) : matched && onOpenCustomerInfo ? (
            <>
              <button
                type="button"
                onClick={onOpenCustomerInfo}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
                style={tapStyle}
              >
                {LABEL.customerInfo}
              </button>
              <SponsorMatchedContactDebugButton
                debug={call.matched_contact_debug}
                popup={
                  call.popup_customer_name
                    ? ({
                        customer_name: call.popup_customer_name,
                        customer_phone: call.popup_customer_phone ?? "",
                        driver_company: call.popup_driver_company ?? "",
                        driver_name: call.popup_driver_name ?? "",
                        driver_phone: call.popup_driver_phone ?? "",
                        data_source: call.contact_data_source ?? "",
                      } satisfies SponsorCustomerInfoPopup)
                    : null
                }
              />
            </>
          ) : listMode === "confirmed" && !matched ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-900"
              style={tapStyle}
            >
              {expandOpen ? LABEL.collapse : LABEL.editSupport}
            </button>
          ) : null}
          <QuoteDebugButton context={sponsorCallDebugContext(call, sponsorRule)} />
        </div>
      </div>

      {expandOpen ? (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/80 px-3 py-4">
          {readOnlyMatched ? (
            <div className="space-y-2 text-sm">
              <p className="text-xs font-bold text-amber-800">{LABEL.matchedReadOnlyHint}</p>
              <p>
                <span className="font-bold text-slate-500">{LABEL.supportKind}</span>{" "}
                {call.support_kind || call.sponsor_rule_title || LABEL.dash}
              </p>
              <p>
                <span className="font-bold text-slate-500">{LABEL.confirmedSupport}</span>{" "}
                {formatWon(supportModel?.confirmed_total_support ?? call.approved_support_amount)}
              </p>
              {supportModel ? (
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                  {supportModel.display_rows.map((row) => (
                    <p key={row.label} className="flex justify-between gap-3">
                      <span className="font-bold text-slate-500">{row.label}</span>
                      <span>{row.label === "연장회차" ? row.value ?? 0 : formatWon(row.value)}</span>
                    </p>
                  ))}
                  <p className="flex justify-between gap-3">
                    <span className="font-bold text-slate-500">정산모드</span>
                    <span>{supportModel.support_settlement_label}</span>
                  </p>
                </div>
              ) : null}
              <p>
                <span className="font-bold text-slate-500">{LABEL.staff}</span>{" "}
                {call.assigned_staff_name || LABEL.dash}{" "}
                {call.assigned_staff_phone ? `(${call.assigned_staff_phone})` : ""}
              </p>
            </div>
          ) : null}
          {!readOnlyMatched && eligibleRules.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              인원·단체 조건을 충족하는 지원종류가 없습니다. 설정을 확인해 주세요.
            </p>
          ) : null}
          {!readOnlyMatched ? (
          <>
          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.selectSupportKind}</span>
            <select
              value={form.ruleId || selectedRule?.id || ""}
              onChange={(e) => {
                const rule = eligibleRules.find((r) => r.id === e.target.value);
                if (rule) applyRuleToForm(rule, call.passenger_count, onFormChange);
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"
            >
              {eligibleRules.length === 0 ? (
                <option value="">{LABEL.dash}</option>
              ) : (
                eligibleRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {safeText(rule.title)}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className={`rounded-xl p-3 ring-1 ${SUPPORT_UI.planned}`}>
            <p className="text-[11px] font-bold">{LABEL.plannedSupportAuto}</p>
            <p className="mt-1 text-sm font-black">{formatWon(plannedPreview)}</p>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.confirmedSupport}</span>
            <input
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => onFormChange({ amount: e.target.value.replace(/[^\d]/g, "") })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"
            />
          </label>

          {selectedRule ? (
            <div className="grid gap-2 text-sm">
              <p>
                <span className="text-xs font-bold text-slate-500">{LABEL.supportCondition}</span>
                <span className="ml-2 font-black">{ruleSupportConditionLabel(selectedRule)}</span>
              </p>
              <p>
                <span className="text-xs font-bold text-slate-500">{LABEL.supportForm}</span>
                <span className="ml-2 font-black">{ruleSupportFormLabel(selectedRule)}</span>
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="text-xs font-bold text-slate-500">{LABEL.selectStaff}</span>
            <select
              value={form.staffId}
              onChange={(e) => onFormChange({ staffId: e.target.value })}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"
            >
              <option value="">{LABEL.dash}</option>
              {sortedStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                  {staffMatchesDepartureRegion(s, call.departure_region) ? " · 담당지역" : ""}
                </option>
              ))}
            </select>
          </label>

          <textarea
            value={form.memo}
            onChange={(e) => onFormChange({ memo: e.target.value })}
            placeholder={LABEL.memo}
            className="min-h-16 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
          />

          <button
            type="button"
            disabled={busy || !form.ruleId || !form.staffId || form.amount.trim() === ""}
            onClick={() => void onSubmitConfirm()}
            className="min-h-11 w-full rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
          >
            {LABEL.confirmSupport}
          </button>
          </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function safeText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s === "" ? fallback : s;
}
