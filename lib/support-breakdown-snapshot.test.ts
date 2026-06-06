import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyConfirmedToSupportBreakdownSnapshot,
  buildPlannedSupportBreakdownSnapshot,
  parseSupportBreakdownSnapshot,
  snapshotToQuoteSupportBreakdown,
} from "./support-breakdown-snapshot";

describe("support breakdown snapshot immutability", () => {
  it("keeps rule per_person_support after hypothetical rule change", () => {
    const snapshot = buildPlannedSupportBreakdownSnapshot({
      phase: "quote_submit",
      rule: {
        id: "rule-1",
        title: "기본지원",
        support_per_person: 20_000,
        support_per_case: 0,
        max_support_amount: 800_000,
        support_type: "cash",
        support_condition: "홍보시",
        target_groups: ["회사원/직장인"],
      },
      normalPrice: 500_000,
      planned: {
        total: 100_000,
        customer: 100_000,
        driver: 0,
        discountPrice: 400_000,
        finalPrice: 400_000,
      },
    });

    const liveRuleChanged = {
      ...snapshot,
      per_person_support: 30_000,
    };
    assert.equal(snapshot.per_person_support, 20_000);
    assert.equal(liveRuleChanged.per_person_support, 30_000);

    const breakdown = snapshotToQuoteSupportBreakdown(snapshot);
    assert.equal(breakdown.totalPlannedSupport, 100_000);
    assert.equal(breakdown.supportDiscountPlannedPrice, 400_000);
  });

  it("merges confirmed without changing planned rule fields", () => {
    const planned = buildPlannedSupportBreakdownSnapshot({
      phase: "preapproved",
      rule: {
        id: "r1",
        title: "기본지원",
        support_per_person: 20_000,
      },
      normalPrice: 500_000,
      planned: {
        total: 100_000,
        customer: 80_000,
        driver: 20_000,
        discountPrice: 420_000,
        finalPrice: 420_000,
      },
    });
    const confirmed = applyConfirmedToSupportBreakdownSnapshot(planned, {
      total: 90_000,
      customer: 80_000,
      driver: 10_000,
      discountPrice: 420_000,
      finalPrice: 420_000,
    });
    assert.equal(confirmed.per_person_support, 20_000);
    assert.equal(confirmed.planned_total_support, 100_000);
    assert.equal(confirmed.confirmed_total_support, 90_000);
    assert.equal(confirmed.capture_phase, "sponsor_confirm");
  });

  it("round-trips jsonb parse", () => {
    const raw = buildPlannedSupportBreakdownSnapshot({
      phase: "preapproved",
      rule: null,
      normalPrice: 300_000,
      planned: {
        total: 50_000,
        customer: 50_000,
        driver: 0,
        discountPrice: 250_000,
        finalPrice: 250_000,
      },
    });
    const parsed = parseSupportBreakdownSnapshot(JSON.parse(JSON.stringify(raw)));
    assert.equal(parsed?.planned_total_support, 50_000);
  });
});
