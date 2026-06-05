/**
 * lib/partner-quotes-handlers.test.ts
 *
 * partner-quotes-handlers.ts 의 순수 함수 단위 테스트.
 * DB/세션 의존 핸들러(resolveApprovedDriver, handlePartnerQuotePost 등)는 제외하고
 * 독립적으로 검증 가능한 유틸 함수를 집중 테스트합니다.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  safeText,
  parsePrice,
} from "./partner-quotes-handlers";

// ---------------------------------------------------------------------------
// safeText
// ---------------------------------------------------------------------------

describe("safeText (partner-quotes-handlers)", () => {
  it("null은 빈 문자열을 반환한다", () => {
    assert.equal(safeText(null), "");
  });

  it("undefined는 빈 문자열을 반환한다", () => {
    assert.equal(safeText(undefined), "");
  });

  it("공백만 있는 문자열은 emptyLabel을 반환한다", () => {
    assert.equal(safeText("   "), "");
  });

  it("emptyLabel 지정 시 해당 값을 반환한다", () => {
    assert.equal(safeText(null, "없음"), "없음");
  });

  it("일반 문자열은 trim 후 반환한다", () => {
    assert.equal(safeText("  기사명  "), "기사명");
  });

  it("숫자는 문자열로 변환 후 반환한다", () => {
    assert.equal(safeText(100), "100");
  });

  it("0은 '0'을 반환한다", () => {
    assert.equal(safeText(0), "0");
  });
});

// ---------------------------------------------------------------------------
// parsePrice
// ---------------------------------------------------------------------------

describe("parsePrice", () => {
  it("정수를 그대로 반환한다", () => {
    assert.equal(parsePrice(500000), 500000);
  });

  it("소수점 숫자는 trunc(버림)하여 반환한다", () => {
    assert.equal(parsePrice(500000.9), 500000);
  });

  it("음수 소수점은 trunc(올림)하여 반환한다", () => {
    assert.equal(parsePrice(-500000.9), -500000);
  });

  it("숫자 문자열을 파싱한다", () => {
    assert.equal(parsePrice("300000"), 300000);
  });

  it("콤마 포함 금액 문자열을 파싱한다", () => {
    assert.equal(parsePrice("1,200,000"), 1200000);
  });

  it("'원' 단위 포함 문자열을 파싱한다", () => {
    assert.equal(parsePrice("800,000원"), 800000);
  });

  it("공백 포함 숫자 문자열을 파싱한다", () => {
    assert.equal(parsePrice(" 450000 "), 450000);
  });

  it("null은 null을 반환한다", () => {
    assert.equal(parsePrice(null), null);
  });

  it("undefined는 null을 반환한다", () => {
    assert.equal(parsePrice(undefined), null);
  });

  it("빈 문자열은 null을 반환한다", () => {
    assert.equal(parsePrice(""), null);
  });

  it("숫자가 없는 문자열은 null을 반환한다", () => {
    assert.equal(parsePrice("없음"), null);
  });

  it("NaN은 null을 반환한다", () => {
    assert.equal(parsePrice(NaN), null);
  });

  it("Infinity는 null을 반환한다", () => {
    assert.equal(parsePrice(Infinity), null);
  });

  it("0은 0을 반환한다", () => {
    assert.equal(parsePrice(0), 0);
  });

  it("문자열 '0'은 0을 반환한다", () => {
    assert.equal(parsePrice("0"), 0);
  });

  it("하이픈 포함 금액 문자열에서 숫자만 추출한다", () => {
    // '1-200-000' → digits '1200000'
    assert.equal(parsePrice("1-200-000"), 1200000);
  });

  it("실제 버스 견적 금액 범위(50만~500만)를 올바르게 파싱한다", () => {
    assert.equal(parsePrice("2,500,000"), 2500000);
    assert.equal(parsePrice(1500000), 1500000);
    assert.equal(parsePrice("500,000"), 500000);
  });
});
