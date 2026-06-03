"use client";

import { useEffect } from "react";
import { ApplicationDetailMatchedPanel } from "./ApplicationDetailMatchedPanel";
import { AdminDriverQuotesSection } from "./AdminDriverQuotesSection";
import type { ApplicationDetail, ApplicationStatusValue } from "./admin-types";
import {
  formatCreatedAt,
  getFileExtFromNameOrUrl,
  isImageExt,
  isPdfExt,
} from "./admin-page-utils";

export function AdminDetailSlidePanel({
  row,
  open,
  onClose,
  onStatusSaved,
  onOpenSms,
  onApplicationHidden,
}: {
  row: ApplicationDetail | null;
  open: boolean;
  onClose: () => void;
  onStatusSaved: (
    applicationId: string,
    nextStatus: ApplicationStatusValue,
    nextMemo: string,
  ) => void;
  onOpenSms: (row: ApplicationDetail) => void;
  onApplicationHidden?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || row == null) return null;

  const fileUrl = row.file_url.trim();
  const fileName = row.file_name.trim();
  const fileHttpUrl =
    fileUrl.startsWith("http://") || fileUrl.startsWith("https://");
  const fileExt = getFileExtFromNameOrUrl(fileName, fileUrl);
  const isImage = fileHttpUrl && isImageExt(fileExt);
  const isPdf = fileHttpUrl && isPdfExt(fileExt);

  // 이전 데이터 호환 (attachment_url)
  const legacyUrl = row.attachment_url.trim();
  const legacyHttpUrl =
    legacyUrl.startsWith("http://") || legacyUrl.startsWith("https://");

  // isImage, isPdf, legacyHttpUrl are used by ApplicationDetailMatchedPanel via row props
  void isImage;
  void isPdf;
  void legacyHttpUrl;

  return (
    <>
      <button
        type="button"
        aria-label="패널 닫기"
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-2xl ring-1 ring-slate-200 max-w-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-detail-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
          <div>
            <h2
              id="admin-detail-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              신청 상세
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {formatCreatedAt(row.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenSms(row)}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 max-[480px]:hidden"
            >
              문자 발송
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
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
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-6">
          <button
            type="button"
            onClick={() => onOpenSms(row)}
            className="mb-3 hidden h-10 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm transition hover:bg-slate-900 max-[480px]:inline-flex"
          >
            문자 발송
          </button>

          <ApplicationDetailMatchedPanel
            row={row}
            onOpenSms={onOpenSms}
            onStatusSaved={onStatusSaved}
            onApplicationHidden={onApplicationHidden}
            lifecycleTools={
              <details className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <summary className="cursor-pointer text-xs font-black text-slate-700">
                  견적 운영 도구 (자동마감·비회원 매칭)
                </summary>
                <div className="mt-2 [&>section]:mt-0 [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none [&>section]:ring-0">
                  <AdminDriverQuotesSection applicationId={row.id} applicationDetail={row} />
                </div>
              </details>
            }
          />
        </div>
      </aside>
    </>
  );
}
