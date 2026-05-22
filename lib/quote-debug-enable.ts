/**
 * 견적 계산 디버그 모드 — 환경/전역 플래그 (UTF-8)
 */

declare global {
  interface Window {
    DEBUG_QUOTE?: boolean;
  }
}

/** NEXT_PUBLIC_ENABLE_QUOTE_DEBUG=true 또는 window.DEBUG_QUOTE=true */
export function isQuoteDebugEnabled(): boolean {
  if (typeof window !== "undefined" && window.DEBUG_QUOTE === true) {
    return true;
  }
  return process.env.NEXT_PUBLIC_ENABLE_QUOTE_DEBUG === "true";
}
