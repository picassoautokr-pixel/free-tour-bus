"use client";

import { LABEL, SUPPORT_UI } from "@/lib/sponsor-dashboard-labels";
import type { SponsorSummary } from "@/lib/sponsor-call-view-model";
import { formatWon } from "@/lib/sponsor-call-view-model";

function ReportCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "violet" | "slate";
}) {
  const toneClass =
    tone === "green"
      ? SUPPORT_UI.confirmed
      : tone === "violet"
        ? SUPPORT_UI.payout
        : tone === "blue"
          ? SUPPORT_UI.planned
          : SUPPORT_UI.muted;
  return (
    <div className={`rounded-2xl px-3 py-3 ring-1 ${toneClass}`}>
      <p className="text-[10px] font-bold opacity-80">{label}</p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

export function SponsorReportCards({ summary }: { summary: SponsorSummary | null }) {
  if (!summary) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <ReportCard
        label={LABEL.reportTotalBudget}
        value={summary.totalBudget > 0 ? formatWon(summary.totalBudget) : LABEL.unconfirmed}
        tone="slate"
      />
      <ReportCard
        label={LABEL.reportUsed}
        value={formatWon(summary.usedConfirmed)}
        tone="green"
      />
      <ReportCard
        label={LABEL.reportTodayConfirmed}
        value={formatWon(summary.todayConfirmed)}
        tone="green"
      />
      <ReportCard
        label={LABEL.reportMonthConfirmed}
        value={formatWon(summary.monthConfirmed)}
        tone="green"
      />
      <ReportCard
        label={LABEL.reportRemaining}
        value={
          summary.totalBudget > 0 ? formatWon(summary.remainingBudget) : LABEL.unconfirmed
        }
        tone="blue"
      />
      <ReportCard
        label={LABEL.reportReviewCount}
        value={`${summary.reviewCount}건`}
        tone="blue"
      />
      <ReportCard
        label={LABEL.reportConfirmedCount}
        value={`${summary.confirmedCount}건`}
        tone="green"
      />
      <ReportCard
        label={LABEL.reportPayoutProcessing}
        value={`${summary.payoutProcessingCount}건`}
        tone="violet"
      />
      <ReportCard
        label={LABEL.reportPayoutCompleted}
        value={`${summary.payoutCompletedCount}건`}
        tone="violet"
      />
    </div>
  );
}
