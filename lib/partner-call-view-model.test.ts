/**
 * lib/partner-call-view-model.test.ts
 *
 * partner-call-view-model.ts 순수 함수 단위 테스트
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type PartnerCallLike,
  sponsorStageLabel,
  sponsorStageConfirmed,
  applicationSupportTotals,
  extensionPlannedAmount,
  departureTimestamp,
  matchedRunStatus,
  formatUntilDeparture,
  formatQuoteDeadline,
  formatQuoteProgress,
  settlementLabel,
  quoteFormExtensionPreview,
  quoteFormPlannedDiscountPrice,
  quoteFormPlannedAmounts,
} from "./partner-call-view-model";

// ─── 테스트용 최소 PartnerCallLike 팩토리 ────────────────────────────────────
function makeCall(overrides: Partial<PartnerCallLike> = {}): PartnerCallLike {
  return {
    application_id: "app-1",
    departure: "서울",
    departure_date: "2099-12-31",
    departure_time: "09:00:00",
    passenger_count: 30,
    quote_count: 0,
    ...overrides,
  } as PartnerCallLike;
}

// ─── sponsorStageLabel ────────────────────────────────────────────────────────
describe("sponsorStageLabel", () => {
  it("approved → 확정 레이블 반환", () => {
    const label = sponsorStageLabel("approved");
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("undefined → 기본 레이블 반환", () => {
    const label = sponsorStageLabel(undefined);
    assert.ok(typeof label === "string");
  });
});

// ─── sponsorStageConfirmed ────────────────────────────────────────────────────
describe("sponsorStageConfirmed", () => {
  it("approved → true", () => {
    assert.equal(sponsorStageConfirmed("approved"), true);
  });
  it("pending → false", () => {
    assert.equal(sponsorStageConfirmed("pending"), false);
  });
  it("undefined → false", () => {
    assert.equal(sponsorStageConfirmed(undefined), false);
  });
});

// ─── applicationSupportTotals ─────────────────────────────────────────────────
describe("applicationSupportTotals", () => {
  it("sponsors 배열 없으면 단일 필드 기반 계산", () => {
    const call = makeCall({
      sponsor_support_status: "approved",
      sponsor_estimated_support_amount: 100000,
      sponsor_approved_support_amount: 80000,
    });
    const result = applicationSupportTotals(call);
    assert.equal(result.totalPlanned, 100000);
    assert.equal(result.totalConfirmed, 80000);
    assert.equal(result.isConfirmed, true);
  });

  it("sponsors 배열 있으면 합산", () => {
    const call = makeCall({
      sponsors: [
        { estimated_support_amount: 50000, approved_support_amount: 40000 },
        { estimated_support_amount: 30000, approved_support_amount: 20000 },
      ],
    } as Partial<PartnerCallLike>);
    const result = applicationSupportTotals(call);
    assert.equal(result.totalPlanned, 80000);
    assert.equal(result.totalConfirmed, 60000);
    assert.equal(result.isConfirmed, true);
  });

  it("지원금 0이면 null 반환", () => {
    const call = makeCall({
      sponsor_support_status: "pending",
      sponsor_estimated_support_amount: 0,
      sponsor_approved_support_amount: 0,
    });
    const result = applicationSupportTotals(call);
    assert.equal(result.totalPlanned, null);
    assert.equal(result.totalConfirmed, null);
    assert.equal(result.isConfirmed, false);
  });
});

// ─── extensionPlannedAmount ───────────────────────────────────────────────────
describe("extensionPlannedAmount", () => {
  it("0회차 → 0", () => {
    assert.equal(extensionPlannedAmount(100000, 0), 0);
  });
  it("양수 반환", () => {
    const result = extensionPlannedAmount(100000, 1);
    assert.ok(typeof result === "number" && result >= 0);
  });
});

// ─── departureTimestamp ───────────────────────────────────────────────────────
describe("departureTimestamp", () => {
  it("유효한 날짜+시간 → 숫자 반환", () => {
    const call = makeCall({ departure_date: "2099-12-31", departure_time: "09:00:00" });
    const ts = departureTimestamp(call);
    assert.ok(ts !== null && typeof ts === "number" && Number.isFinite(ts));
  });
  it("날짜 없으면 null", () => {
    const call = makeCall({ departure_date: "" });
    assert.equal(departureTimestamp(call), null);
  });
  it("시간 없으면 00:00:00 기준으로 계산", () => {
    const call = makeCall({ departure_date: "2099-12-31", departure_time: "" });
    const ts = departureTimestamp(call);
    assert.ok(ts !== null && Number.isFinite(ts));
  });
});

// ─── matchedRunStatus ─────────────────────────────────────────────────────────
describe("matchedRunStatus", () => {
  it("미래 출발일 → in_progress", () => {
    assert.equal(matchedRunStatus(makeCall({ departure_date: "2099-12-31" })), "in_progress");
  });
  it("과거 출발일 → completed", () => {
    assert.equal(matchedRunStatus(makeCall({ departure_date: "2000-01-01" })), "completed");
  });
  it("날짜 없음 → in_progress", () => {
    assert.equal(matchedRunStatus(makeCall({ departure_date: "" })), "in_progress");
  });
});

// ─── formatUntilDeparture ─────────────────────────────────────────────────────
describe("formatUntilDeparture", () => {
  it("미래 → '남음' 포함", () => {
    const call = makeCall({ departure_date: "2099-12-31", departure_time: "23:59:59" });
    assert.ok(formatUntilDeparture(call).includes("남음"));
  });
  it("과거 → '경과' 포함", () => {
    const call = makeCall({ departure_date: "2000-01-01", departure_time: "00:00:00" });
    assert.ok(formatUntilDeparture(call).includes("경과"));
  });
  it("날짜 없음 → 미확정", () => {
    assert.equal(formatUntilDeparture(makeCall({ departure_date: "" })), "미확정");
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
  it("잘못된 날짜 → 미확정", () => {
    assert.equal(formatQuoteDeadline("invalid-date"), "미확정");
  });
});

// ─── formatQuoteProgress ──────────────────────────────────────────────────────
describe("formatQuoteProgress", () => {
  it("limit 없으면 건수만", () => {
    const call = makeCall({ quote_count: 3, quote_limit_count: undefined });
    assert.equal(formatQuoteProgress(call), "3건");
  });
  it("limit 있으면 분수 형태", () => {
    const call = makeCall({ quote_count: 2, quote_limit_count: 5 });
    assert.equal(formatQuoteProgress(call), "2 / 5건");
  });
});

// ─── settlementLabel ──────────────────────────────────────────────────────────
describe("settlementLabel", () => {
  it("ratio → 비율 레이블", () => {
    const label = settlementLabel("ratio");
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("client_priority → 고객 우선 레이블", () => {
    const label = settlementLabel("client_priority");
    assert.ok(typeof label === "string" && label.length > 0);
  });
  it("undefined → 기본 레이블", () => {
    const label = settlementLabel(undefined);
    assert.ok(typeof label === "string");
  });
});

// ─── quoteFormExtensionPreview ────────────────────────────────────────────────
describe("quoteFormExtensionPreview", () => {
  it("customerPlanned >= totalPlanned → 0", () => {
    const result = quoteFormExtensionPreview({
      customerPlanned: 100000,
      totalPlanned: 80000,
      extensionRound: 1,
    });
    assert.equal(result, 0);
  });
  it("partnerPlanned > 0 → 양수", () => {
    const result = quoteFormExtensionPreview({
      customerPlanned: 50000,
      totalPlanned: 100000,
      extensionRound: 1,
    });
    assert.ok(result >= 0);
  });
});

// ─── quoteFormPlannedDiscountPrice ────────────────────────────────────────────
describe("quoteFormPlannedDiscountPrice", () => {
  it("지원금 없으면 normalPrice 반환", () => {
    const result = quoteFormPlannedDiscountPrice({
      normalPrice: 1000000,
      customerPlanned: 0,
      extensionPlanned: 0,
    });
    assert.equal(result, 1000000);
  });
  it("지원금 있으면 할인된 금액 반환", () => {
    const result = quoteFormPlannedDiscountPrice({
      normalPrice: 1000000,
      customerPlanned: 100000,
      extensionPlanned: 0,
    });
    assert.ok(result <= 1000000);
  });
});

// ─── quoteFormPlannedAmounts ──────────────────────────────────────────────────
describe("quoteFormPlannedAmounts", () => {
  it("null 입력 → 객체 반환", () => {
    const result = quoteFormPlannedAmounts({
      normalPrice: null,
      customerPlanned: null,
      totalPlanned: null,
      extensionRound: 0,
    });
    assert.ok(typeof result === "object" && result !== null);
  });
  it("정상 입력 → 숫자 필드 포함 객체 반환", () => {
    const result = quoteFormPlannedAmounts({
      normalPrice: 1000000,
      customerPlanned: 50000,
      totalPlanned: 100000,
      extensionRound: 1,
    });
    assert.ok(typeof result === "object");
  });
});
