/**
 * lib/client-quotes-handlers.test.ts
 *
 * client-quotes-handlers.ts 의 순수 함수 단위 테스트.
 * DB/HTTP 의존 핸들러(resolveApplication, resolveApplicationsByLookupPassword 등)는 제외하고
 * 독립적으로 검증 가능한 유틸 함수를 집중 테스트합니다.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  safeText,
  digits,
  parseInteger,
  isMissingColumnError,
} from "./client-quotes-handlers.ts";

// ---------------------------------------------------------------------------
// safeText
// ---------------------------------------------------------------------------

describe("safeText (client-quotes-handlers)", () => {
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
    assert.equal(safeText("  홍길동  "), "홍길동");
  });

  it("숫자는 문자열로 변환 후 반환한다", () => {
    assert.equal(safeText(42), "42");
  });
});

// ---------------------------------------------------------------------------
// digits
// ---------------------------------------------------------------------------

describe("digits", () => {
  it("숫자만 있는 문자열은 그대로 반환한다", () => {
    assert.equal(digits("01012345678"), "01012345678");
  });

  it("하이픈 포함 전화번호에서 숫자만 추출한다", () => {
    assert.equal(digits("010-1234-5678"), "01012345678");
  });

  it("공백 포함 전화번호에서 숫자만 추출한다", () => {
    assert.equal(digits("010 1234 5678"), "01012345678");
  });

  it("null은 빈 문자열을 반환한다", () => {
    assert.equal(digits(null), "");
  });

  it("undefined는 빈 문자열을 반환한다", () => {
    assert.equal(digits(undefined), "");
  });

  it("빈 문자열은 빈 문자열을 반환한다", () => {
    assert.equal(digits(""), "");
  });

  it("숫자가 없는 문자열은 빈 문자열을 반환한다", () => {
    assert.equal(digits("abc-def"), "");
  });

  it("숫자 타입은 문자열로 변환 후 숫자만 반환한다", () => {
    assert.equal(digits(12345), "12345");
  });

  it("접수번호 형식(BUS-20240101-001)에서 숫자만 추출한다", () => {
    assert.equal(digits("BUS-20240101-001"), "20240101001");
  });
});

// ---------------------------------------------------------------------------
// parseInteger
// ---------------------------------------------------------------------------

describe("parseInteger (client-quotes-handlers)", () => {
  it("정수를 반환한다", () => {
    assert.equal(parseInteger(100), 100);
  });

  it("소수점 숫자는 trunc(버림)하여 반환한다", () => {
    assert.equal(parseInteger(3.9), 3);
  });

  it("음수 소수점은 trunc(올림)하여 반환한다", () => {
    assert.equal(parseInteger(-3.9), -3);
  });

  it("숫자 문자열을 파싱한다", () => {
    assert.equal(parseInteger("45"), 45);
  });

  it("콤마 포함 숫자 문자열을 파싱한다", () => {
    // 콤마를 제거하고 parseInt
    assert.equal(parseInteger("1,200"), 1200);
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

  it("0은 0을 반환한다", () => {
    assert.equal(parseInteger(0), 0);
  });

  it("문자열 '0'은 0을 반환한다", () => {
    assert.equal(parseInteger("0"), 0);
  });

  it("숫자가 아닌 문자열은 null을 반환한다", () => {
    assert.equal(parseInteger("없음"), null);
  });

  it("인원수 범위(1~100)를 올바르게 파싱한다", () => {
    assert.equal(parseInteger("25"), 25);
    assert.equal(parseInteger(50), 50);
  });
});

// ---------------------------------------------------------------------------
// isMissingColumnError
// ---------------------------------------------------------------------------

describe("isMissingColumnError (client-quotes-handlers)", () => {
  it("null은 false를 반환한다", () => {
    assert.equal(isMissingColumnError(null), false);
  });

  it("undefined는 false를 반환한다", () => {
    assert.equal(isMissingColumnError(undefined), false);
  });

  it("code 42703은 true를 반환한다", () => {
    assert.equal(isMissingColumnError({ code: "42703" }), true);
  });

  it("code PGRST204는 true를 반환한다", () => {
    assert.equal(isMissingColumnError({ code: "PGRST204" }), true);
  });

  it("'does not exist' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: 'column "client_lookup_password" does not exist' }),
      true,
    );
  });

  it("'could not find xxx column' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "could not find client_lookup_password column" }),
      true,
    );
  });

  it("'schema cache' 메시지는 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "schema cache lookup failed" }),
      true,
    );
  });

  it("일반 오류 코드는 false를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ code: "23505", message: "duplicate key value" }),
      false,
    );
  });

  it("빈 객체는 false를 반환한다", () => {
    assert.equal(isMissingColumnError({}), false);
  });

  it("대소문자 무관하게 'Schema Cache' 메시지도 true를 반환한다", () => {
    assert.equal(
      isMissingColumnError({ message: "Schema Cache lookup failed for table" }),
      true,
    );
  });
});
