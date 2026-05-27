import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSponsorStage,
  isSponsorConfirmed,
  sponsorStageLabel,
  sponsorStageLabelFromRaw,
  normalizeClientQuoteStage,
  isClientQuoteMatched,
  clientQuoteStageLabel,
  normalizePartnerQuoteStage,
  partnerQuoteStageLabel,
  normalizeSelectedPriceType,
  selectedPriceTypeLabel,
} from "@/lib/status-normalizer";

// ─────────────────────────────────────────────
// 1. 스폰서 지원단계 (NormalizedSponsorStage)
// ─────────────────────────────────────────────

test("normalizeSponsorStage — confirmed 변환", () => {
  assert.equal(normalizeSponsorStage("approved"), "confirmed");
  assert.equal(normalizeSponsorStage("confirmed"), "confirmed");
  assert.equal(normalizeSponsorStage("지원확정"), "confirmed");
  assert.equal(normalizeSponsorStage("APPROVED"), "confirmed");
});

test("normalizeSponsorStage — review 변환", () => {
  assert.equal(normalizeSponsorStage("preapproved"), "review");
  assert.equal(normalizeSponsorStage("pending"), "review");
  assert.equal(normalizeSponsorStage("mixed"), "review");
  assert.equal(normalizeSponsorStage("지원검토"), "review");
  assert.equal(normalizeSponsorStage("review"), "review");
});

test("normalizeSponsorStage — rejected 변환", () => {
  assert.equal(normalizeSponsorStage("rejected"), "rejected");
  assert.equal(normalizeSponsorStage("cancelled"), "rejected");
  assert.equal(normalizeSponsorStage("지원거절"), "rejected");
});

test("normalizeSponsorStage — expired 변환", () => {
  assert.equal(normalizeSponsorStage("expired"), "expired");
  assert.equal(normalizeSponsorStage("만료"), "expired");
});

test("normalizeSponsorStage — none 변환", () => {
  assert.equal(normalizeSponsorStage(null), "none");
  assert.equal(normalizeSponsorStage(undefined), "none");
  assert.equal(normalizeSponsorStage(""), "none");
  assert.equal(normalizeSponsorStage("none"), "none");
});

test("isSponsorConfirmed", () => {
  assert.equal(isSponsorConfirmed("approved"), true);
  assert.equal(isSponsorConfirmed("confirmed"), true);
  assert.equal(isSponsorConfirmed("지원확정"), true);
  assert.equal(isSponsorConfirmed("preapproved"), false);
  assert.equal(isSponsorConfirmed("pending"), false);
  assert.equal(isSponsorConfirmed(null), false);
  assert.equal(isSponsorConfirmed(""), false);
});

test("sponsorStageLabel", () => {
  assert.equal(sponsorStageLabel("confirmed"), "지원확정");
  assert.equal(sponsorStageLabel("review"), "지원검토");
  assert.equal(sponsorStageLabel("none"), "미지원");
  assert.equal(sponsorStageLabel("rejected"), "지원거절");
  assert.equal(sponsorStageLabel("expired"), "만료");
});

test("sponsorStageLabelFromRaw — legacy 영문/한글 모두 정상 라벨 반환", () => {
  assert.equal(sponsorStageLabelFromRaw("approved"), "지원확정");
  assert.equal(sponsorStageLabelFromRaw("preapproved"), "지원검토");
  assert.equal(sponsorStageLabelFromRaw("지원확정"), "지원확정");
  assert.equal(sponsorStageLabelFromRaw(null), "미지원");
});

// ─────────────────────────────────────────────
// 2. 클라이언트 견적단계 (NormalizedClientQuoteStage)
// ─────────────────────────────────────────────

test("normalizeClientQuoteStage — requesting 변환", () => {
  assert.equal(normalizeClientQuoteStage("collecting"), "requesting");
  assert.equal(normalizeClientQuoteStage("submitted"), "requesting");
  assert.equal(normalizeClientQuoteStage("견적요청중"), "requesting");
  assert.equal(normalizeClientQuoteStage("extended_no_quotes"), "requesting");
});

test("normalizeClientQuoteStage — auto_closed 변환", () => {
  assert.equal(normalizeClientQuoteStage("auto_selected"), "auto_closed");
  assert.equal(normalizeClientQuoteStage("closed_by_time"), "auto_closed");
  assert.equal(normalizeClientQuoteStage("manually_closed"), "auto_closed");
  assert.equal(normalizeClientQuoteStage("자동마감"), "auto_closed");
});

test("normalizeClientQuoteStage — matched 변환", () => {
  assert.equal(normalizeClientQuoteStage("final_selected"), "matched");
  assert.equal(normalizeClientQuoteStage("matched"), "matched");
  assert.equal(normalizeClientQuoteStage("contract_pending"), "matched");
  assert.equal(normalizeClientQuoteStage("매칭완료"), "matched");
});

