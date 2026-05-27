/**
 * 상태값 정규화 — 한글·영문·레거시 값을 내부 enum으로 통일 (UTF-8)
 *
 * 원칙:
 *   - DB 원본 값은 변경하지 않는다.
 *   - 코드 내 상태 비교는 이 파일의 normalize* 함수를 통해 수행한다.
 *   - 레거시 값도 모두 호환된다.
 */

// ─────────────────────────────────────────────
// 1. 스폰서 지원단계 (SponsorStage)
// ─────────────────────────────────────────────

export type NormalizedSponsorStage =
  | "none"
  | "review"
  | "confirmed"
  | "rejected"
  | "expired";

const SPONSOR_STAGE_CONFIRMED_VALUES = new Set([
  "approved",
  "confirmed",
  "지원확정",
]);

const SPONSOR_STAGE_REVIEW_VALUES = new Set([
  "preapproved",
  "review",
  "지원검토",
  "pending",
  "mixed",
]);

const SPONSOR_STAGE_REJECTED_VALUES = new Set([
  "rejected",
  "cancelled",
  "지원거절",
]);

const SPONSOR_STAGE_EXPIRED_VALUES = new Set([
  "expired",
  "만료",
]);

const SPONSOR_STAGE_NONE_VALUES = new Set([
  "",
  "none",
  "no_sponsor",
  "없음",
]);

const SPONSOR_STAGE_LABELS: Record<NormalizedSponsorStage, string> = {
  none: "미지원",
  review: "지원검토",
  confirmed: "지원확정",
  rejected: "지원거절",
  expired: "만료",
};

/**
 * 스폰서 지원단계 정규화.
 * DB 원본 sponsor_preapproval.status, applications.sponsor_support_status 등에서 읽은 값을 넘긴다.
 */
export function normalizeSponsorStage(
  raw: string | null | undefined,
): NormalizedSponsorStage {
  const s = (raw ?? "").trim().toLowerCase();

  if (SPONSOR_STAGE_NONE_VALUES.has(s)) return "none";
  if (SPONSOR_STAGE_CONFIRMED_VALUES.has(s)) return "confirmed";
  if (SPONSOR_STAGE_REVIEW_VALUES.has(s)) return "review";
  if (SPONSOR_STAGE_REJECTED_VALUES.has(s)) return "rejected";
  if (SPONSOR_STAGE_EXPIRED_VALUES.has(s)) return "expired";

  // 원본 한글값도 직접 대조
  const orig = (raw ?? "").trim();
  if (SPONSOR_STAGE_CONFIRMED_VALUES.has(orig)) return "confirmed";
  if (SPONSOR_STAGE_REVIEW_VALUES.has(orig)) return "review";
  if (SPONSOR_STAGE_REJECTED_VALUES.has(orig)) return "rejected";
  if (SPONSOR_STAGE_EXPIRED_VALUES.has(orig)) return "expired";

  // 값은 있지만 매핑 실패 → 검토 중으로 간주 (보수적)
  if (s !== "") return "review";
  return "none";
}

/** 스폰서 단계 표시 라벨 */
export function sponsorStageLabel(stage: NormalizedSponsorStage): string {
  return SPONSOR_STAGE_LABELS[stage];
}

/** raw 값에서 바로 라벨 반환 */
export function sponsorStageLabelFromRaw(raw: string | null | undefined): string {
  return SPONSOR_STAGE_LABELS[normalizeSponsorStage(raw)];
}

/** 지원확정 여부 */
export function isSponsorConfirmed(raw: string | null | undefined): boolean {
  return normalizeSponsorStage(raw) === "confirmed";
}

// ─────────────────────────────────────────────
// 2. 클라이언트 견적단계 (ClientQuoteStage)
// ─────────────────────────────────────────────

export type NormalizedClientQuoteStage =
  | "requesting"
  | "auto_closed"
  | "matched"
  | "completed"
  | "hidden";

const CLIENT_QUOTE_REQUESTING_VALUES = new Set([
  "collecting",
  "requesting",
  "quote_requesting",
  "견적요청중",
  "submitted",
  "extended_no_quotes",
]);

