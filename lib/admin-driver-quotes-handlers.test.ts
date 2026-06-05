/**
 * lib/admin-driver-quotes-handlers.test.ts
 *
 * admin-driver-quotes-handlers.ts 의 순수 함수 단위 테스트.
 * DB/HTTP 의존 핸들러(handleAdminDriverQuotesGet 등)는 제외하고
 * 독립적으로 검증 가능한 유틸 함수를 집중 테스트합니다.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  safeText,
  parseInteger,
  isMissingColumnError,
} from "./admin-driver-quotes-handlers";

// ---------------------------------------------------------------------------
// safeText
// ---------------------------------------------------------------------------

describe("safeText", () => {
  it("null은 빈 문자열을 반환한다", () => {
    assert.equal(safeText(null), "");
  });

  it("undefined는 빈 문자열을 반환한다", () => {
    assert.equal(safeText(undefined), "");
  });

  it("공백만 있는 문자열은 emptyLabel을 반환한다", () => {
    assert.equal(safeText("   "), "");
  });

  it("공백만 있는 문자열에 emptyLabel 지정 시 해당 값을 반환한다", () => {
    assert.equal(safeText("   ", "N/A"), "N/A");
  });

  it("일반 문자열은 trim 후 반환한다", () => {
    assert.equal(safeText("  hello  "), "hello");
  });

  it("숫자는 문자열로 변환 후 반환한다", () => {
    assert.equal(safeText(42), "42");
  });

  it("0은 '0'을 반환한다 (falsy 값이지만 유효)", () => {
    assert.equal(safeText(0), "0");
  });

  it("빈 문자열은 emptyLabel을 반환한다", () => {
    assert.equal(safeText("", "기본값"), "기본값");
  });

  it("boolean true는 'true'를 반환한다", () => {
    assert.equal(safeText(true), "true");
  });

  it("boolean false는 emptyLabel을 반환한다 (String(false).trim() === 'false' → 비어있지 않음)", () => {
    assert.equal(safeText(false), "false");
  });
});

// ---------------------------------------------------------------------------
// parseInteger
// ---------------------------------------------------------------------------

describe("parseInteger", () => {
  it("정수를 그대로 반환한다", () => {
    assert.equal(parseInteger(42), 42);
  });

  it("소수점 숫자는 그대로 반환한다 (Math.trunc 없음)", () => {
    // parseInteger는 Number.isFinite(value) 체크만 하고 trunc 없음
    assert.equal(parseInteger(3.7), 3.7);
  });

  it("숫자 문자열을 파싱한다", () => {
    assert.equal(parseInteger("123"), 123);
  });

  it("공백이 있는 숫자 문자열을 파싱한다", () => {
    assert.equal(parseInteger("  456  "), 456);
  });

  it("null은 null을 반환한다", () => {
    assert.equal(parseInteger(null), null);
  });

  it("undefined는 null을 반환한다", () => {
    assert.equal(parseInteger(undefined), null);
  });

  it("빈 문자열은 null을 반환한다", () => {
    assert.equal(parseInteger(""), null);
  });

  it("공백만 있는 문자열은 null을 반환한다", () => {
    assert.equal(parseInteger("   "), null);
  });

  it("NaN은 null을 반환한다", () => {
    assert.equal(parseInteger(NaN), null);
  });

  it("Infinity는 null을 반환한다", () => {
    assert.equal(parseInteger(Infinity), null);
  });

  it("문자열 '0'은 0을 반환한다", () => {
    assert.equal(parseInteger("0"), 0);
  });

  it("음수 문자열을 파싱한다", () => {
    assert.equal(parseInteger("-10"), -10);
  });

  it("숫자가 아닌 문자열은 null을 반환한다", () => {
    assert.equal(parseInteger("abc"), null);
  });
});

// ---------------------------------------------------------------------------
// isMissingColumnError
// ---------------------------------------------------------------------------

describe("isMissingColumnError", () => {
  it("null은 false를 반환한다", () => {
    assert.equal(isMissingColumnError(null), false);
  });

  it("undefined는 false를 반환한다", () => {
    assert.equal(isMissingColumnError(undefined), false);
  });

  it("code 42703(PostgreSQL undefined_column)은 true를 반환한다", () => {
    assert.equal(isMissingColumnError({ code: "42703" }), true);
  });

  it("code PGRST204(PostgREST 컬럼 없음)는 true를 반환한다", () => {
    assert.equal(isMissingColumnError({ code: "PGRST204" }), true);
  });

  it("'does not exist' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: 'column "foo" does not exist' }),
      true,
    );
  });

  it("'column xxx does not exist' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "column sponsor_approved_count does not exist" }),
      true,
    );
  });

  it("'could not find xxx column' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "could not find sponsor_support_status column" }),
      true,
    );
  });

  it("'schema cache' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "schema cache lookup failed for table: applications" }),
      true,
    );
  });

  it("일반 DB 오류 메시지는 false를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ code: "23505", message: "duplicate key value" }),
      false,
    );
  });

  it("code 없이 일반 메시지만 있으면 false를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "connection refused" }),
      false,
    );
  });

  it("빈 객체는 false를 반환한다", () => {
    assert.equal(isMissingColumnError({}), false);
  });

  it("대소문자 무관하게 'Does Not Exist' 메시지도 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "Column 'foo' Does Not Exist" }),
      true,
    );
  });
});
