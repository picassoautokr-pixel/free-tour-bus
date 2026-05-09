"use client";

import { BottomSheet } from "@/components/BottomSheet";

const KAKAO_CHAT_URL = "https://open.kakao.com/";
/** tel / sms URI용 (하이픈 없음) */
const CONTACT_PHONE_DIGITS = "01000000000";
const CONTACT_PHONE_LABEL = "010-0000-0000";
const SMS_DEFAULT_BODY = "안녕하세요. 무료관광버스 문의드립니다.";

const tapStyle = { WebkitTapHighlightColor: "transparent" } as const;

type CustomerSupportSheetProps = {
  open: boolean;
  onClose: () => void;
};

export function CustomerSupportSheet({ open, onClose }: CustomerSupportSheetProps) {
  const smsHref = `sms:${CONTACT_PHONE_DIGITS}?body=${encodeURIComponent(SMS_DEFAULT_BODY)}`;
  const telHref = `tel:${CONTACT_PHONE_DIGITS}`;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="상담 메뉴"
      panelId="customer-support-sheet"
    >
      <nav
        aria-label="고객센터 상담 방법"
        className="flex flex-col gap-3 pb-1"
      >
        <a
          href={KAKAO_CHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onClose()}
          className="touch-manipulation flex min-h-[4.25rem] items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm ring-1 ring-slate-100 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
          style={tapStyle}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FEE500] text-[#191919]"
            aria-hidden
          >
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black tracking-[-0.03em] text-slate-950">
              카카오톡 상담
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-slate-500">
              새 창에서 열립니다
            </span>
          </span>
          <svg
            className="h-5 w-5 shrink-0 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>

        <a
          href={telHref}
          className="touch-manipulation flex min-h-[4.25rem] items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm ring-1 ring-slate-100 transition hover:border-emerald-300 hover:bg-emerald-50/80 active:scale-[0.99]"
          style={tapStyle}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white"
            aria-hidden
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 0 1 2-2h3.28a1 1 0 0 1 .948.684l1.498 4.493a1 1 0 0 1-.502 1.21l-2.257 1.13a11.042 11.042 0 0 0 5.516 5.516l1.13-2.257a1 1 0 0 1 1.21-.502l4.493 1.498a1 1 0 0 1 .684.949V19a2 2 0 0 1-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black tracking-[-0.03em] text-slate-950">
              전화 상담
            </span>
            <span className="mt-0.5 block font-mono text-sm font-bold tracking-tight text-emerald-700">
              {CONTACT_PHONE_LABEL}
            </span>
          </span>
        </a>

        <a
          href={smsHref}
          className="touch-manipulation flex min-h-[4.25rem] items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] px-5 py-4 text-left text-white shadow-lg shadow-blue-900/25 ring-1 ring-white/20 transition hover:brightness-105 active:scale-[0.99]"
          style={tapStyle}
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30"
            aria-hidden
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-5 5v-5z"
              />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-black tracking-[-0.03em]">
              문자 문의
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-white/85">
              기본 문구가 채워집니다 · {CONTACT_PHONE_LABEL}
            </span>
          </span>
        </a>
      </nav>
    </BottomSheet>
  );
}
