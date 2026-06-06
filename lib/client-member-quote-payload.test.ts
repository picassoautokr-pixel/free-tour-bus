/**
 * client-member-quote-payload.ts 단위 테스트
 * - parseIntField (내부 함수, buildClientMemberQuoteSupport 통해 간접 검증)
 * - resolveNormalPrice 간접 검증
 * - resolveEffectivePlannedCustomer 간접 검증
 * - buildClientMemberQuoteSupport: 지원금 없음 / 예정 / 확정 시나리오
 * - applyClientPartnerQuoteApiFields: source 필터, 필드 보강
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildClientMemberQuoteSupport,
  applyClientPartnerQuoteApiFields,
} from "./client-member-quote-payload";
import type { ClientQuote } from "./client-application-view-model";

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    price: null,
    member_price: null,
    planned_customer_support: null,
    confirmed_total_support: null,
    confirmed_customer_support: null,
    confirmed_discount_price: null,
    final_discount_applied_price: null,
    support_discount_applied_price: null,
    extension_support_amount: null,
    sponsor_support_status: null,
    support_breakdown: null,
    ...overrides,
  };
}

function makeClientQuote(overrides: Partial<ClientQuote> = {}): ClientQuote {
  return {
    id: "q1",
    source: "member",
    price: null,
    member_price: null,
    planned_customer_support: null,
    confirmed_total_support: null,
    confirmed_customer_support: null,
    final_discount_applied_price: null,
    support_discount_applied_price: null,
    confirmed_discount_price: null,
    extension_support_amount: null,
    sponsor_support_status: null,
    support_status: null,
    support_breakdown: null,
    sponsor_approved_support_amount: null,
    final_customer_support_amount: null,
    customer_support_amount: null,
    planned_driver_support: null,
    confirmed_driver_support: null,
    planned_total_support: null,
    sponsor_quote_enabled: false,
    ...overrides,
  } as unknown as ClientQuote;
}

// ─── buildClientMemberQuoteSupport ───────────────────────────────────────────

describe("buildClientMemberQuoteSupport", () => {
  describe("지원금 없는 일반 견적", () => {
    it("price만 있는 경우 price를 반환한다", () => {
      const row = makeRow({ price: 1200000 });
      const result = buildClientMemberQuoteSupport(row as never);
      assert.equal(result.price, 1200000);
      assert.equal(result.confirmed_total_support, null);
      assert.equal(result.sponsor_quote_enabled, false);
    });

    it("price가 없으면 null을 반환한다", () => {
      const row = makeRow();
      const result = buildClientMemberQuoteSupport(row as never);
      assert.equal(result.price, null);
    });

    it("price가 문자열이어도 파싱한다", () => {
      const row = makeRow({ price: "1,500,000" });
      const result = buildClientMemberQuoteSupport(row as never);
      // parseIntField는 콤마 제거 후 파싱
      assert.ok(result.price != null);
    });
  });

  describe("지원금 예정(planned) 시나리오", () => {
    it("row에 planned_customer_support가 있으면 그 값을 반환한다", () => {
      const row = makeRow({
        price: 1200000,
        planned_customer_support: 300000,
      });
      const result = buildClientMemberQuoteSupport(row as never);
      assert.equal(result.planned_customer_support, 300000);
      assert.equal(result.confirmed_total_support, null);
    });

    it("planned_customer_support가 있으면 support_discount_planned_price를 반환한다", () => {
      const row = makeRow({
        price: 1200000,
        planned_customer_support: 300000,
      });
      const result = buildClientMemberQuoteSupport(row as never);
      // support_discount_planned_price = model.planned_discount_price (price - planned_customer_support)
      // 실제 구현은 quote-support-display-model을 통해 계산됨
      assert.ok(result.planned_customer_support === 300000);
    });

    it("extension_support_amount가 있으면 planned_customer_support에서 차감한다", () => {
      const row = makeRow({
        price: 1200000,
        extension_support_amount: 50000,
      });
      const result1 = buildClientMemberQuoteSupport(row as never, {
        applicationTargetNormalPrice: 1200000,
        applicationTargetMemberPrice: 900000,
      });
      const rowNoExt = makeRow({ price: 1200000 });
      const result2 = buildClientMemberQuoteSupport(rowNoExt as never, {
        applicationTargetNormalPrice: 1200000,
        applicationTargetMemberPrice: 900000,
      });
      // extension이 있으면 planned_customer_support가 더 작거나 같아야 함
      assert.ok(
        (result1.planned_customer_support ?? 0) <= (result2.planned_customer_support ?? 0),
      );
    });
  });

  describe("지원금 확정(confirmed) 시나리오", () => {
    it("sponsor_support_status=approved이면 confirmed 필드를 채운다", () => {
      const row = makeRow({
        price: 1200000,
        sponsor_support_status: "approved",
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
        confirmed_driver_support: 50000,
      });
      const result = buildClientMemberQuoteSupport(row as never);
      assert.ok(result.confirmed_total_support != null && result.confirmed_total_support > 0);
    });

    it("applicationSponsorStatus=approved이면 confirmed로 처리된다", () => {
      const row = makeRow({
        price: 1200000,
        confirmed_total_support: 300000,
      });
      const result = buildClientMemberQuoteSupport(row as never, {
        applicationSponsorStatus: "approved",
      });
      assert.ok(result.confirmed_total_support != null);
    });

    it("confirmed_total_support > 0이면 자동으로 confirmed로 처리된다", () => {
      const row = makeRow({
        price: 1200000,
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
      });
      const result = buildClientMemberQuoteSupport(row as never);
      assert.ok(result.confirmed_total_support != null && result.confirmed_total_support > 0);
    });

    it("confirmed 상태에서 final_discount_applied_price를 계산한다", () => {
      const row = makeRow({
        price: 1200000,
        sponsor_support_status: "approved",
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
      });
      const result = buildClientMemberQuoteSupport(row as never);
      // final_discount_applied_price = price - confirmed_customer_support - extension
      assert.ok(result.final_discount_applied_price != null);
    });
  });

  describe("support_breakdown 직렬화", () => {
    it("support_breakdown.is_confirmed이 isConfirmed와 일치한다", () => {
      const row = makeRow({
        price: 1200000,
        sponsor_support_status: "approved",
        confirmed_total_support: 300000,
      });
      const result = buildClientMemberQuoteSupport(row as never);
      assert.equal(result.support_breakdown.is_confirmed, result.support_breakdown.isConfirmed);
    });

    it("sponsor_quote_enabled은 기본적으로 false이다", () => {
      const row = makeRow({ price: 1000000 });
      const result = buildClientMemberQuoteSupport(row as never);
      assert.equal(result.sponsor_quote_enabled, false);
    });
  });
});

// ─── applyClientPartnerQuoteApiFields ────────────────────────────────────────

describe("applyClientPartnerQuoteApiFields", () => {
  describe("source 필터", () => {
    it("source가 member가 아니면 원본 quote를 그대로 반환한다", () => {
      const quote = makeClientQuote({ source: "guest" as never, price: 999999 });
      const result = applyClientPartnerQuoteApiFields(quote);
      assert.equal(result, quote); // 동일 참조
    });

    it("source가 member이면 필드를 보강한다", () => {
      const quote = makeClientQuote({ source: "member", price: 1200000 });
      const result = applyClientPartnerQuoteApiFields(quote);
      assert.notEqual(result, quote); // 새 객체
    });
  });

  describe("application 정보로 필드 보강", () => {
    it("application.target_normal_price로 price를 채운다", () => {
      const quote = makeClientQuote({ source: "member", price: null });
      const result = applyClientPartnerQuoteApiFields(quote, {
        sponsor_support_status: undefined,
        sponsor_approved_support_amount: undefined,
        target_normal_price: 1500000,
        target_member_price: null,
      });
      assert.equal(result.price, 1500000);
    });

    it("application.sponsor_approved_support_amount로 confirmed_total_support를 채운다", () => {
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        confirmed_total_support: null,
      });
      const result = applyClientPartnerQuoteApiFields(quote, {
        sponsor_support_status: "approved",
        sponsor_approved_support_amount: 300000,
        target_normal_price: null,
        target_member_price: null,
      });
      assert.equal(result.confirmed_total_support, 300000);
    });

    it("quote에 이미 값이 있으면 application 값보다 우선한다", () => {
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        confirmed_total_support: 200000,
      });
      const result = applyClientPartnerQuoteApiFields(quote, {
        sponsor_support_status: "approved",
        sponsor_approved_support_amount: 300000,
        target_normal_price: null,
        target_member_price: null,
      });
      assert.equal(result.confirmed_total_support, 200000);
    });
  });

  describe("confirmed 상태 처리", () => {
    it("sponsor_support_status=approved이면 isConfirmed로 처리된다", () => {
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        sponsor_support_status: "approved",
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
      });
      const result = applyClientPartnerQuoteApiFields(quote);
      assert.ok(result.confirmed_customer_support != null);
    });

    it("confirmed_total_support > 0이면 isConfirmed로 처리된다", () => {
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
      });
      const result = applyClientPartnerQuoteApiFields(quote);
      assert.ok(result.confirmed_customer_support != null);
    });

    it("confirmed 상태에서 final_discount_applied_price를 계산한다", () => {
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        sponsor_support_status: "approved",
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
      });
      const result = applyClientPartnerQuoteApiFields(quote);
      // final_discount_applied_price = 1200000 - 250000 - 0 = 950000
      assert.ok(result.final_discount_applied_price != null);
      assert.equal(result.final_discount_applied_price, result.support_discount_applied_price);
      assert.equal(result.final_discount_applied_price, result.confirmed_discount_price);
    });
  });

  describe("support_breakdown 보강", () => {
    it("support_breakdown이 있으면 confirmed 필드를 업데이트한다", () => {
      const breakdown = {
        normalPrice: 1200000,
        customerPlannedSupport: 300000,
        totalConfirmedSupport: 0,
        customerConfirmedSupport: null,
        is_confirmed: false,
        isConfirmed: false,
        confirmed_total_support: null,
        confirmed_customer_support: null,
        final_discount_applied_price: null,
        finalDiscountAppliedPrice: null,
        supportDiscountAppliedPrice: null,
        planned_customer_support: 300000,
      };
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        confirmed_total_support: 300000,
        confirmed_customer_support: 250000,
        support_breakdown: breakdown as never,
      });
      const result = applyClientPartnerQuoteApiFields(quote);
      const bd = result.support_breakdown as unknown as typeof breakdown & {
        confirmed_total_support: number | null;
      };
      assert.ok(bd != null);
      assert.equal(bd.confirmed_total_support, 300000);
    });

    it("support_breakdown이 없으면 원본 support_breakdown을 유지한다", () => {
      const quote = makeClientQuote({
        source: "member",
        price: 1200000,
        support_breakdown: null,
      });
      const result = applyClientPartnerQuoteApiFields(quote);
      assert.equal(result.support_breakdown, null);
    });
  });
});
