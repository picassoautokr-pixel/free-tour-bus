"use client";

import { useState } from "react";

import { LABEL } from "@/lib/sponsor-dashboard-labels";

export function SponsorCatalogSelect({
  label,
  value,
  options,
  onChange,
  onAddOption,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAddOption?: (value: string) => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <div className="block">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold"
      >
        <option value="">{LABEL.dash}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {onAddOption ? (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={`${label} 추가`}
            className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold"
          />
          <button
            type="button"
            onClick={() => {
              const t = custom.trim();
              if (!t) return;
              onAddOption(t);
              onChange(t);
              setCustom("");
            }}
            className="min-h-10 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-800"
          >
            추가
          </button>
        </div>
      ) : null}
    </div>
  );
}
