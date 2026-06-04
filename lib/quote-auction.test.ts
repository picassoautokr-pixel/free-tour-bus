import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_BUSINESS_START_TIME,
  DEFAULT_BUSINESS_END_TIME,
  DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES,
  DEFAULT_QUOTE_AUTOMATION_TIMEZONE,
  QUOTE_NO_QUOTES_EXTENSION_HOURS,
  QUOTE_MAX_EXTENSION_ROUNDS,
  isWithinBusinessHours,
  nextBusinessStartAt,
  calculateAutoFinalConfirmAt,
  isApplicationQuoteAccepting,
  supportRewardRatios,
  supportRewardAmounts,
  quoteLifecycleSelectColumns,
  type QuoteAutomationSettings,
} from "./quote-auction";

// ---------------------------------------------------------------------------
// 공통 설정 헬퍼
// ---------------------------------------------------------------------------

const defaultSettings: QuoteAutomationSettings = {
  business_start_time: DEFAULT_BUSINESS_START_TIME,
  business_end_time: DEFAULT_BUSINESS_END_TIME,
  auto_final_confirm_delay_minutes: DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES,
  timezone: DEFAULT_QUOTE_AUTOMATION_TIMEZONE,
};

/** KST(UTC+9) 기준 날짜/시간으로 UTC Date를 생성 */
function kstDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hours - 9, minutes));
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

describe("상수 값 검증", () => {
  it("DEFAULT_BUSINESS_START_TIME은 09:00", () => {
    assert.equal(DEFAULT_BUSINESS_START_TIME, "09:00");
  });
  it("DEFAULT_BUSINESS_END_TIME은 18:00", () => {
    assert.equal(DEFAULT_BUSINESS_END_TIME, "18:00");
  });
  it("DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES는 30", () => {
    assert.equal(DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES, 30);
  });
  it("DEFAULT_QUOTE_AUTOMATION_TIMEZONE은 Asia/Seoul", () => {
    assert.equal(DEFAULT_QUOTE_AUTOMATION_TIMEZONE, "Asia/Seoul");
  });
  it("QUOTE_NO_QUOTES_EXTENSION_HOURS는 12", () => {
    assert.equal(QUOTE_NO_QUOTES_EXTENSION_HOURS, 12);
  });
  it("QUOTE_MAX_EXTENSION_ROUNDS는 6", () => {
    assert.equal(QUOTE_MAX_EXTENSION_ROUNDS, 6);
  });
});

// ---------------------------------------------------------------------------
// isWithinBusinessHours
// ---------------------------------------------------------------------------

describe("isWithinBusinessHours", () => {
  it("업무 시간 내(10:00 KST)이면 true를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 10, 0);
    assert.equal(isWithinBusinessHours(date, defaultSettings), true);
  });

  it("업무 시작 시각 정각(09:00 KST)이면 true를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 9, 0);
    assert.equal(isWithinBusinessHours(date, defaultSettings), true);
  });

  it("업무 종료 시각 정각(18:00 KST)이면 false를 반환한다 (반열린 구간)", () => {
    const date = kstDate(2025, 6, 1, 18, 0);
    assert.equal(isWithinBusinessHours(date, defaultSettings), false);
  });

  it("업무 시간 전(08:59 KST)이면 false를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 8, 59);
    assert.equal(isWithinBusinessHours(date, defaultSettings), false);
  });

  it("업무 시간 후(20:00 KST)이면 false를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 20, 0);
    assert.equal(isWithinBusinessHours(date, defaultSettings), false);
  });

  it("잘못된 시간 설정(start >= end)이면 항상 true를 반환한다", () => {
    const badSettings: QuoteAutomationSettings = {
      ...defaultSettings,
      business_start_time: "18:00",
      business_end_time: "09:00",
    };
    const date = kstDate(2025, 6, 1, 3, 0);
    assert.equal(isWithinBusinessHours(date, badSettings), true);
  });

  it("커스텀 업무 시간(10:00~17:00) 내에서 동작한다", () => {
    const customSettings: QuoteAutomationSettings = {
      ...defaultSettings,
      business_start_time: "10:00",
      business_end_time: "17:00",
    };
    assert.equal(isWithinBusinessHours(kstDate(2025, 6, 1, 13, 0), customSettings), true);
    assert.equal(isWithinBusinessHours(kstDate(2025, 6, 1, 9, 59), customSettings), false);
    assert.equal(isWithinBusinessHours(kstDate(2025, 6, 1, 17, 0), customSettings), false);
  });
});

// ---------------------------------------------------------------------------
// nextBusinessStartAt
// ---------------------------------------------------------------------------

