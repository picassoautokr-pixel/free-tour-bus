"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const KAKAO_CHAT_URL = "https://open.kakao.com/o/sZJ2nnyi";
const NOTICE_DISMISSED_KEY = "notice_dismissed_date";

/**
 * 이미지 크기: 941 x 1672
 *
 * 픽셀 색상 분석 결과:
 *   파란 버튼 ("후원사 할인 가능 여부 문의하기"):
 *     top: 76.9%  bottom: 84.5%  left: 8.2%  right: 91.7%
 *   흰 버튼 ("일반 견적 문의하기"):
 *     top: 85.9%  bottom: 93.8%  left: 8.2%  right: 91.7%
 */

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
    /* 배경 오버레이 — 클릭 시 닫기 */
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
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition hover:bg-slate-100 hover:text-slate-800 active:scale-95"
          aria-label="팝업 닫기"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 스크롤 가능한 이미지 영역 */}
        <div className="overflow-y-auto">
          {/* 이미지 + 투명 클릭 오버레이를 담는 relative 컨테이너 */}
          <div className="relative w-full">
            <Image
              src="/notice-popup.png"
              alt="후원사 할인 지원금 적용 대상 안내"
              width={941}
              height={1672}
              className="w-full block"
              priority
            />

            {/*
              파란 버튼 오버레이
              top: 76.9%, height: 7.6% (84.5% - 76.9%)
              left: 8.2%, right: 8.3% (100% - 91.7%)
            */}
            <a
              href={KAKAO_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                onKakaoClick?.();
                handleClose();
              }}
              className="absolute cursor-pointer rounded-xl"
              style={{
                top: "76.9%",
                height: "7.6%",
                left: "8.2%",
                right: "8.3%",
              }}
              aria-label="후원사 할인 가능 여부 카카오톡 문의하기"
            />

            {/*
              흰 버튼 오버레이 — 홈스크린으로 이동
              top: 85.9%, height: 7.9% (93.8% - 85.9%)
              left: 8.2%, right: 8.3%
            */}
            <button
              type="button"
              onClick={handleClose}
              className="absolute cursor-pointer rounded-xl"
              style={{
                top: "85.9%",
                height: "7.9%",
                left: "8.2%",
                right: "8.3%",
              }}
              aria-label="일반 견적 문의하기 - 팝업 닫기"
            />
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
