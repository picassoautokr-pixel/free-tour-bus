/**
 * lib/sponsor-call-view-model.test.ts
 *
 * sponsor-call-view-model.ts 순수 함수 단위 테스트
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type SponsorCallRow,
  isSupportRejectedCall,
  isReviewCall,
  isConfirmedCall,
  matchesPayoutFilter,
  isMatchCompleted,
  matchStageLabel,
  departureTimestamp,
  formatUntilDeparture,
  payoutStatusLabel,
  formatWon,
  formatQuoteDeadline,
  formatQuoteCount,
  formatDepartureAt,
  displaySupportKind,
  displaySupportForm,
  displaySupportCondition,
  sponsorTabCounts,
} from "./sponsor-call-view-model";

// ─── 테스트용 최소 SponsorCallRow 팩토리 ─────────────────────────────────────
function makeCall(overrides: Partial<SponsorCallRow> = {}): SponsorCallRow {
  return {
    application_id: "app-1",
    departure: "서울",
    departure_date: "2099-12-31",
    departure_time: "09:00:00",
    passenger_count: 30,
    quote_count: 0,
    status: "review",
    ...overrides,
  } as SponsorCallRow;
}

// ─── isSupportRejectedCall ────────────────────────────────────────────────────
describe("isSupportRejectedCall", () => {
  // isSponsorSupportUnusedByNormalMatch 기반: 매칭 완료 + 일반견적가 선택 시 true
  it("매칭 미완료 → false", () => {
    assert.equal(isSupportRejectedCall(makeCall({ final_selected_quote_id: undefined })), false);
  });
  it("매칭 완료 + 일반견적가 이유 → true", () => {
    assert.equal(
      isSupportRejectedCall(makeCall({
        final_selected_quote_id: "q-1",
        matched_reason: "일반견적가 선택",
      })),
      true,
    );
  });
  it("매칭 완료 + 지원금 이유 → false", () => {
    assert.equal(
      isSupportRejectedCall(makeCall({
        final_selected_quote_id: "q-1",
        matched_reason: "지원금 적용",
      })),
      false,
    );
  });
});

// ─── isReviewCall ─────────────────────────────────────────────────────────────
describe("isReviewCall", () => {
  it("review 상태 → true", () => {
    assert.equal(isReviewCall(makeCall({ status: "review" })), true);
  });
  it("rejected 상태 → false (rejected 우선)", () => {
    assert.equal(isReviewCall(makeCall({ status: "rejected" })), false);
  });
  it("approved 상태 → false", () => {
    assert.equal(isReviewCall(makeCall({ status: "approved" })), false);
  });
});

// ─── isConfirmedCall ──────────────────────────────────────────────────────────
describe("isConfirmedCall", () => {
  it("approved 상태 → true", () => {
    assert.equal(isConfirmedCall(makeCall({ status: "approved" })), true);
  });
  it("review 상태 → false", () => {
    assert.equal(isConfirmedCall(makeCall({ status: "review" })), false);
  });
  it("rejected 상태 → false", () => {
    assert.equal(isConfirmedCall(makeCall({ status: "rejected" })), false);
  });
});

// ─── matchesPayoutFilter ──────────────────────────────────────────────────────
describe("matchesPayoutFilter", () => {
  it("all → 항상 true", () => {
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "processing" }), "all"), true);
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "completed" }), "all"), true);
  });
  it("completed → payout_status가 completed일 때만 true", () => {
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "completed" }), "completed"), true);
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "processing" }), "completed"), false);
  });
  it("processing → payout_status가 processing/pending일 때 true", () => {
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "processing" }), "processing"), true);
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "pending" }), "processing"), true);
    assert.equal(matchesPayoutFilter(makeCall({ payout_status: "completed" }), "processing"), false);
  });
});

// ─── isMatchCompleted ─────────────────────────────────────────────────────────
describe("isMatchCompleted", () => {
  it("final_selected_quote_id 있으면 true", () => {
    assert.equal(isMatchCompleted(makeCall({ final_selected_quote_id: "q-1" })), true);
  });
  it("없으면 false", () => {
    assert.equal(isMatchCompleted(makeCall({ final_selected_quote_id: undefined })), false);
  });
  it("빈 문자열이면 false", () => {
    assert.equal(isMatchCompleted(makeCall({ final_selected_quote_id: "  " })), false);
  });
});

// ─── matchStageLabel ──────────────────────────────────────────────────────────
describe("matchStageLabel", () => {
  it("매칭 완료 → 완료 레이블", () => {
    const label = matchStageLabel(makeCall({ final_selected_quote_id: "q-1" }));
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("견적 수집 중 → 수집 중 레이블", () => {
    const label = matchStageLabel(makeCall({ final_selected_quote_id: undefined }));
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("자동 마감 → 자동 마감 레이블", () => {
    const label = matchStageLabel(makeCall({
      final_selected_quote_id: undefined,
      quote_closed_at: "2000-01-01T00:00:00",
    }));
    assert.ok(typeof label === "string" && label.length > 0);
  });
});

// ─── departureTimestamp ───────────────────────────────────────────────────────
describe("departureTimestamp", () => {
  it("유효한 날짜+시간 → 숫자 반환", () => {
    const ts = departureTimestamp(makeCall({ departure_date: "2099-12-31", departure_time: "09:00:00" }));
    assert.ok(ts !== null && Number.isFinite(ts));
  });
  it("날짜 없으면 null", () => {
    assert.equal(departureTimestamp(makeCall({ departure_date: "" })), null);
  });
});

// ─── formatUntilDeparture ─────────────────────────────────────────────────────
describe("formatUntilDeparture", () => {
  it("미래 → '남음' 포함", () => {
    assert.ok(formatUntilDeparture(makeCall({ departure_date: "2099-12-31" })).includes("남음"));
  });
  it("과거 → '경과' 포함", () => {
    assert.ok(formatUntilDeparture(makeCall({ departure_date: "2000-01-01" })).includes("경과"));
  });
  it("날짜 없음 → 미확정", () => {
    assert.equal(formatUntilDeparture(makeCall({ departure_date: "" })), "미확정");
  });
});

// ─── payoutStatusLabel ────────────────────────────────────────────────────────
describe("payoutStatusLabel", () => {
  it("completed → 완료 레이블", () => {
    const label = payoutStatusLabel("completed");
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("processing → 처리 중 레이블", () => {
    const label = payoutStatusLabel("processing");
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("null → 미확정 레이블", () => {
    const label = payoutStatusLabel(null);
    assert.ok(typeof label === "string");
  });
});

// ─── formatWon ────────────────────────────────────────────────────────────────
describe("formatWon", () => {
  it("정상 금액 포맷", () => {
    assert.equal(formatWon(1200000), "1,200,000원");
  });
  it("null → 미확정", () => {
    assert.equal(formatWon(null), "미확정");
  });
  it("undefined → 미확정", () => {
    assert.equal(formatWon(undefined), "미확정");
  });
});

// ─── formatQuoteDeadline ──────────────────────────────────────────────────────
describe("formatQuoteDeadline", () => {
  it("미래 마감 → 시간 표시", () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const result = formatQuoteDeadline(future);
    assert.ok(result.includes("시간") || result.includes("분"), `unexpected: ${result}`);
  });
  it("과거 마감 → 마감됨", () => {
    assert.equal(formatQuoteDeadline("2000-01-01T00:00:00"), "마감됨");
  });
  it("undefined → 미확정", () => {
    assert.equal(formatQuoteDeadline(undefined), "미확정");
  });
});

// ─── formatQuoteCount ─────────────────────────────────────────────────────────
describe("formatQuoteCount", () => {
  it("limit 없으면 건수만", () => {
    assert.equal(formatQuoteCount(makeCall({ quote_count: 3, quote_limit_count: undefined })), "3건");
  });
  it("limit 있으면 분수 형태", () => {
    assert.equal(formatQuoteCount(makeCall({ quote_count: 2, quote_limit_count: 5 })), "2 / 5건");
  });
});

// ─── formatDepartureAt ────────────────────────────────────────────────────────
describe("formatDepartureAt", () => {
  it("날짜+시간 모두 있으면 합쳐서 반환", () => {
    const call = makeCall({ departure_date: "2099-12-31", departure_time: "09:00:00" });
    assert.equal(formatDepartureAt(call), "2099-12-31 09:00:00");
  });
  it("시간 없으면 날짜만", () => {
    const call = makeCall({ departure_date: "2099-12-31", departure_time: "" });
    assert.equal(formatDepartureAt(call), "2099-12-31");
  });
});

// ─── displaySupportKind ───────────────────────────────────────────────────────
describe("displaySupportKind", () => {
  it("support_kind 있으면 반환", () => {
    assert.equal(displaySupportKind(makeCall({ support_kind: "무료버스" })), "무료버스");
  });
  it("없으면 —", () => {
    assert.equal(displaySupportKind(makeCall({ support_kind: undefined })), "—");
  });
});

// ─── displaySupportForm ───────────────────────────────────────────────────────
describe("displaySupportForm", () => {
  it("support_form_kind 있으면 반환", () => {
    const result = displaySupportForm(makeCall({ support_form_kind: "direct" }));
    assert.ok(typeof result === "string" && result.length > 0);
  });
  it("없으면 —", () => {
    assert.equal(displaySupportForm(makeCall({ support_form_kind: undefined, support_type: undefined })), "—");
  });
});

// ─── displaySupportCondition ──────────────────────────────────────────────────
describe("displaySupportCondition", () => {
  it("support_condition_label 있으면 반환", () => {
    assert.equal(displaySupportCondition(makeCall({ support_condition_label: "조건A" })), "조건A");
  });
  it("없으면 —", () => {
    assert.equal(
      displaySupportCondition(makeCall({ support_condition_label: undefined, support_condition: undefined })),
      "—",
    );
  });
});

// ─── sponsorTabCounts ─────────────────────────────────────────────────────────
describe("sponsorTabCounts", () => {
  it("빈 배열 → 모두 0", () => {
    const counts = sponsorTabCounts([]);
    assert.equal(counts.review, 0);
    assert.equal(counts.confirmed, 0);
    assert.equal(counts.rejected, 0);
    assert.equal(counts.payoutAll, 0);
    assert.equal(counts.payoutProcessing, 0);
    assert.equal(counts.payoutCompleted, 0);
  });

  it("탭별 카운트 정확히 집계", () => {
    const calls: SponsorCallRow[] = [
      // review 탭: 매칭 미완료 + review 상태
      makeCall({ status: "review", final_selected_quote_id: undefined }),
      // confirmed 탭: 매칭 완료 + approved + 지원금 이유 (isSupportRejectedCall=false)
      makeCall({ status: "approved", final_selected_quote_id: "q-1", matched_reason: "지원금 적용", payout_status: "processing" }),
      // rejected 탭: 매칭 완료 + 일반견적가 이유 (isSupportRejectedCall=true)
      makeCall({ status: "approved", final_selected_quote_id: "q-2", matched_reason: "일반견적가 선택" }),
    ];
    const counts = sponsorTabCounts(calls);
    assert.equal(counts.review, 1, "review");
    assert.equal(counts.confirmed, 1, "confirmed");
    assert.equal(counts.rejected, 1, "rejected");
    assert.equal(counts.payoutAll, 1, "payoutAll");
    assert.equal(counts.payoutProcessing, 1, "payoutProcessing");
    assert.equal(counts.payoutCompleted, 0, "payoutCompleted");
  });
});
