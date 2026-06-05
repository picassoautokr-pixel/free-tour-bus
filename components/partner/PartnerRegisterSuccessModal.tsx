"use client";

/**
 * components/partner/PartnerRegisterSuccessModal.tsx
 *
 * 제휴기사 등록 완료 모달
 */

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

interface PartnerRegisterSuccessModalProps {
  referralToken: string;
  onViewQuotes: () => void;
  onGoHome: () => void;
}

export function PartnerRegisterSuccessModal({
  referralToken,
  onViewQuotes,
  onGoHome,
}: PartnerRegisterSuccessModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="partner-success-title"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-slate-200 sm:p-8">
        <h2
          id="partner-success-title"
          className="text-center text-xl font-black tracking-[-0.04em] text-slate-950"
        >
          제휴기사 등록 신청이 완료되었습니다.
        </h2>
        <p className="mt-4 text-center text-[0.9375rem] font-semibold leading-7 text-slate-600">
          관리자 승인 후 로그인할 수 있습니다.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-800 shadow-sm transition hover:bg-slate-50"
            style={tapStyle}
            onClick={onViewQuotes}
          >
            {referralToken !== ""
              ? "견적요청서 확인하고 견적 제출하기"
              : "전국 견적요청 확인하기"}
          </button>
          <button
            type="button"
            className="touch-manipulation flex min-h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-base font-black text-white shadow-lg transition hover:brightness-105"
            style={tapStyle}
            onClick={onGoHome}
          >
            메인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
