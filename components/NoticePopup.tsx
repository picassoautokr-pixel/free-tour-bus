"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const KAKAO_CHAT_URL = "https://open.kakao.com/o/sZJ2nnyi";
const NOTICE_DISMISSED_KEY = "notice_dismissed_date";

type NoticePopupProps = {
  onKakaoClick?: () => void;
};

export function NoticePopup({ onKakaoClick }: NoticePopupProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(NOTICE_DISMISSED_KEY);
      const today = new Date().toISOString().slice(0, 10);
      if (dismissed !== today) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  const handleClose = () => setOpen(false);

  const handleDismissToday = () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(NOTICE_DISMISSED_KEY, today);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    /* 배경 오버레이 */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={handleClose}
    >
      {/* 팝업 카드 */}
      <div
        className="relative flex max-h-[90dvh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* X 닫기 버튼 */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition hover:bg-slate-100 hover:text-slate-800 active:scale-95"
          aria-label="팝업 닫기"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="overflow-y-auto">
          {/* 공지 이미지 (버튼 영역 제외한 상단 내용) */}
          <Image
            src="/notice-popup.png"
            alt="후원사 할인 지원금 적용 대상 안내"
            width={941}
            height={1672}
            className="w-full"
            priority
          />

          {/* 하단 버튼 섹션 — HTML로 정확하게 구현 */}
          <div className="bg-white px-4 pb-5 pt-4">
            <p className="mb-3 text-center text-[0.9rem] font-bold text-slate-800">
              어떻게 진행하시겠어요?
            </p>

            {/* 후원사 할인 가능 여부 문의하기 — 파란 버튼 */}
            <a
              href={KAKAO_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                onKakaoClick?.();
                handleClose();
              }}
              className="mb-3 flex w-full items-center gap-3 rounded-xl bg-[#1D4ED8] px-4 py-3.5 text-white transition hover:bg-[#1e40af] active:scale-[0.98]"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* 말풍선 아이콘 */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                </svg>
              </span>
              <span className="flex-1 text-left">
                <span className="block text-[0.9rem] font-bold leading-snug">
                  후원사 할인 가능 여부 문의하기
                </span>
                <span className="block text-xs font-normal text-blue-200 mt-0.5">
                  적용 가능 여부를 확인해 드립니다.
                </span>
              </span>
              <svg className="h-4 w-4 shrink-0 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>

            {/* 일반 견적 문의하기 — 흰 버튼 */}
            <a
              href={KAKAO_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                onKakaoClick?.();
                handleClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-slate-800 transition hover:bg-slate-50 active:scale-[0.98]"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* 문서 아이콘 */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-5 w-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <span className="flex-1 text-left">
                <span className="block text-[0.9rem] font-bold leading-snug">
                  일반 견적 문의하기
                </span>
                <span className="block text-xs font-normal text-slate-400 mt-0.5">
                  할인 적용 없이 견적을 받아보세요.
                </span>
              </span>
              <svg className="h-4 w-4 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </a>

            <p className="mt-3 text-center text-[0.72rem] text-slate-400">
              보다 자세한 내용은 고객센터를 통해 문의해 주세요.
            </p>
          </div>
        </div>

        {/* 하단 버튼 바 */}
        <div className="flex shrink-0 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={handleDismissToday}
            className="flex-1 py-4 text-sm font-semibold text-slate-400 transition hover:bg-slate-50 active:bg-slate-100"
          >
            오늘 공지 그만보기
          </button>
          <div className="w-px self-stretch bg-slate-100" />
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 active:bg-slate-100"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
