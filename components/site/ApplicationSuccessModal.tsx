"use client";

import type { SubmitSuccessSummary } from "./site-form-types";

export function ApplicationSuccessModal({
  summary,
  onConfirm,
  onReset,
}: {
  summary: SubmitSuccessSummary;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-[3px] sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-success-title"
    >
      <div className="max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl shadow-slate-900/30 ring-1 ring-slate-200/80 sm:p-8">
        <div className="flex flex-col">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-[10px] ring-emerald-100/80">
              <svg
                aria-hidden="true"
                className="h-9 w-9 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </div>
          </div>

          <h3
            id="submit-success-title"
            className="mt-5 text-center text-[1.35rem] font-black leading-snug tracking-[-0.04em] text-slate-950"
          >
            무료버스 견적 신청이 접수되었습니다.
          </h3>

          <p className="mt-3 text-center text-[0.9375rem] font-semibold leading-7 tracking-[-0.02em] text-slate-600">
            기사 견적과 지원 가능 여부를 확인한 뒤 문자로 안내드립니다.
          </p>
          <p className="mt-2 text-center text-sm font-medium leading-6 tracking-[-0.02em] text-slate-500">
            영업일 기준 3~5일 이내 순차적으로 연락드릴 수 있습니다.
          </p>

          <p className="mt-5 text-center text-[1.05rem] font-black tracking-tight text-slate-900">
            접수번호: {summary.receiptNumber}
          </p>

          <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/90 p-4 ring-1 ring-slate-100/80">
            <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-500">
              접수 정보
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              {(
                [
                  ["신청유형", summary.applicationType],
                  ["신청자명", summary.applicantName],
                  ["연락처", summary.phone],
                  ["출발지", summary.departure],
                  ["도착지", summary.destination],
                  ["출발일시", summary.departureDateTime],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex gap-3 border-b border-slate-200/60 pb-3 last:border-b-0 last:pb-0"
                >
                  <dt className="w-[4.5rem] shrink-0 font-semibold text-slate-500">
                    {label}
                  </dt>
                  <dd className="min-w-0 flex-1 font-bold leading-snug text-slate-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-bold tracking-[-0.03em] text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
              style={tapStyle}
              onClick={onConfirm}
            >
              확인
            </button>
            <button
              type="button"
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-4 text-base font-black tracking-[-0.03em] text-white shadow-lg shadow-blue-900/25 transition hover:brightness-105 active:scale-[0.99]"
              style={tapStyle}
              onClick={onReset}
            >
              처음으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
