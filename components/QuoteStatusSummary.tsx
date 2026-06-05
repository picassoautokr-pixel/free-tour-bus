"use client";

import { useEffect, useState } from "react";

import {
  formatDateTimeShort,
  quoteCountdownText,
  quoteStatusLabel,
} from "@/lib/quote-status";

type Props = {
  quoteStatus: string;
  quoteDeadlineAt?: string | null;
  autoFinalConfirmAt?: string | null;
  quoteClosedReason?: string | null;
  quoteCount?: number | null;
  quoteLimitCount?: number | null;
  targetNormalPrice?: number | null;
  targetMemberPrice?: number | null;
  compact?: boolean;
};

function formatPrice(value: number | null | undefined): string | null {
  if (value == null) return null;
  return `${value.toLocaleString("ko-KR")}원`;
}

function subsidyStage(quoteStatus: string): {
  tone: string;
  title: string;
  description: string;
} {
  if (["auto_selected", "final_selected", "contract_pending", "completed"].includes(quoteStatus)) {
    return {
      tone: "bg-emerald-600 text-white",
      title: "지원금 가승인 완료",
      description: "선정된 기사와 지원금 조건을 확인하고 매칭을 확정하는 단계입니다.",
    };
  }
  if (
    [
      "closed_by_time",
      "closed_by_quote_count",
      "closed_by_price",
      "manually_closed",
    ].includes(quoteStatus)
  ) {
    return {
      tone: "bg-blue-600 text-white",
      title: "지원금 가승인 검토",
      description: "관리자가 후원 조건과 기사 견적을 비교해 가승인 여부를 확인합니다.",
    };
  }
  return {
    tone: "bg-slate-900 text-white",
    title: "지원금 견적 수집",
    description: "기사 견적과 후원 가능 금액을 모아 지원금 적용가를 계산합니다.",
  };
}

export function QuoteStatusSummary({
  quoteStatus,
  quoteDeadlineAt,
  autoFinalConfirmAt,
  quoteClosedReason,
  quoteCount,
  quoteLimitCount,
  targetNormalPrice,
  targetMemberPrice,
  compact,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = quoteCountdownText({
    quoteStatus,
    quoteDeadlineAt,
    autoFinalConfirmAt,
    nowMs,
  });
  const autoFinalDate =
    quoteStatus === "auto_selected" && autoFinalConfirmAt
      ? formatDateTimeShort(autoFinalConfirmAt)
      : null;
  const stage = subsidyStage(quoteStatus);

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-3 ring-1 ring-slate-100 ${
        compact ? "" : "shadow-sm"
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${stage.tone}`}>
            {stage.title}
          </span>
          <p className="mt-2 text-sm font-black text-slate-950">
            {quoteStatusLabel(quoteStatus)}
            {countdown ? <span className="ml-2 text-blue-700">{countdown}</span> : null}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {stage.description}
          </p>
        </div>
      </div>
      {autoFinalDate ? (
        <p className="mt-2 text-xs font-bold leading-5 text-blue-700">
          업무시간 기준 매칭 확정 예정: {autoFinalDate}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
        {quoteDeadlineAt ? <span>가승인 검토 {formatDateTimeShort(quoteDeadlineAt)}</span> : null}
        {quoteCount != null ? (
          <span>
            견적 {quoteCount}
            {quoteLimitCount != null ? ` / ${quoteLimitCount}` : ""}건
          </span>
        ) : null}
        {/* 희망견적 표시 - 추후 사용 예정, 현재 숨김 */}
      </div>
      {quoteClosedReason ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          마감 사유: {quoteClosedReason}
        </p>
      ) : null}
    </div>
  );
}