const CLIENT_QUOTE_AUTO_CLOSED_VALUES = new Set([
  "auto_closed",
  "closed",
  "자동마감",
  "auto_selected",
  "closed_by_time",
  "closed_by_quote_count",
  "closed_by_price",
  "manually_closed",
]);

const CLIENT_QUOTE_MATCHED_VALUES = new Set([
  "final_selected",
  "matched",
  "매칭완료",
  "contract_pending",
]);

const CLIENT_QUOTE_COMPLETED_VALUES = new Set([
  "completed",
  "done",
  "진행완료",
]);

const CLIENT_QUOTE_HIDDEN_VALUES = new Set([
  "hidden",
  "숨김",
]);

const CLIENT_QUOTE_STAGE_LABELS: Record<NormalizedClientQuoteStage, string> = {
  requesting: "견적요청중",
  auto_closed: "자동마감",
  matched: "매칭완료",
  completed: "진행완료",
  hidden: "숨김",
};

/**
 * 클라이언트 견적단계 정규화.
 * DB 원본 applications.quote_status 또는 유사 필드값을 넘긴다.
 */
export function normalizeClientQuoteStage(
  raw: string | null | undefined,
): NormalizedClientQuoteStage {
  const s = (raw ?? "").trim().toLowerCase();

  if (CLIENT_QUOTE_MATCHED_VALUES.has(s)) return "matched";
  if (CLIENT_QUOTE_COMPLETED_VALUES.has(s)) return "completed";
  if (CLIENT_QUOTE_AUTO_CLOSED_VALUES.has(s)) return "auto_closed";
  if (CLIENT_QUOTE_HIDDEN_VALUES.has(s)) return "hidden";
  if (CLIENT_QUOTE_REQUESTING_VALUES.has(s)) return "requesting";

  // 원본 한글값도 직접 대조
  const orig = (raw ?? "").trim();
  if (CLIENT_QUOTE_MATCHED_VALUES.has(orig)) return "matched";
  if (CLIENT_QUOTE_COMPLETED_VALUES.has(orig)) return "completed";
  if (CLIENT_QUOTE_AUTO_CLOSED_VALUES.has(orig)) return "auto_closed";
  if (CLIENT_QUOTE_HIDDEN_VALUES.has(orig)) return "hidden";
  if (CLIENT_QUOTE_REQUESTING_VALUES.has(orig)) return "requesting";

  return "requesting";
}

/** 클라이언트 견적단계 표시 라벨 */
export function clientQuoteStageLabel(stage: NormalizedClientQuoteStage): string {
  return CLIENT_QUOTE_STAGE_LABELS[stage];
}

/** raw 값에서 바로 라벨 반환 */
export function clientQuoteStageLabelFromRaw(raw: string | null | undefined): string {
  return CLIENT_QUOTE_STAGE_LABELS[normalizeClientQuoteStage(raw)];
}

/** 매칭완료 여부 (final_selected, matched, contract_pending, completed 포함) */
export function isClientQuoteMatched(raw: string | null | undefined): boolean {
  const stage = normalizeClientQuoteStage(raw);
  return stage === "matched" || stage === "completed";
}

// ─────────────────────────────────────────────
// 3. 파트너 견적단계 (PartnerQuoteStage)
// ─────────────────────────────────────────────

export type NormalizedPartnerQuoteStage =
  | "new"
  | "submitted"
  | "matched"
  | "completed";

const PARTNER_QUOTE_NEW_VALUES = new Set([
  "new",
  "신규견적",
]);

const PARTNER_QUOTE_SUBMITTED_VALUES = new Set([
  "submitted",
  "제출견적",
  "quote_submitted",
]);

const PARTNER_QUOTE_MATCHED_VALUES = new Set([
  "final_selected",
  "matched",
  "매칭성공",
  "contract_pending",
]);

const PARTNER_QUOTE_COMPLETED_VALUES = new Set([
  "completed",
  "진행완료",
  "done",
]);

const PARTNER_QUOTE_STAGE_LABELS: Record<NormalizedPartnerQuoteStage, string> = {
  new: "신규견적",
  submitted: "제출견적",
  matched: "매칭성공",
  completed: "진행완료",
};

/**
 * 파트너 견적단계 정규화.
 * DB 원본 driver_quotes.status 또는 유사 필드값을 넘긴다.
 */
