"use client";

import { useEffect } from "react";
import type { ApplicationDetail } from "./admin-types";
import { QuoteStageBadge } from "./AdminStatusBadge";
import { displayApplicationTypeLabel } from "./admin-page-utils";

export function AdminSmsModal({
  row,
  open,
  message,
  onChangeMessage,
  onSend,
  sendLoading,
  sendError,
  onCopy,
  onClose,
}: {
  row: ApplicationDetail;
  open: boolean;
  message: string;
  onChangeMessage: (next: string) => void;
  onSend: () => void | Promise<void>;
  sendLoading: boolean;
  sendError: string | null;
  onCopy: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4 py-10 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-modal-title"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
          <div>
            <h3 id="sms-modal-title" className="text-lg font-black tracking-tight">
              문자 발송
            </h3>
            <p className="mt-1 text-xs font-semibold text-white/70">
              솔라피로 발송하거나, 복사하여 다른 채널로 보낼 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                신청자명
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">
                {row.applicant_name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                연락처
              </p>
              <p className="mt-1 text-sm font-bold text-slate-900">{row.phone}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                신청 유형
              </p>
              <p className="mt-1 text-sm font-bold leading-snug text-slate-900">
                {displayApplicationTypeLabel(row.application_type)}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                진행 단계
              </p>
              <div className="mt-1 flex items-center gap-2">
                <QuoteStageBadge quoteStatus={row.quote_status} finalId={row.final_selected_quote_id} />
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              문자 내용
            </span>
            <textarea
              value={message}
              onChange={(e) => onChangeMessage(e.target.value)}
              disabled={sendLoading}
              className="mt-2 min-h-[220px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold leading-6 text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </label>

          {sendError ? (
            <div
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              role="alert"
            >
              {sendError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={
                sendLoading || message.trim() === "" || row.phone.trim() === ""
              }
              className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendLoading ? "발송 중…" : "솔라피로 발송"}
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={sendLoading}
              className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              복사하기
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={sendLoading}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
