import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateSponsorSupport,
  SUPPORT_AMOUNT_PER_PASSENGER,
  MAX_SUPPORT_AMOUNT,
} from "./support-estimate";

// ---------------------------------------------------------------------------
// 상수 검증
// ---------------------------------------------------------------------------

describe("상수 값 검증", () => {
  it("SUPPORT_AMOUNT_PER_PASSENGER는 20,000원", () => {
    assert.equal(SUPPORT_AMOUNT_PER_PASSENGER, 20_000);
  });

  it("MAX_SUPPORT_AMOUNT는 800,000원", () => {
    assert.equal(MAX_SUPPORT_AMOUNT, 800_000);
  });
});

// ---------------------------------------------------------------------------
// estimateSponsorSupport — 기본 계산
// ---------------------------------------------------------------------------

describe("estimateSponsorSupport — 기본 계산", () => {
  it("10명 × 20,000원 = 200,000원 지원금", () => {
    const result = estimateSponsorSupport({ passengerCount: 10, price: 1_000_000 });
    assert.equal(result.supportAmount, 200_000);
    assert.equal(result.estimated_support_amount, 200_000);
  });

  it("40명 × 20,000원 = 800,000원 (상한 미달)", () => {
    const result = estimateSponsorSupport({ passengerCount: 40, price: 2_000_000 });
    assert.equal(result.supportAmount, 800_000);
  });

  it("45명 × 20,000원 = 900,000원이지만 상한 800,000원으로 제한", () => {
    const result = estimateSponsorSupport({ passengerCount: 45, price: 2_000_000 });
    assert.equal(result.supportAmount, 800_000);
  });

  it("1명: 20,000원 지원금", () => {
    const result = estimateSponsorSupport({ passengerCount: 1, price: 500_000 });
    assert.equal(result.supportAmount, 20_000);
  });

  it("0명: 지원금 0원", () => {
    const result = estimateSponsorSupport({ passengerCount: 0, price: 500_000 });
    assert.equal(result.supportAmount, 0);
  });
});

// ---------------------------------------------------------------------------
// estimateSponsorSupport — discountedPrice 계산
// ---------------------------------------------------------------------------

describe("estimateSponsorSupport — discountedPrice", () => {
  it("price - supportAmount = discountedPrice", () => {
    const result = estimateSponsorSupport({ passengerCount: 10, price: 1_000_000 });
    assert.equal(result.discountedPrice, 800_000); // 1,000,000 - 200,000
  });

  it("지원금이 price보다 크면 discountedPrice는 0", () => {
    const result = estimateSponsorSupport({ passengerCount: 10, price: 100_000 });
    // supportAmount = 200,000 > price = 100,000 → discountedPrice = 0
    assert.equal(result.discountedPrice, 0);
  });

  it("price = 0이면 discountedPrice = 0", () => {
    const result = estimateSponsorSupport({ passengerCount: 5, price: 0 });
    assert.equal(result.discountedPrice, 0);
  });
});

// ---------------------------------------------------------------------------
// estimateSponsorSupport — 입력 타입 처리
// ---------------------------------------------------------------------------

describe("estimateSponsorSupport — 입력 타입 처리", () => {
  it("문자열 passengerCount를 파싱한다", () => {
    const result = estimateSponsorSupport({ passengerCount: "10", price: 1_000_000 });
    assert.equal(result.supportAmount, 200_000);
  });

  it("문자열 price를 파싱한다", () => {
    const result = estimateSponsorSupport({ passengerCount: 10, price: "1000000" });
    assert.equal(result.discountedPrice, 800_000);
  });

  it("null passengerCount는 0으로 처리한다", () => {
    const result = estimateSponsorSupport({ passengerCount: null, price: 1_000_000 });
    assert.equal(result.supportAmount, 0);
  });

  it("undefined passengerCount는 0으로 처리한다", () => {
    const result = estimateSponsorSupport({ passengerCount: undefined, price: 1_000_000 });
    assert.equal(result.supportAmount, 0);
  });

  it("음수 passengerCount는 0으로 처리한다", () => {
    const result = estimateSponsorSupport({ passengerCount: -5, price: 1_000_000 });
    assert.equal(result.supportAmount, 0);
  });

  it("소수점 passengerCount는 내림 처리한다", () => {
    const result = estimateSponsorSupport({ passengerCount: 10.9, price: 1_000_000 });
    assert.equal(result.supportAmount, 200_000); // 10명으로 처리
  });
});

// ---------------------------------------------------------------------------
// estimateSponsorSupport — dailyBudgetRemaining
// ---------------------------------------------------------------------------

describe("estimateSponsorSupport — dailyBudgetRemaining", () => {
  it("dailyBudgetRemaining이 계산된 지원금보다 작으면 dailyBudgetRemaining으로 제한된다", () => {
    const result = estimateSponsorSupport({
      passengerCount: 10,
      price: 1_000_000,
      dailyBudgetRemaining: 50_000,
    });
    assert.equal(result.supportAmount, 50_000);
  });

  it("dailyBudgetRemaining이 계산된 지원금보다 크면 계산값을 사용한다", () => {
    const result = estimateSponsorSupport({
      passengerCount: 10,
      price: 1_000_000,
      dailyBudgetRemaining: 500_000,
    });
    assert.equal(result.supportAmount, 200_000);
  });

  it("dailyBudgetRemaining이 null이면 제한 없이 계산한다", () => {
    const result = estimateSponsorSupport({
      passengerCount: 10,
      price: 1_000_000,
      dailyBudgetRemaining: null,
    });
    assert.equal(result.supportAmount, 200_000);
  });
});
