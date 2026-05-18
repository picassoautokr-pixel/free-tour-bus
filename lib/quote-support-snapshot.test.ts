import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuoteSupportBreakdown } from "./support-calculation";
import {
  computeConfirmedFromPlanned,
  readPlannedSupport,
} from "./quote-support-snapshot";

describe("computeConfirmedFromPlanned", () => {
  it("고객 우선보장: 확정 40만 시 기사 0원, 할인 적용가 15만 (일반 55만)", () => {
    const planned = {
      total: 800_000,
      customer: 500_000,
      driver: 300_000,
      discountPrice: 50_000,
      finalPrice: 50_000,
    };
    const confirmed = computeConfirmedFromPlanned({
      normalPrice: 550_000,
      settlementType: "client_priority",
      planned,
      confirmedTotal: 400_000,
    });
    assert.ok(!("error" in confirmed));
    if ("error" in confirmed) return;
    assert.equal(confirmed.customer, 400_000);
    assert.equal(confirmed.driver, 0);
    assert.equal(confirmed.discountPrice, 150_000);
  });

  it("확정 총액을 기사 몫으로 fallback 하지 않음", () => {
    const planned = readPlannedSupport(
      {
        planned_total_support: 800_000,
        planned_customer_support: 500_000,
        planned_driver_support: 300_000,
        planned_discount_price: 50_000,
        price: 550_000,
      },
      550_000,
    );
    assert.ok(planned);
    const confirmed = computeConfirmedFromPlanned({
      normalPrice: 550_000,
      settlementType: "client_priority",
      planned: planned!,
      confirmedTotal: 400_000,
    });
    assert.ok(!("error" in confirmed));
    if ("error" in confirmed) return;
    assert.notEqual(confirmed.driver, 400_000);
  });
});

describe("buildQuoteSupportBreakdown planned preservation", () => {
  it("승인 후에도 예정 지원금·예정가 유지", () => {
    const breakdown = buildQuoteSupportBreakdown(
      {
        price: 550_000,
        support_settlement_type: "client_priority",
        planned_total_support: 800_000,
        planned_customer_support: 500_000,
        planned_driver_support: 300_000,
        planned_discount_price: 50_000,
        confirmed_total_support: 400_000,
        confirmed_customer_support: 400_000,
        confirmed_driver_support: 0,
        confirmed_discount_price: 150_000,
        confirmed_final_price: 150_000,
        sponsor_quote_enabled: true,
      },
      { applicationApprovedSupportTotal: 400_000 },
    );
    assert.equal(breakdown.calculationStatus, "ok");
    assert.equal(breakdown.totalPlannedSupport, 800_000);
    assert.equal(breakdown.customerPlannedSupport, 500_000);
    assert.equal(breakdown.partnerPlannedSupport, 300_000);
    assert.equal(breakdown.supportDiscountPlannedPrice, 50_000);
    assert.equal(breakdown.customerConfirmedSupport, 400_000);
    assert.equal(breakdown.partnerConfirmedSupport, 0);
    assert.equal(breakdown.supportDiscountAppliedPrice, 150_000);
  });

  it("approved 를 예정 총액으로 사용하지 않음", () => {
    const breakdown = buildQuoteSupportBreakdown(
      {
        price: 550_000,
        approved_support_amount: 400_000,
        preapproved_support_amount: 400_000,
        customer_support_amount: 500_000,
        driver_support_amount: 300_000,
        planned_total_support: 800_000,
        planned_customer_support: 500_000,
        planned_driver_support: 300_000,
        planned_discount_price: 50_000,
        sponsor_quote_enabled: true,
      },
      { applicationApprovedSupportTotal: 400_000 },
    );
    assert.equal(breakdown.totalPlannedSupport, 800_000);
    assert.notEqual(breakdown.totalPlannedSupport, 400_000);
  });
});
