import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDisplayInteger,
  getQuoteDisplayPrices,
  type QuoteDisplayPriceInput,
} from "./quote-display-prices";

// ---------------------------------------------------------------------------
// parseDisplayInteger
// ---------------------------------------------------------------------------

describe("parseDisplayInteger", () => {
  it("정수 숫자를 그대로 반환한다", () => {
    assert.equal(parseDisplayInteger(1_000_000), 1_000_000);
  });

  it("소수점 숫자는 내림 처리한다", () => {
    assert.equal(parseDisplayInteger(1_000_000.9), 1_000_000);
  });

  it("숫자 문자열을 파싱한다", () => {
    assert.equal(parseDisplayInteger("1000000"), 1_000_000);
  });

  it("쉼표가 포함된 문자열을 파싱한다", () => {
    assert.equal(parseDisplayInteger("1,000,000"), 1_000_000);
  });

  it("null을 반환한다 (null 입력)", () => {
    assert.equal(parseDisplayInteger(null), null);
  });

  it("null을 반환한다 (undefined 입력)", () => {
    assert.equal(parseDisplayInteger(undefined), null);
  });

  it("빈 문자열은 null을 반환한다", () => {
    assert.equal(parseDisplayInteger(""), null);
  });

  it("비숫자 문자열은 null을 반환한다", () => {
    assert.equal(parseDisplayInteger("abc"), null);
  });

  it("Infinity는 null을 반환한다", () => {
    assert.equal(parseDisplayInteger(Infinity), null);
  });

  it("NaN은 null을 반환한다", () => {
    assert.equal(parseDisplayInteger(NaN), null);
  });

  it("0을 반환한다", () => {
    assert.equal(parseDisplayInteger(0), 0);
  });
});

// ---------------------------------------------------------------------------
// getQuoteDisplayPrices — 기본 동작
// ---------------------------------------------------------------------------

describe("getQuoteDisplayPrices — 기본 동작", () => {
  it("price만 있는 기본 견적의 normalPrice를 반환한다", () => {
    const quote: QuoteDisplayPriceInput = { price: 1_000_000 };
    const result = getQuoteDisplayPrices(quote);
    assert.equal(result.normalPrice, 1_000_000);
  });

  it("지원금 없는 견적의 supportCustomerAmount는 0 또는 null이다", () => {
    const quote: QuoteDisplayPriceInput = { price: 1_000_000 };
    const result = getQuoteDisplayPrices(quote);
    // 지원금이 없으면 0 또는 null
    assert.ok(
      result.supportCustomerAmount === 0 || result.supportCustomerAmount === null,
    );
  });

  it("breakdown 객체를 항상 반환한다", () => {
    const quote: QuoteDisplayPriceInput = { price: 1_000_000 };
    const result = getQuoteDisplayPrices(quote);
    assert.ok(result.breakdown !== null && typeof result.breakdown === "object");
  });

  it("price가 없으면 normalPrice는 null이다", () => {
    const quote: QuoteDisplayPriceInput = {};
    const result = getQuoteDisplayPrices(quote);
    assert.equal(result.normalPrice, null);
  });
});

// ---------------------------------------------------------------------------
// getQuoteDisplayPrices — 지원금 계산
// ---------------------------------------------------------------------------

describe("getQuoteDisplayPrices — 지원금 계산", () => {
  it("planned 지원금이 있으면 supportDiscountPlannedPrice를 계산한다", () => {
    const quote: QuoteDisplayPriceInput = {
      price: 1_000_000,
      planned_total_support: 200_000,
      planned_customer_support: 200_000,
      planned_discount_price: 800_000,
    };
    const result = getQuoteDisplayPrices(quote);
    assert.equal(result.supportDiscountPlannedPrice, 800_000);
  });

  it("confirmed 지원금이 있으면 isConfirmed가 true이고 supportPrice는 확정가를 반환한다", () => {
    const quote: QuoteDisplayPriceInput = {
      price: 1_000_000,
      planned_total_support: 200_000,
      planned_customer_support: 200_000,
      planned_discount_price: 800_000,
      confirmed_total_support: 200_000,
      confirmed_customer_support: 200_000,
      confirmed_discount_price: 800_000,
    };
    const result = getQuoteDisplayPrices(quote);
    assert.equal(result.breakdown.isConfirmed, true);
    assert.equal(result.supportPrice, 800_000);
  });

  it("confirmed 지원금이 없으면 isConfirmed가 false이고 supportPrice는 planned 가격이다", () => {
    const quote: QuoteDisplayPriceInput = {
      price: 1_000_000,
      planned_total_support: 200_000,
      planned_customer_support: 200_000,
      planned_discount_price: 800_000,
    };
    const result = getQuoteDisplayPrices(quote);
    assert.equal(result.breakdown.isConfirmed, false);
    assert.equal(result.supportPrice, 800_000);
  });

  it("options로 applicationTotalPlannedSupport를 전달하면 반영된다", () => {
    const quote: QuoteDisplayPriceInput = { price: 1_000_000 };
    const result = getQuoteDisplayPrices(quote, {
      applicationTotalPlannedSupport: 300_000,
    });
    // 지원금이 있으면 supportDiscountPlannedPrice가 계산됨
    assert.ok(
      result.supportDiscountPlannedPrice !== null ||
      result.breakdown.totalPlannedSupport != null,
    );
  });
});