describe("nextBusinessStartAt", () => {
  it("업무 시간 전(08:00 KST)이면 당일 09:00 KST를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 8, 0);
    const result = nextBusinessStartAt(date, defaultSettings);
    const resultKst = new Date(result.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 9);
    assert.equal(resultKst.getUTCMinutes(), 0);
    assert.equal(resultKst.getUTCDate(), 1);
  });

  it("업무 시간 중(10:00 KST)이면 다음날 09:00 KST를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 10, 0);
    const result = nextBusinessStartAt(date, defaultSettings);
    const resultKst = new Date(result.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 9);
    assert.equal(resultKst.getUTCMinutes(), 0);
    assert.equal(resultKst.getUTCDate(), 2);
  });

  it("업무 시간 후(20:00 KST)이면 다음날 09:00 KST를 반환한다", () => {
    const date = kstDate(2025, 6, 1, 20, 0);
    const result = nextBusinessStartAt(date, defaultSettings);
    const resultKst = new Date(result.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 9);
    assert.equal(resultKst.getUTCMinutes(), 0);
    assert.equal(resultKst.getUTCDate(), 2);
  });

  it("잘못된 start_time은 기본값(09:00)으로 대체되어 정상 동작한다", () => {
    // normalizedSettings가 invalid 값을 기본값으로 교체하므로
    // 업무 시간 중(10:00 KST)에 호출하면 다음날 09:00 KST를 반환한다
    const badSettings: QuoteAutomationSettings = {
      ...defaultSettings,
      business_start_time: "invalid",
    };
    const date = kstDate(2025, 6, 1, 10, 0);
    const result = nextBusinessStartAt(date, badSettings);
    // invalid → 기본값 09:00으로 대체, 10:00 KST는 업무 시간 중이므로 다음날 09:00
    const resultKst = new Date(result.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 9);
    assert.equal(resultKst.getUTCMinutes(), 0);
    assert.equal(resultKst.getUTCDate(), 2);
  });
});

// ---------------------------------------------------------------------------
// calculateAutoFinalConfirmAt
// ---------------------------------------------------------------------------

describe("calculateAutoFinalConfirmAt", () => {
  it("업무 시간 내에 delay 후 시각이 있으면 그 시각을 ISO 문자열로 반환한다", () => {
    // 10:00 KST + 30분 = 10:30 KST → 업무 시간 내
    const matchedAt = kstDate(2025, 6, 1, 10, 0);
    const result = calculateAutoFinalConfirmAt(matchedAt, defaultSettings);
    const resultDate = new Date(result);
    const resultKst = new Date(resultDate.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 10);
    assert.equal(resultKst.getUTCMinutes(), 30);
  });

  it("업무 시간 후에 delay 후 시각이 있으면 다음 업무 시작 시각을 반환한다", () => {
    // 17:50 KST + 30분 = 18:20 KST → 업무 시간 후 → 다음날 09:00
    const matchedAt = kstDate(2025, 6, 1, 17, 50);
    const result = calculateAutoFinalConfirmAt(matchedAt, defaultSettings);
    const resultDate = new Date(result);
    const resultKst = new Date(resultDate.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 9);
    assert.equal(resultKst.getUTCMinutes(), 0);
    assert.equal(resultKst.getUTCDate(), 2);
  });

  it("커스텀 delay(60분) 설정이 적용된다", () => {
    const customSettings: QuoteAutomationSettings = {
      ...defaultSettings,
      auto_final_confirm_delay_minutes: 60,
    };
    const matchedAt = kstDate(2025, 6, 1, 10, 0);
    const result = calculateAutoFinalConfirmAt(matchedAt, customSettings);
    const resultDate = new Date(result);
    const resultKst = new Date(resultDate.getTime() + 9 * 60 * 60 * 1000);
    assert.equal(resultKst.getUTCHours(), 11);
    assert.equal(resultKst.getUTCMinutes(), 0);
  });

  it("반환값은 유효한 ISO 8601 문자열이다", () => {
    const matchedAt = kstDate(2025, 6, 1, 10, 0);
    const result = calculateAutoFinalConfirmAt(matchedAt, defaultSettings);
    assert.ok(typeof result === "string");
    assert.ok(!Number.isNaN(new Date(result).getTime()));
  });
});

// ---------------------------------------------------------------------------
// isApplicationQuoteAccepting
// ---------------------------------------------------------------------------

