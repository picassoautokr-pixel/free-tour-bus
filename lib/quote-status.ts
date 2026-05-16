export type QuoteStatusValue =
  | "collecting"
  | "extended_no_quotes"
  | "closed_by_time"
  | "closed_by_quote_count"
  | "closed_by_price"
  | "manually_closed"
  | "auto_selected"
  | "final_selected"
  | "contract_pending"
  | "completed"
  | string;

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  collecting: "지원금 견적 수집",
  extended_no_quotes: "지원금 조건 재수집",
  closed_by_time: "가승인 검토중",
  closed_by_quote_count: "가승인 검토중",
  closed_by_price: "목표가 도달",
  manually_closed: "관리자 검토중",
  auto_selected: "지원금 가승인",
  final_selected: "매칭 확정",
  contract_pending: "지원금 가승인",
  completed: "운행 준비 완료",
};

export function quoteStatusLabel(status: QuoteStatusValue | null | undefined): string {
  const key = (status ?? "collecting").trim() || "collecting";
  return QUOTE_STATUS_LABELS[key] ?? key;
}

export function formatDateTimeShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  const time = date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (isTomorrow) return `내일 ${time}`;
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatRemainingText(targetIso: string, nowMs = Date.now()): string | null {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return "곧 진행";
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

export function quoteCountdownText(params: {
  quoteStatus: string;
  quoteDeadlineAt?: string | null;
  autoFinalConfirmAt?: string | null;
  nowMs?: number;
}): string | null {
  const nowMs = params.nowMs ?? Date.now();
  if (
    ["collecting", "extended_no_quotes"].includes(params.quoteStatus) &&
    params.quoteDeadlineAt
  ) {
    const remaining = formatRemainingText(params.quoteDeadlineAt, nowMs);
    if (!remaining) return null;
    if (remaining === "곧 진행") return "가승인 검토 임박";
    if (/^\d+분$/.test(remaining)) return `가승인 검토 임박 ${remaining}`;
    return `가승인 검토까지 ${remaining}`;
  }

  if (params.quoteStatus === "auto_selected" && params.autoFinalConfirmAt) {
    const remaining = formatRemainingText(params.autoFinalConfirmAt, nowMs);
    if (!remaining) return null;
    if (remaining === "곧 진행") return "매칭 확정 임박";
    return `매칭 확정까지 ${remaining}`;
  }

  return null;
}

