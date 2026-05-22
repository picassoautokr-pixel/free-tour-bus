"use client";

import type { Dispatch, SetStateAction } from "react";

import { LABEL } from "@/lib/sponsor-dashboard-labels";
import {
  DEFAULT_SPONSOR_RULE_TITLE,
  SPONSOR_SUPPORT_CONDITION_OPTIONS,
  SPONSOR_TARGET_GROUP_OPTIONS,
  parseRuleTargetGroups,
} from "@/lib/sponsor-rule-helpers";
import { SPONSOR_SUPPORT_TYPES, safeText } from "@/lib/sponsor";

export type SponsorRuleFormState = {
  id: string;
  title: string;
  support_per_person: string;
  support_per_case: string;
  max_support_amount: string;
  min_passenger_count: string;
  target_groups: string[];
  support_type: string;
  support_condition: string;
};

const emptyRuleForm = (): SponsorRuleFormState => ({
  id: "",
  title: "",
  support_per_person: "",
  support_per_case: "",
  max_support_amount: "",
  min_passenger_count: "",
  target_groups: [],
  support_type: "cash",
  support_condition: "홍보시",
});

function ruleToForm(rule: Record<string, unknown>): SponsorRuleFormState {
  return {
    id: safeText(rule.id),
    title: safeText(rule.title),
    support_per_person: String(rule.support_per_person ?? ""),
    support_per_case: String(rule.support_per_case ?? ""),
    max_support_amount: String(rule.max_support_amount ?? ""),
    min_passenger_count: String(rule.min_passenger_count ?? ""),
    target_groups: parseRuleTargetGroups(rule),
    support_type: safeText(rule.support_type, "cash"),
    support_condition: safeText(rule.support_condition, "홍보시"),
  };
}

export function SponsorSettingsRulePanel({
  rules,
  form,
  setForm,
  onSave,
  onDelete,
  busy,
}: {
  rules: Array<Record<string, unknown> & { id: string }>;
  form: SponsorRuleFormState;
  setForm: Dispatch<SetStateAction<SponsorRuleFormState>>;
  onSave: () => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const isDefault = form.title.trim() === DEFAULT_SPONSOR_RULE_TITLE || rules.some(
    (r) => r.id === form.id && safeText(r.title) === DEFAULT_SPONSOR_RULE_TITLE,
  );

  return (
    <div className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="text-lg font-black text-slate-950">{LABEL.settingsSupportKinds}</h2>

      <label className="block">
        <span className="text-xs font-bold text-slate-500">{LABEL.viewSupportKinds}</span>
        <select
          value={form.id}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "") {
              setForm(emptyRuleForm());
              return;
            }
            const rule = rules.find((r) => r.id === id);
            if (rule) setForm(ruleToForm(rule));
          }}
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
        >
          <option value="">{LABEL.newSupportKind}</option>
          {rules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {safeText(rule.title, "지원종류")}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-xs font-bold text-slate-500">{LABEL.supportKindName}</span>
          <input
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
          />
        </label>
        {(
          [
            ["support_per_person", LABEL.perPersonSupport],
            ["support_per_case", LABEL.perCaseSupport],
            ["max_support_amount", LABEL.maxSupport],
            ["min_passenger_count", LABEL.minPassengers],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className="text-xs font-bold text-slate-500">{label}</span>
            <input
              inputMode="numeric"
              value={form[key]}
              onChange={(e) =>
                setForm((p) => ({ ...p, [key]: e.target.value.replace(/[^\d]/g, "") }))
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
            />
          </label>
        ))}
      </div>

      <div>
        <p className="text-xs font-bold text-slate-500">{LABEL.targetGroups}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SPONSOR_TARGET_GROUP_OPTIONS.map((group) => {
            const checked = form.target_groups.includes(group);
            return (
              <button
                key={group}
                type="button"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    target_groups: checked
                      ? p.target_groups.filter((g) => g !== group)
                      : [...p.target_groups, group],
                  }))
                }
                className={`min-h-9 rounded-full border px-3 text-xs font-black ${
                  checked
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {group}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-bold text-slate-500">{LABEL.supportForm}</span>
        <select
          value={form.support_type}
          onChange={(e) => setForm((p) => ({ ...p, support_type: e.target.value }))}
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
        >
          {SPONSOR_SUPPORT_TYPES.filter((t) => t.value === "cash" || t.value === "goods").map(
            (item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold text-slate-500">{LABEL.supportCondition}</span>
        <select
          value={form.support_condition}
          onChange={(e) => setForm((p) => ({ ...p, support_condition: e.target.value }))}
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
        >
          {SPONSOR_SUPPORT_CONDITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || form.title.trim() === ""}
          onClick={onSave}
          className="min-h-11 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
        >
          {LABEL.saveSupportKind}
        </button>
        {form.id && !isDefault ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(form.id)}
            className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700"
          >
            {LABEL.delete}
          </button>
        ) : null}
      </div>
    </div>
  );
}
