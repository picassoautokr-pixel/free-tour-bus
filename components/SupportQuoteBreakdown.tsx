import {
  formatSupportAmountFromBreakdown,
  SETTLEMENT_TYPE_LABELS,
  type QuoteSupportBreakdown,
} from "@/lib/support-calculation";

type Row = { label: string; value: string; emphasis?: "planned" | "confirmed" | "final" };

function buildRows(breakdown: QuoteSupportBreakdown, mode: "full" | "customer"): Row[] {
  if (breakdown.calculationStatus === "failed") {
    return [{ label: "계산 상태", value: breakdown.calculationError ?? "계산 실패" }];
  }

  const fmt = (value: number | null | undefined, phase: "planned" | "confirmed" | "final") =>
    formatSupportAmountFromBreakdown(breakdown, value, phase);

  const rows: Row[] = [
    { label: "일반견적가", value: fmt(breakdown.normalPrice, "planned") },
  ];

  if (!breakdown.sponsorQuoteEnabled) return rows;

  if (mode === "full") {
    rows.push({
      label: "분배모드",
      value: SETTLEMENT_TYPE_LABELS[breakdown.settlementType],
    });
    rows.push({
      label: "총 예정 지원금",
      value: fmt(breakdown.totalPlannedSupport, "planned"),
      emphasis: "planned",
    });
    rows.push({
      label: "고객 예정 지원금",
      value: fmt(breakdown.customerPlannedSupport, "planned"),
      emphasis: "planned",
    });
    rows.push({
      label: "기사 예정 지원금",
      value: fmt(breakdown.partnerPlannedSupport, "planned"),
      emphasis: "planned",
    });
  }

  rows.push({
    label: "지원금 할인 예정가",
    value: fmt(breakdown.supportDiscountPlannedPrice, "planned"),
    emphasis: "planned",
  });

  if (mode === "full") {
    rows.push({
      label: "총 확정 지원금",
      value: fmt(breakdown.totalConfirmedSupport, "confirmed"),
      emphasis: "confirmed",
    });
    rows.push({
      label: "고객 확정 지원금",
      value: fmt(breakdown.customerConfirmedSupport, "confirmed"),
      emphasis: "confirmed",
    });
    rows.push({
      label: "기사 확정 지원금",
      value: fmt(breakdown.partnerConfirmedSupport, "confirmed"),
      emphasis: "confirmed",
    });
  }

  rows.push({
    label: "지원금 할인 적용가",
    value: fmt(breakdown.supportDiscountAppliedPrice, "confirmed"),
    emphasis: "confirmed",
  });

  if (breakdown.extensionSupport != null) {
    rows.push({
      label: "연장 지원금",
      value: fmt(breakdown.extensionSupport, breakdown.isConfirmed ? "final" : "planned"),
      emphasis: "final",
    });
  }

  rows.push({
    label: "최종 할인 적용가",
    value: fmt(breakdown.finalDiscountAppliedPrice, "final"),
    emphasis: "final",
  });

  return rows;
}

export function SupportQuoteBreakdown({
  breakdown,
  mode = "full",
  compact = false,
}: {
  breakdown: QuoteSupportBreakdown;
  mode?: "full" | "customer";
  compact?: boolean;
}) {
  const rows = buildRows(breakdown, mode);
  if (compact) {
    return (
      <dl className="grid gap-1 text-xs">
        {rows.map((row) => (
          <CompactRow key={row.label} row={row} />
        ))}
      </dl>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`rounded-xl p-3 ring-1 ${
            row.emphasis === "confirmed"
              ? "bg-emerald-50 ring-emerald-100"
              : row.emphasis === "final"
                ? "bg-amber-50 ring-amber-100"
                : "bg-blue-50 ring-blue-100"
          }`}
        >
          <p
            className={`text-[11px] font-bold ${
              row.emphasis === "confirmed"
                ? "text-emerald-600"
                : row.emphasis === "final"
                  ? "text-amber-600"
                  : "text-blue-500"
            }`}
          >
            {row.label}
          </p>
          <p className="mt-1 font-black text-slate-950">{row.value}</p>
        </div>
      ))}
    </div>
  );
}

function CompactRow({ row }: { row: Row }) {
  return (
    <>
      <dt className="font-semibold text-slate-500">{row.label}</dt>
      <dd className="font-black text-slate-900">{row.value}</dd>
    </>
  );
}
