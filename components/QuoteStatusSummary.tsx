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

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-3 ring-1 ring-slate-100 ${
        compact ? "" : "shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
          {quoteStatusLabel(quoteStatus)}
        </span>
        {countdown ? (
          <span className="text-sm font-black text-slate-900">{countdown}</span>
        ) : null}
      </div>
      {autoFinalDate ? (
        <p className="mt-2 text-xs font-bold leading-5 text-blue-700">
          업무시간 기준 다음 확정: {autoFinalDate}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
        {quoteDeadlineAt ? <span>마감 {formatDateTimeShort(quoteDeadlineAt)}</span> : null}
        {quoteCount != null ? (
          <span>
            견적 {quoteCount}
            {quoteLimitCount != null ? ` / ${quoteLimitCount}` : ""}건
          </span>
        ) : null}
        {formatPrice(targetNormalPrice) ? (
          <span>일반 목표 {formatPrice(targetNormalPrice)}</span>
        ) : null}
        {formatPrice(targetMemberPrice) ? (
          <span>지원금 목표 {formatPrice(targetMemberPrice)}</span>
        ) : null}
      </div>
      {quoteClosedReason ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          마감 사유: {quoteClosedReason}
        </p>
      ) : null}
    </div>
  );
}

