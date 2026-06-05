/**
 * lib/client-application-view-model.test.ts
 *
 * client-application-view-model.ts 순수 함수 단위 테스트
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ClientApplication,
  type ClientQuote,
  isMatchedApplication,
  clientApplicationTab,
  matchedRunStatus,
  applicationTypeLabel,
  formatWon,
  formatDepartureAt,
  formatQuoteDeadlineRemaining,
  isOneWayTrip,
  isRoundTrip,
  formatReturnDate,
  formatGroupType,
  formatOrganizationName,
  formatAutoCloseRemainingCount,
  formatQuoteCount,
  clientTabCounts,
  sortClientApplications,
} from "./client-application-view-model";

// ─── 테스트용 최소 ClientApplication 팩토리 ───────────────────────────────────
function makeApp(overrides: Partial<ClientApplication> = {}): ClientApplication {
  return {
    id: "app-1",
    departure: "서울",
    departure_date: "2099-12-31",
    departure_time: "09:00:00",
    passenger_count: 30,
    quote_status: "quote_collecting",
    ...overrides,
  } as ClientApplication;
}

// ─── isMatchedApplication ─────────────────────────────────────────────────────
describe("isMatchedApplication", () => {
  it("final_selected_quote_id가 있으면 true", () => {
    assert.equal(isMatchedApplication(makeApp({ final_selected_quote_id: "q-1" })), true);
  });
  it("final_selected_quote_id가 없으면 false", () => {
    assert.equal(isMatchedApplication(makeApp({ final_selected_quote_id: undefined })), false);
  });
  it("빈 문자열이면 false", () => {
    assert.equal(isMatchedApplication(makeApp({ final_selected_quote_id: "  " })), false);
  });
});

// ─── clientApplicationTab ─────────────────────────────────────────────────────
describe("clientApplicationTab", () => {
  it("매칭 완료 → matched", () => {
    assert.equal(clientApplicationTab(makeApp({ final_selected_quote_id: "q-1" })), "matched");
  });
  it("auto_closed 상태 → auto_closed", () => {
    assert.equal(clientApplicationTab(makeApp({ quote_status: "closed_by_time" })), "auto_closed");
  });
  it("일반 수집 중 → requesting", () => {
    assert.equal(clientApplicationTab(makeApp({ quote_status: "quote_collecting" })), "requesting");
  });
});

// ─── matchedRunStatus ─────────────────────────────────────────────────────────
describe("matchedRunStatus", () => {
  it("출발일이 미래 → in_progress", () => {
    assert.equal(matchedRunStatus(makeApp({ departure_date: "2099-12-31" })), "in_progress");
  });
  it("출발일이 과거 → completed", () => {
    assert.equal(matchedRunStatus(makeApp({ departure_date: "2000-01-01" })), "completed");
  });
  it("출발일 없음 → in_progress", () => {
    assert.equal(matchedRunStatus(makeApp({ departure_date: undefined })), "in_progress");
  });
});

// ─── applicationTypeLabel ─────────────────────────────────────────────────────
describe("applicationTypeLabel", () => {
  it("'타사' 포함 → 타사견적", () => {
    assert.equal(applicationTypeLabel("타사 버스"), "타사견적");
  });
  it("'기존' 포함 → 타사견적", () => {
    assert.equal(applicationTypeLabel("기존 업체"), "타사견적");
  });
  it("그 외 → 신규견적", () => {
    assert.equal(applicationTypeLabel("신규"), "신규견적");
  });
  it("undefined → 신규견적", () => {
    assert.equal(applicationTypeLabel(undefined), "신규견적");
  });
});

// ─── formatWon ────────────────────────────────────────────────────────────────
describe("formatWon", () => {
  it("정상 금액 포맷", () => {
    assert.equal(formatWon(1200000), "1,200,000원");
  });
  it("0원 포맷", () => {
    assert.equal(formatWon(0), "0원");
  });
  it("null → 미확정", () => {
    assert.equal(formatWon(null), "미확정");
  });
  it("undefined → 미확정", () => {
    assert.equal(formatWon(undefined), "미확정");
  });
});

// ─── formatDepartureAt ────────────────────────────────────────────────────────
describe("formatDepartureAt", () => {
  it("날짜+시간 모두 있으면 합쳐서 반환", () => {
    const app = makeApp({ departure_date: "2099-12-31", departure_time: "09:00:00" });
    assert.equal(formatDepartureAt(app), "2099-12-31 09:00:00");
  });
  it("시간이 없으면 날짜만 반환", () => {
    const app = makeApp({ departure_date: "2099-12-31", departure_time: undefined });
    assert.equal(formatDepartureAt(app), "2099-12-31");
  });
  it("날짜도 없으면 미확정", () => {
    const app = makeApp({ departure_date: undefined, departure_time: undefined });
    assert.equal(formatDepartureAt(app), "미확정");
  });
});

// ─── formatQuoteDeadlineRemaining ─────────────────────────────────────────────
describe("formatQuoteDeadlineRemaining", () => {
  it("빈 문자열 → 미확정", () => {
    assert.equal(formatQuoteDeadlineRemaining(""), "미확정");
  });
  it("undefined → 미확정", () => {
    assert.equal(formatQuoteDeadlineRemaining(undefined), "미확정");
  });
  it("과거 시각 → 마감됨 또는 마감 임박", () => {
    const result = formatQuoteDeadlineRemaining("2000-01-01T00:00:00");
    assert.ok(result === "마감됨" || result === "미확정" || result === "마감 임박", `unexpected: ${result}`);
  });
});

// ─── isOneWayTrip / isRoundTrip ───────────────────────────────────────────────
describe("isOneWayTrip", () => {
  it("'편도' → true", () => { assert.equal(isOneWayTrip("편도"), true); });
  it("'왕복' → false", () => { assert.equal(isOneWayTrip("왕복"), false); });
  it("undefined → false", () => { assert.equal(isOneWayTrip(undefined), false); });
});

describe("isRoundTrip", () => {
  it("'왕복' → true", () => { assert.equal(isRoundTrip("왕복"), true); });
  it("'편도' → false", () => { assert.equal(isRoundTrip("편도"), false); });
  it("undefined → false", () => { assert.equal(isRoundTrip(undefined), false); });
});

// ─── formatReturnDate ─────────────────────────────────────────────────────────
describe("formatReturnDate", () => {
  it("편도 여행 → 해당 없음", () => {
    const app = makeApp({ trip_type: "편도" });
    assert.equal(formatReturnDate(app), "해당 없음");
  });
  it("왕복 + 복귀일 있음 → 날짜 반환", () => {
    const app = makeApp({ trip_type: "왕복", return_date: "2099-12-31" });
    assert.equal(formatReturnDate(app), "2099-12-31");
  });
  it("왕복 + 복귀일 없음 → 미확정", () => {
    const app = makeApp({ trip_type: "왕복", return_date: undefined });
    assert.equal(formatReturnDate(app), "미확정");
  });
});

// ─── formatGroupType ──────────────────────────────────────────────────────────
describe("formatGroupType", () => {
  it("organization_type 있으면 반환", () => {
    const app = makeApp({ organization_type: "학교" });
    const result = formatGroupType(app);
    assert.ok(typeof result === "string" && result.length > 0);
  });
  it("모두 없으면 —", () => {
    const app = makeApp({ organization_type: undefined });
    assert.equal(formatGroupType(app), "—");
  });
});

// ─── formatOrganizationName ───────────────────────────────────────────────────
describe("formatOrganizationName", () => {
  it("organization_name 있으면 반환", () => {
    const app = makeApp({ organization_name: "○○초등학교" });
    assert.equal(formatOrganizationName(app), "○○초등학교");
  });
  it("없으면 —", () => {
    const app = makeApp({ organization_name: undefined });
    assert.equal(formatOrganizationName(app), "—");
  });
});

// ─── formatAutoCloseRemainingCount ────────────────────────────────────────────
describe("formatAutoCloseRemainingCount", () => {
  it("quote_limit_count 없으면 —", () => {
    const app = makeApp({ quote_limit_count: undefined });
    assert.equal(formatAutoCloseRemainingCount(app), "—");
  });
  it("남은 건수 계산", () => {
    const app = makeApp({ quote_limit_count: 5, quote_count: 3 });
    assert.equal(formatAutoCloseRemainingCount(app), "2건 남음");
  });
  it("초과해도 0건 남음", () => {
    const app = makeApp({ quote_limit_count: 3, quote_count: 5 });
    assert.equal(formatAutoCloseRemainingCount(app), "0건 남음");
  });
});

// ─── formatQuoteCount ─────────────────────────────────────────────────────────
describe("formatQuoteCount", () => {
  it("limit 없으면 건수만", () => {
    const app = makeApp({ quote_count: 4, quote_limit_count: undefined });
    assert.equal(formatQuoteCount(app), "4건");
  });
  it("limit 있으면 분수 형태", () => {
    const app = makeApp({ quote_count: 2, quote_limit_count: 5 });
    assert.equal(formatQuoteCount(app), "2 / 5건");
  });
});

// ─── clientTabCounts ──────────────────────────────────────────────────────────
describe("clientTabCounts", () => {
  it("빈 배열 → 모두 0", () => {
    const counts = clientTabCounts([]);
    assert.deepEqual(counts, {
      requesting: 0,
      autoClosed: 0,
      matched: 0,
      matchedInProgress: 0,
      matchedCompleted: 0,
    });
  });
  it("탭별 카운트 정확히 집계", () => {
    const apps: ClientApplication[] = [
      makeApp({ quote_status: "quote_collecting" }),
      makeApp({ quote_status: "closed_by_time" }),
      makeApp({ final_selected_quote_id: "q-1", departure_date: "2099-12-31" }),
      makeApp({ final_selected_quote_id: "q-2", departure_date: "2000-01-01" }),
    ];
    const counts = clientTabCounts(apps);
    assert.equal(counts.requesting, 1);
    assert.equal(counts.autoClosed, 1, "autoClosed");
    assert.equal(counts.matched, 2);
    assert.equal(counts.matchedInProgress, 1);
    assert.equal(counts.matchedCompleted, 1);
  });
});

// ─── sortClientApplications ───────────────────────────────────────────────────
describe("sortClientApplications", () => {
  it("deadline 정렬 — 마감 임박 순", () => {
    const apps: ClientApplication[] = [
      makeApp({ id: "b", quote_deadline_at: "2099-12-31T00:00:00" }),
      makeApp({ id: "a", quote_deadline_at: "2099-01-01T00:00:00" }),
    ];
    const sorted = sortClientApplications(apps, "deadline");
    assert.equal(sorted[0].id, "a");
  });
  it("quotes 정렬 — 견적 많은 순", () => {
    const apps: ClientApplication[] = [
      makeApp({ id: "a", quote_count: 2 }),
      makeApp({ id: "b", quote_count: 5 }),
    ];
    const sorted = sortClientApplications(apps, "quotes");
    assert.equal(sorted[0].id, "b");
  });
  it("passengers 정렬 — 탑승인원 많은 순", () => {
    const apps: ClientApplication[] = [
      makeApp({ id: "a", passenger_count: 20 }),
      makeApp({ id: "b", passenger_count: 50 }),
    ];
    const sorted = sortClientApplications(apps, "passengers");
    assert.equal(sorted[0].id, "b");
  });
});
