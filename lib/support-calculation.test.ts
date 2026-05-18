import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQuoteSupportBreakdown,
  calculateExtensionSupport,
  calculateSupportDistribution,
  calculateTotalPlannedSupport,
  formatSupportAmount,
  formatSupportAmountFromBreakdown,
} from "./support-calculation";

describe("calculateTotalPlannedSupport", () => {
  it("caps by max support amount (45 passengers × 20,000 → 800,000)", () => {
    const amount = calculateTotalPlannedSupport({
      passengerCount: 45,
      supportPerPerson: 20_000,
      supportPerCase: 0,
      maxSupportAmount: 800_000,
      maxPassengerCount: 45,
    });
    assert.equal(amount, 800_000);
  });

  it("respects daily budget remaining", () => {
    const amount = calculateTotalPlannedSupport({
      passengerCount: 10,
      supportPerPerson: 20_000,
      maxSupportAmount: 800_000,
      dailyBudgetRemaining: 50_000,
    });
    assert.equal(amount, 50_000);
  });
});

describe("calculateSupportDistribution", () => {
  it("client_priority: customer gets min(planned, confirmed)", () => {
    const result = calculateSupportDistribution({
      settlementType: "client_priority",
      totalPlanned: 800_000,
      customerPlanned: 500_000,
      partnerPlanned: 300_000,
      totalConfirmed: 400_000,
    });
    assert.equal(result.customerAmount, 400_000);
    assert.equal(result.partnerAmount, 0);
  });

  it("ratio: preserves planned ratio on confirmed total", () => {
    const result = calculateSupportDistribution({
      settlementType: "ratio",
      totalPlanned: 1_000_000,
      customerPlanned: 300_000,
      partnerPlanned: 700_000,
      totalConfirmed: 600_000,
    });
    assert.equal(result.customerAmount, 180_000);
    assert.equal(result.partnerAmount, 420_000);
  });
});

describe("buildQuoteSupportBreakdown", () => {
  it("planned prices before sponsor confirmation", () => {
    const breakdown = buildQuoteSupportBreakdown({
      price: 500_000,
      support_settlement_type: "client_priority",
      preapproved_support_amount: 800_000,
      customer_support_amount: 500_000,
      driver_support_amount: 300_000,
      sponsor_quote_enabled: true,
    });
    assert.equal(breakdown.calculationStatus, "ok");
    assert.equal(breakdown.totalPlannedSupport, 800_000);
    assert.equal(breakdown.customerPlannedSupport, 500_000);
    assert.equal(breakdown.partnerPlannedSupport, 300_000);
    assert.equal(breakdown.supportDiscountPlannedPrice, 0);
    assert.equal(breakdown.isConfirmed, false);
    assert.equal(breakdown.supportDiscountAppliedPrice, null);
    assert.equal(breakdown.customerConfirmedSupport, null);
  });

  it("applied prices after sponsor confirms lower amount", () => {
    const breakdown = buildQuoteSupportBreakdown({
      price: 500_000,
      support_settlement_type: "client_priority",
      preapproved_support_amount: 800_000,
      approved_support_amount: 400_000,
      customer_support_amount: 500_000,
      driver_support_amount: 300_000,
      final_customer_support_amount: 400_000,
      final_driver_support_amount: 0,
      sponsor_quote_enabled: true,
    });
    assert.equal(breakdown.isConfirmed, true);
    assert.equal(breakdown.customerConfirmedSupport, 400_000);
    assert.equal(breakdown.partnerConfirmedSupport, 0);
    assert.equal(breakdown.supportDiscountAppliedPrice, 100_000);
  });

  it("distinguishes zero from null for confirmed partner support", () => {
    const breakdown = buildQuoteSupportBreakdown({
      price: 500_000,
      approved_support_amount: 400_000,
      final_customer_support_amount: 400_000,
      final_driver_support_amount: 0,
      customer_support_amount: 500_000,
      preapproved_support_amount: 800_000,
      sponsor_quote_enabled: true,
    });
    assert.equal(breakdown.partnerConfirmedSupport, 0);
  });
});

describe("formatSupportAmount", () => {
  it("null/undefined → 미확정", () => {
    assert.equal(formatSupportAmount(null), "미확정");
    assert.equal(formatSupportAmount(undefined), "미확정");
  });

  it("0 → 0원", () => {
    assert.equal(formatSupportAmount(0), "0원");
    assert.equal(
      formatSupportAmount(0, { phase: "confirmed", isConfirmed: true }),
      "0원",
    );
  });

  it("calculation failed → 계산 실패", () => {
    assert.equal(
      formatSupportAmount(100_000, { calculationStatus: "failed" }),
      "계산 실패",
    );
  });

  it("confirmed phase before approval → 미확정 (not 0)", () => {
    assert.equal(
      formatSupportAmount(0, { phase: "confirmed", isConfirmed: false }),
      "미확정",
    );
    assert.equal(
      formatSupportAmount(null, { phase: "confirmed", isConfirmed: false }),
      "미확정",
    );
  });

  it("partner confirmed 0 after approval → 0원", () => {
    const breakdown = buildQuoteSupportBreakdown({
      price: 500_000,
      approved_support_amount: 400_000,
      final_customer_support_amount: 400_000,
      final_driver_support_amount: 0,
      customer_support_amount: 500_000,
      preapproved_support_amount: 800_000,
      sponsor_quote_enabled: true,
    });
    assert.equal(
      formatSupportAmountFromBreakdown(
        breakdown,
        breakdown.partnerConfirmedSupport,
        "confirmed",
      ),
      "0원",
    );
    assert.equal(
      formatSupportAmountFromBreakdown(
        breakdown,
        breakdown.supportDiscountAppliedPrice,
        "confirmed",
      ),
      "100,000원",
    );
    assert.equal(
      formatSupportAmountFromBreakdown(
        breakdown,
        breakdown.finalDiscountAppliedPrice,
        "final",
      ),
      "100,000원",
    );
  });

  it("unconfirmed applied/final prices → 미확정", () => {
    const breakdown = buildQuoteSupportBreakdown({
      price: 500_000,
      preapproved_support_amount: 800_000,
      customer_support_amount: 500_000,
      sponsor_quote_enabled: true,
    });
    assert.equal(
      formatSupportAmountFromBreakdown(
        breakdown,
        breakdown.supportDiscountAppliedPrice,
        "confirmed",
      ),
      "미확정",
    );
    assert.equal(
      formatSupportAmountFromBreakdown(
        breakdown,
        breakdown.finalDiscountAppliedPrice,
        "final",
      ),
      "미확정",
    );
  });
});

describe("calculateExtensionSupport", () => {
  it("is 20% of partner confirmed support", () => {
    assert.equal(calculateExtensionSupport(300_000), 60_000);
  });

  it("final discount applies extension after confirmed price", () => {
    const breakdown = buildQuoteSupportBreakdown({
      price: 500_000,
      support_settlement_type: "ratio",
      planned_total_support: 1_000_000,
      planned_customer_support: 300_000,
      planned_driver_support: 700_000,
      planned_discount_price: 200_000,
      confirmed_total_support: 600_000,
      sponsor_quote_enabled: true,
      extension_applied: true,
    });
    assert.equal(breakdown.supportDiscountAppliedPrice, 320_000);
    assert.equal(breakdown.extensionSupport, 84_000);
    assert.equal(breakdown.finalDiscountAppliedPrice, 236_000);
  });
});