describe("isApplicationQuoteAccepting", () => {
  it("quote_status가 없고 quote_closed_at이 없으면 true를 반환한다 (기본 collecting 상태)", () => {
    assert.equal(isApplicationQuoteAccepting({}), true);
  });

  it("quote_status가 collecting이고 quote_closed_at이 없으면 true를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "collecting" }),
      true,
    );
  });

  it("quote_status가 extended_no_quotes이면 true를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "extended_no_quotes" }),
      true,
    );
  });

  it("quote_closed_at이 설정되어 있으면 false를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({
        quote_status: "collecting",
        quote_closed_at: "2025-06-01T10:00:00Z",
      }),
      false,
    );
  });

  it("quote_status가 closed_by_time이면 false를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "closed_by_time" }),
      false,
    );
  });

  it("quote_status가 auto_selected이면 false를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "auto_selected" }),
      false,
    );
  });

  it("quote_status가 final_selected이면 false를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "final_selected" }),
      false,
    );
  });

  it("quote_status가 completed이면 false를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "completed" }),
      false,
    );
  });

  it("quote_status가 manually_closed이면 false를 반환한다", () => {
    assert.equal(
      isApplicationQuoteAccepting({ quote_status: "manually_closed" }),
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// supportRewardRatios
// ---------------------------------------------------------------------------

describe("supportRewardRatios", () => {
  it("연장 0회(기본): client_reward_ratio=0, driver_ratio=100", () => {
    const result = supportRewardRatios(0);
    assert.equal(result.support_client_reward_ratio, 0);
    assert.equal(result.support_driver_ratio, 100);
  });

  it("연장 1회: client_reward_ratio=20, driver_ratio=80", () => {
    const result = supportRewardRatios(1);
    assert.equal(result.support_client_reward_ratio, 20);
    assert.equal(result.support_driver_ratio, 80);
  });

  it("연장 2회: client_reward_ratio=40, driver_ratio=60", () => {
    const result = supportRewardRatios(2);
    assert.equal(result.support_client_reward_ratio, 40);
    assert.equal(result.support_driver_ratio, 60);
  });

  it("연장 3회 이상도 40/60을 유지한다", () => {
    const result = supportRewardRatios(5);
    assert.equal(result.support_client_reward_ratio, 40);
    assert.equal(result.support_driver_ratio, 60);
  });

  it("음수 입력은 0회로 처리한다", () => {
    const result = supportRewardRatios(-1);
    assert.equal(result.support_client_reward_ratio, 0);
    assert.equal(result.support_driver_ratio, 100);
  });

  it("문자열 숫자 입력도 처리한다", () => {
    const result = supportRewardRatios("1");
    assert.equal(result.support_client_reward_ratio, 20);
    assert.equal(result.support_driver_ratio, 80);
  });

  it("null/undefined 입력은 0회로 처리한다", () => {
    assert.equal(supportRewardRatios(null).support_client_reward_ratio, 0);
    assert.equal(supportRewardRatios(undefined).support_client_reward_ratio, 0);
  });
});

// ---------------------------------------------------------------------------
// supportRewardAmounts
// ---------------------------------------------------------------------------

describe("supportRewardAmounts", () => {
  it("10명, 연장 0회: 지원금 200,000원, 고객 보상 0원, 기사 지원 200,000원", () => {
    const result = supportRewardAmounts({ passengerCount: 10, extensionRound: 0 });
    assert.equal(result.estimated_support_amount, 200_000);
    assert.equal(result.client_reward_amount, 0);
    assert.equal(result.driver_support_amount, 200_000);
  });

  it("10명, 연장 1회: 고객 보상 20%, 기사 지원 80%", () => {
    const result = supportRewardAmounts({ passengerCount: 10, extensionRound: 1 });
    assert.equal(result.estimated_support_amount, 200_000);
    assert.equal(result.client_reward_amount, 40_000);   // 200,000 × 20%
    assert.equal(result.driver_support_amount, 160_000); // 200,000 × 80%
  });

  it("10명, 연장 2회: 고객 보상 40%, 기사 지원 60%", () => {
    const result = supportRewardAmounts({ passengerCount: 10, extensionRound: 2 });
    assert.equal(result.estimated_support_amount, 200_000);
    assert.equal(result.client_reward_amount, 80_000);   // 200,000 × 40%
    assert.equal(result.driver_support_amount, 120_000); // 200,000 × 60%
  });

  it("45명(최대): 지원금 800,000원으로 상한 적용", () => {
    const result = supportRewardAmounts({ passengerCount: 45, extensionRound: 0 });
    assert.equal(result.estimated_support_amount, 800_000);
  });

  it("0명: 지원금 0원", () => {
    const result = supportRewardAmounts({ passengerCount: 0, extensionRound: 0 });
    assert.equal(result.estimated_support_amount, 0);
    assert.equal(result.client_reward_amount, 0);
    assert.equal(result.driver_support_amount, 0);
  });

  it("client_reward_amount + driver_support_amount = estimated_support_amount", () => {
    for (const round of [0, 1, 2, 3]) {
      const result = supportRewardAmounts({ passengerCount: 15, extensionRound: round });
      assert.equal(
        result.client_reward_amount + result.driver_support_amount,
        result.estimated_support_amount,
        `연장 ${round}회에서 합계가 맞지 않음`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// quoteLifecycleSelectColumns
// ---------------------------------------------------------------------------

describe("quoteLifecycleSelectColumns", () => {
  it("문자열을 반환한다", () => {
    const result = quoteLifecycleSelectColumns();
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });

  it("필수 컬럼들을 포함한다", () => {
    const result = quoteLifecycleSelectColumns();
    const required = [
      "quote_status",
      "quote_deadline_at",
      "final_selected_quote_id",
      "auto_selected_quote_id",
      "extension_round",
      "quote_closed_at",
    ];
    for (const col of required) {
      assert.ok(result.includes(col), `${col} 컬럼이 누락됨`);
    }
  });
});