export function normalizePartnerQuoteStage(
  raw: string | null | undefined,
): NormalizedPartnerQuoteStage {
  const s = (raw ?? "").trim().toLowerCase();

  if (PARTNER_QUOTE_COMPLETED_VALUES.has(s)) return "completed";
  if (PARTNER_QUOTE_MATCHED_VALUES.has(s)) return "matched";
  if (PARTNER_QUOTE_SUBMITTED_VALUES.has(s)) return "submitted";
  if (PARTNER_QUOTE_NEW_VALUES.has(s)) return "new";

  const orig = (raw ?? "").trim();
  if (PARTNER_QUOTE_COMPLETED_VALUES.has(orig)) return "completed";
  if (PARTNER_QUOTE_MATCHED_VALUES.has(orig)) return "matched";
  if (PARTNER_QUOTE_SUBMITTED_VALUES.has(orig)) return "submitted";
  if (PARTNER_QUOTE_NEW_VALUES.has(orig)) return "new";

  return "new";
}

/** 파트너 견적단계 표시 라벨 */
export function partnerQuoteStageLabel(stage: NormalizedPartnerQuoteStage): string {
  return PARTNER_QUOTE_STAGE_LABELS[stage];
}

/** raw 값에서 바로 라벨 반환 */
export function partnerQuoteStageLabelFromRaw(raw: string | null | undefined): string {
  return PARTNER_QUOTE_STAGE_LABELS[normalizePartnerQuoteStage(raw)];
}

// ─────────────────────────────────────────────
// 4. 선택 견적 타입 (SelectedPriceType)
// ─────────────────────────────────────────────

export type NormalizedSelectedPriceType =
  | "normal"
  | "support_planned"
  | "support_confirmed"
  | "unknown";

const SELECTED_PRICE_NORMAL_VALUES = new Set([
  "normal",
  "normal_selected",
  "normal_price_selected",
  "일반견적가",
  "일반견적",
]);

const SELECTED_PRICE_PLANNED_VALUES = new Set([
  "support_planned",
  "support_planned_selected",
  "지원금 할인 예정가",
  "지원금 할인 예상가",
]);

const SELECTED_PRICE_CONFIRMED_VALUES = new Set([
  "support_confirmed",
  "support_confirmed_selected",
  "support_price_selected",
  "지원금 할인 적용가",
  "지원금 할인 확정가",
]);

const SELECTED_PRICE_TYPE_LABELS: Record<NormalizedSelectedPriceType, string> = {
  normal: "일반견적가",
  support_planned: "지원금 할인 예정가",
  support_confirmed: "지원금 할인 적용가",
  unknown: "미확정",
};

/**
 * 선택 견적 타입 정규화.
 * selected_price_type, client_price_selection_kind, selected_price_label 등 원본값을 넘긴다.
 */
export function normalizeSelectedPriceType(
  raw: string | null | undefined,
): NormalizedSelectedPriceType {
  if (raw == null) return "unknown";
  const s = raw.trim();
  if (s === "") return "unknown";

  // 영문 소문자로 비교
  const lower = s.toLowerCase();
  if (SELECTED_PRICE_NORMAL_VALUES.has(lower)) return "normal";
  if (SELECTED_PRICE_PLANNED_VALUES.has(lower)) return "support_planned";
  if (SELECTED_PRICE_CONFIRMED_VALUES.has(lower)) return "support_confirmed";

  // 원본 그대로 한글 비교
  if (SELECTED_PRICE_NORMAL_VALUES.has(s)) return "normal";
  if (SELECTED_PRICE_PLANNED_VALUES.has(s)) return "support_planned";
  if (SELECTED_PRICE_CONFIRMED_VALUES.has(s)) return "support_confirmed";

  return "unknown";
}

/** 선택 견적 타입 표시 라벨 */
export function selectedPriceTypeLabel(type: NormalizedSelectedPriceType): string {
  return SELECTED_PRICE_TYPE_LABELS[type];
}

/** raw 값에서 바로 라벨 반환 */
export function selectedPriceTypeLabelFromRaw(raw: string | null | undefined): string {
  return SELECTED_PRICE_TYPE_LABELS[normalizeSelectedPriceType(raw)];
}
