"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 접근성용 제목 id (미지정 시 자동 생성) */
  titleId?: string;
  /** `aria-controls` 연결용 패널 id */
  panelId?: string;
  children: ReactNode;
};

/**
 * 하단 슬라이드업 패널 — 배경 딤, 바깥 클릭·ESC로 닫기, 닫힐 때 슬라이드 다운 애니메이션.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  titleId: titleIdProp,
  panelId,
  children,
}: BottomSheetProps) {
  const reactId = useId();
  const titleId = titleIdProp ?? `bottom-sheet-title-${reactId}`;
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [mounted, setMounted] = useState(open);

  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      const id = window.setTimeout(() => setMounted(false), 280);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  useEffect(() => {
    if (!open || !mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mounted, onClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    closeBtnRef.current?.focus();
  }, [open, mounted]);

  const onBackdropPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[90] flex flex-col justify-end transition-opacity duration-300 ease-out ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      role="presentation"
    >
      <div
        className={`absolute inset-0 z-0 bg-slate-900/45 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onPointerDown={onBackdropPointerDown}
        aria-hidden={!open}
      />

      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 mx-auto w-full max-w-lg rounded-t-[1.75rem] bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/80 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-4">
          <div className="min-w-0 pt-1">
            <div
              className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden"
              aria-hidden
            />
            <h2
              id={titleId}
              className="text-lg font-black tracking-[-0.04em] text-slate-950"
            >
              {title}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="touch-manipulation shrink-0 rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="상담 메뉴 닫기"
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

        <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
