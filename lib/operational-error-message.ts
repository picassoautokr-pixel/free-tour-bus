/**
 * 운영 화면 API/DB 오류 메시지 정제 (UTF-8)
 */

import { isQuoteDebugEnabled } from "@/lib/quote-debug-enable";

const INTERNAL_DB_ERROR =
  /does not exist|42703|PGRST204|column .*|schema cache|could not find .* column/i;

export function isInternalDbError(message: string): boolean {
  return INTERNAL_DB_ERROR.test(message);
}

/** Postgres/스키마 오류는 운영 메시지로 대체, DEBUG에서는 원문을 함께 표시 */
export function sanitizeOperationalError(
  message: string,
  fallback = "견적 데이터를 불러오는 중 문제가 발생했습니다.",
): string {
  const trimmed = message.trim();
  if (trimmed === "") return fallback;
  if (trimmed === fallback) return fallback;
  if (trimmed.startsWith(`${fallback}\n`)) return trimmed;
  if (isInternalDbError(trimmed)) {
    return isQuoteDebugEnabled() ? `${fallback}\n${trimmed}` : fallback;
  }
  return isQuoteDebugEnabled() && trimmed !== fallback
    ? `${fallback}\n${trimmed}`
    : trimmed;
}
