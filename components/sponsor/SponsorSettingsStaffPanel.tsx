"use client";

import type { Dispatch, SetStateAction } from "react";

import { LABEL } from "@/lib/sponsor-dashboard-labels";
import { SERVICE_REGIONS } from "@/lib/regions";
import { parseStaffAssignedRegions } from "@/lib/sponsor-rule-helpers";
import { safeText } from "@/lib/sponsor";

export type SponsorStaffFormState = {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  service_regions: string[];
};

const emptyStaffForm = (): SponsorStaffFormState => ({
  id: "",
  name: "",
  phone: "",
  email: "",
  role: "",
  service_regions: [],
});

function staffToForm(item: Record<string, unknown>): SponsorStaffFormState {
  const regions = parseStaffAssignedRegions(item);
  return {
    id: safeText(item.id),
    name: safeText(item.name),
    phone: safeText(item.phone),
    email: safeText(item.email),
    role: safeText(item.role),
    service_regions: regions,
  };
}

export function SponsorSettingsStaffPanel({
  staff,
  form,
  setForm,
  onSave,
  onDelete,
  busy,
}: {
  staff: Array<Record<string, unknown> & { id: string }>;
  form: SponsorStaffFormState;
  setForm: Dispatch<SetStateAction<SponsorStaffFormState>>;
  onSave: () => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="mt-5 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="text-lg font-black text-slate-950">{LABEL.settingsStaff}</h2>

      <label className="block">
        <span className="text-xs font-bold text-slate-500">{LABEL.viewStaff}</span>
        <select
          value={form.id}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "") {
              setForm(emptyStaffForm());
              return;
            }
            const row = staff.find((s) => s.id === id);
            if (row) setForm(staffToForm(row));
          }}
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
        >
          <option value="">{LABEL.newStaff}</option>
          {staff.map((item) => (
            <option key={item.id} value={item.id}>
              {safeText(item.name, "이름 없음")} / {safeText(item.role, LABEL.dash)}
            </option>
          ))}
        </select>
      </label>

      {(
        [
          ["name", LABEL.staffName],
          ["phone", LABEL.staffContact],
          ["email", LABEL.staffEmail],
          ["role", LABEL.staffRole],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block">
          <span className="text-xs font-bold text-slate-500">{label}</span>
          <input
            value={form[key]}
            onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold"
          />
        </label>
      ))}

      <div>
        <p className="text-xs font-bold text-slate-500">{LABEL.staffRegion}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SERVICE_REGIONS.map((region) => {
            const checked = form.service_regions.includes(region);
            return (
              <button
                key={region}
                type="button"
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    service_regions: checked
                      ? p.service_regions.filter((r) => r !== region)
                      : [...p.service_regions, region],
                  }))
                }
                className={`min-h-9 rounded-full border px-3 text-xs font-black ${
                  checked
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                {region}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || form.name.trim() === ""}
          onClick={onSave}
          className="min-h-11 flex-1 rounded-xl bg-blue-600 text-sm font-black text-white disabled:opacity-50"
        >
          {LABEL.saveStaff}
        </button>
        {form.id ? (
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