test("normalizeClientQuoteStage — completed 변환", () => {
  assert.equal(normalizeClientQuoteStage("completed"), "completed");
  assert.equal(normalizeClientQuoteStage("진행완료"), "completed");
});

test("isClientQuoteMatched — final_selected/completed 모두 true", () => {
  assert.equal(isClientQuoteMatched("final_selected"), true);
  assert.equal(isClientQuoteMatched("completed"), true);
  assert.equal(isClientQuoteMatched("contract_pending"), true);
  assert.equal(isClientQuoteMatched("collecting"), false);
  assert.equal(isClientQuoteMatched("auto_selected"), false);
});

test("clientQuoteStageLabel", () => {
  assert.equal(clientQuoteStageLabel("requesting"), "견적요청중");
  assert.equal(clientQuoteStageLabel("auto_closed"), "자동마감");
  assert.equal(clientQuoteStageLabel("matched"), "매칭완료");
  assert.equal(clientQuoteStageLabel("completed"), "진행완료");
  assert.equal(clientQuoteStageLabel("hidden"), "숨김");
});

// ─────────────────────────────────────────────
// 3. 파트너 견적단계 (NormalizedPartnerQuoteStage)
// ─────────────────────────────────────────────

test("normalizePartnerQuoteStage — 각 단계 변환", () => {
  assert.equal(normalizePartnerQuoteStage("new"), "new");
  assert.equal(normalizePartnerQuoteStage("신규견적"), "new");
  assert.equal(normalizePartnerQuoteStage("submitted"), "submitted");
  assert.equal(normalizePartnerQuoteStage("제출견적"), "submitted");
  assert.equal(normalizePartnerQuoteStage("final_selected"), "matched");
  assert.equal(normalizePartnerQuoteStage("매칭성공"), "matched");
  assert.equal(normalizePartnerQuoteStage("completed"), "completed");
  assert.equal(normalizePartnerQuoteStage("진행완료"), "completed");
});

test("partnerQuoteStageLabel", () => {
  assert.equal(partnerQuoteStageLabel("new"), "신규견적");
  assert.equal(partnerQuoteStageLabel("submitted"), "제출견적");
  assert.equal(partnerQuoteStageLabel("matched"), "매칭성공");
  assert.equal(partnerQuoteStageLabel("completed"), "진행완료");
});

// ─────────────────────────────────────────────
// 4. 선택 견적 타입 (NormalizedSelectedPriceType)
// ─────────────────────────────────────────────

test("normalizeSelectedPriceType — normal 변환", () => {
  assert.equal(normalizeSelectedPriceType("normal"), "normal");
  assert.equal(normalizeSelectedPriceType("normal_selected"), "normal");
  assert.equal(normalizeSelectedPriceType("normal_price_selected"), "normal");
  assert.equal(normalizeSelectedPriceType("일반견적가"), "normal");
  assert.equal(normalizeSelectedPriceType("일반견적"), "normal");
});

test("normalizeSelectedPriceType — support_planned 변환", () => {
  assert.equal(normalizeSelectedPriceType("support_planned"), "support_planned");
  assert.equal(normalizeSelectedPriceType("support_planned_selected"), "support_planned");
  assert.equal(normalizeSelectedPriceType("지원금 할인 예정가"), "support_planned");
  assert.equal(normalizeSelectedPriceType("지원금 할인 예상가"), "support_planned");
});

test("normalizeSelectedPriceType — support_confirmed 변환", () => {
  assert.equal(normalizeSelectedPriceType("support_confirmed"), "support_confirmed");
  assert.equal(normalizeSelectedPriceType("support_confirmed_selected"), "support_confirmed");
  assert.equal(normalizeSelectedPriceType("support_price_selected"), "support_confirmed");
  assert.equal(normalizeSelectedPriceType("지원금 할인 적용가"), "support_confirmed");
  assert.equal(normalizeSelectedPriceType("지원금 할인 확정가"), "support_confirmed");
});

test("normalizeSelectedPriceType — unknown 변환", () => {
  assert.equal(normalizeSelectedPriceType(null), "unknown");
  assert.equal(normalizeSelectedPriceType(undefined), "unknown");
  assert.equal(normalizeSelectedPriceType(""), "unknown");
  assert.equal(normalizeSelectedPriceType("unrecognized"), "unknown");
});

test("selectedPriceTypeLabel", () => {
  assert.equal(selectedPriceTypeLabel("normal"), "일반견적가");
  assert.equal(selectedPriceTypeLabel("support_planned"), "지원금 할인 예정가");
  assert.equal(selectedPriceTypeLabel("support_confirmed"), "지원금 할인 적용가");
  assert.equal(selectedPriceTypeLabel("unknown"), "미확정");
});
