"use client";

/**
 * components/partner/PartnerRegisterDuplicateModal.tsx
 *
 * 제휴기사 중복 등록 안내 모달
 */

import type { DuplicateRegistration } from "./partner-register-types";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

interface PartnerRegisterDuplicateModalProps {
  info: DuplicateRegistration;
  onPrimaryAction: () => void;
  onClose: () => void;
}

export function PartnerRegisterDuplicateModal({
  info,
  onPrimaryAction,
  onClose,
}: PartnerRegisterDuplicateModalProps) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-duplicate-title"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
        <h2
          id="partner-duplicate-title"
          className="text-center text-xl font-black tracking-[-0.04em] text-slate-950"
        >
          {info.title ?? "이미 신청된 내역이 있습니다."}
        </h2>
        <p className="mt-4 whitespace-pre-wrap text-center text-[0.9375rem] font-semibold leading-7 text-slate-600">
          {info.message ?? "신청 상태를 확인한 뒤 다시 이용해 주세요."}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          {info.secondary_action_url ? (
            <button
              type="button"
              className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
              style={tapStyle}
              onClick={() => {
                if (info.secondary_action_url) {
                  window.location.href = info.secondary_action_url;
                }
              }}
            >
              {info.secondary_action_label ?? "고객센터 문의"}
            </button>
          ) : null}
          <button
            type="button"
            className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black text-white shadow-lg transition hover:brightness-105"
            style={tapStyle}
            onClick={onPrimaryAction}
          >
            {info.action_label ?? "확인"}
          </button>
          <button
            type="button"
            className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-500"
            style={tapStyle}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
