/**
 * 어드민 신청 상세 — 고객/스폰서 단계 배지 (클라이언트 대시보드 기준, UTF-8)
 */

import {
  isSponsorConfirmed,
  normalizeSponsorStage,
  normalizeClientQuoteStage,
} from "@/lib/status-normalizer";

const AUTO_CLOSED_STATUSES = new Set([
  "auto_selected",
  "closed_by_time",
  "closed_by_quote_count",
  "closed_by_price",
  "manually_closed",
]);

const MATCHED_QUOTE_STATUSES = new Set([
  "final_selected",
  "contract_pending",
  "completed",
  "matched",
]);

export type CustomerStageBadge = "견적요청" | "자동마감" | "매칭완료";

export type SponsorStageBadge = "지원검토" | "지원확정" | "없음";

export function resolveCustomerStageBadge(params: {
  quoteStatus: string;
  finalSelectedQuoteId?: string;
}): CustomerStageBadge {
  const finalId = (params.finalSelectedQuoteId ?? "").trim();
  const status = (params.quoteStatus ?? "").trim();

  // finalSelectedQuoteId가 있으면 즉시 매칭완료
  if (finalId !== "") return "매칭완료";

  const normalized = normalizeClientQuoteStage(status);
  if (normalized === "matched" || normalized === "completed") return "매칭완료";

  // normalizer가 처리하지 못하는 레거시 AUTO_CLOSED_STATUSES 명시 지원
  if (AUTO_CLOSED_STATUSES.has(status)) return "자동마감";
  if (normalized === "auto_closed") return "자동마감";

  return "견적요청";
}

export function isCustomerStageMatched(params: {
  quoteStatus: string;
  finalSelectedQuoteId?: string;
}): boolean {
  return resolveCustomerStageBadge(params) === "매칭완료";
}

export function isSponsorStageConfirmed(status: string): boolean {
  return isSponsorConfirmed(status);
}

export function resolveSponsorStageBadge(status: string): SponsorStageBadge {
  const stage = normalizeSponsorStage(status);
  if (stage === "none") return "없음";
  if (stage === "confirmed") return "지원확정";
  return "지원검토";
}
