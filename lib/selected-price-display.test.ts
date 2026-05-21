import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inferSelectedPriceTypeFromAmounts,
  resolveClientMatchedQuoteLine,
  resolveEffectiveSelectedPriceType,
} from "./selected-price-display";

describe("resolveEffectiveSelectedPriceType", () => {
  it("corrects normal type when selected price is support planned discount", () => {
    const type = resolveEffectiveSelectedPriceType(
      {
        selected_price_type: "normal",
        selected_price_label: "일반견적가",
        selected_price: 200_000,
      },
      {
        normalPrice: 500_000,
        supportPlannedPrice: 200_000,
        supportConfirmed: false,
      },
    );
    assert.equal(type, "support_planned");
  });

  it("keeps normal when selected equals normal price", () => {
    const type = resolveEffectiveSelectedPriceType(
      {
        selected_price_type: "normal",
        selected_price: 500_000,
      },
      { normalPrice: 500_000, supportPlannedPrice: 200_000 },
    );
    assert.equal(type, "normal");
  });
});

describe("resolveClientMatchedQuoteLine", () => {
  it("shows support planned label and amount for legacy wrong normal storage", () => {
    const line = resolveClientMatchedQuoteLine(
      {
        selected_price_type: "normal",
        selected_price_label: "일반견적가",
        selected_price: 200_000,
      },
      {
        normalPrice: 500_000,
        supportPlannedPrice: 200_000,
        supportConfirmed: false,
      },
    );
    assert.equal(line.kindLabel, "지원금 할인 예정가");
    assert.equal(line.amount, 200_000);
  });

  it("uses stored label when consistent with support planned", () => {
    const line = resolveClientMatchedQuoteLine(
      {
        selected_price_type: "support_planned",
        selected_price_label: "지원금 할인 예정가",
        selected_price: 200_000,
      },
      { normalPrice: 500_000, supportPlannedPrice: 200_000 },
    );
    assert.equal(line.kindLabel, "지원금 할인 예정가");
    assert.equal(line.amount, 200_000);
  });
});

describe("inferSelectedPriceTypeFromAmounts", () => {
  it("matches planned price amount", () => {
    assert.equal(
      inferSelectedPriceTypeFromAmounts(200_000, 500_000, 200_000, null, false),
      "support_planned",
    );
  });
});
