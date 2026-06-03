import { normalizeClientQuoteStage } from "@/lib/status-normalizer";
import { parseKnownApplicationStatus } from "./admin-page-utils";
import type { ApplicationStatusValue } from "./admin-types";

export function StatusBadge({ status }: { status: string }) {
  const trimmed = status.trim();
  if (trimmed === "" || trimmed === "—") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-100">
        —
      </span>
    );
  }

  const known = parseKnownApplicationStatus(status);

  let label: string;
  let className: string;

  if (known === null) {
    label = trimmed;
    className = "border-slate-200 bg-slate-50 text-slate-700 ring-slate-100";
  } else if (known === "pending") {
    label = "접수완료";
    className = "border-blue-200 bg-blue-50 text-blue-800 ring-blue-100";
  } else if (known === "reviewing") {
    label = "검토중";
    className = "border-amber-300 bg-amber-50 text-amber-950 ring-amber-100";
  } else if (known === "approved") {
    label = "승인완료";
    className = "border-emerald-300 bg-emerald-50 text-emerald-900 ring-emerald-100";
  } else {
    label = "반려";
    className = "border-red-200 bg-red-50 text-red-800 ring-red-100";
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ${className}`}
    >
      {label}
    </span>
  );
}

export function QuoteStageBadge({
  quoteStatus,
  finalId,
}: {
  quoteStatus: string;
  finalId?: string;
}) {
  const effectiveStatus =
    finalId && finalId.trim() !== "" ? "final_selected" : quoteStatus;
  const stage = normalizeClientQuoteStage(effectiveStatus);

  const config: Record<string, { label: string; className: string }> = {
    requesting: {
      label: "견적요청중",
      className: "border-blue-200 bg-blue-50 text-blue-800 ring-blue-100",
    },
    auto_closed: {
      label: "자동마감",
      className: "border-amber-300 bg-amber-50 text-amber-950 ring-amber-100",
    },
    matched: {
      label: "매칭완료",
      className: "border-emerald-300 bg-emerald-50 text-emerald-900 ring-emerald-100",
    },
    completed: {
      label: "진행완료",
      className: "border-violet-200 bg-violet-50 text-violet-800 ring-violet-100",
    },
    hidden: {
      label: "숨김",
      className: "border-slate-200 bg-slate-50 text-slate-600 ring-slate-100",
    },
  };
  const { label, className } = config[stage] ?? config.requesting;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ${className}`}
    >
      {label}
    </span>
  );
}

export type { ApplicationStatusValue };
