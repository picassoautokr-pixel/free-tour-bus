import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inferSelectedPriceTypeFromAmounts,
  resolveApplicationMatchedPriceDisplay,
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

describe("resolveApplicationMatchedPriceDisplay", () => {
  it("uses application selected_price only for amount", () => {
    const line = resolveApplicationMatchedPriceDisplay(
      {
        selected_price_type: "support_planned",
        selected_price_label: "지원금 할인 예정가",
        selected_price: 200_000,
      },
      { quoteNormalPrice: 500_000, quoteSupportPlannedPrice: 200_000 },
    );
    assert.equal(line.label, "지원금 할인 예정가");
    assert.equal(line.amount, 200_000);
  });

  it("falls back to support confirmed from quote when application selected_price is null", () => {
    const line = resolveApplicationMatchedPriceDisplay(
      {
        final_selected_quote_id: "quote-1",
        selected_price_type: null,
        selected_price_label: null,
        selected_price: null,
      },
      { quoteNormalPrice: 500_000, quoteSupportAppliedPrice: 300_000 },
      {
        price: 500_000,
        support_breakdown: {
          isConfirmed: true,
          supportDiscountAppliedPrice: 300_000,
          finalDiscountAppliedPrice: 300_000,
        },
      },
    );
    assert.equal(line.label, "지원금 할인 적용가");
    assert.equal(line.amount, 300_000);
  });

  it("corrects normal label when amount matches planned discount not normal", () => {
    const line = resolveApplicationMatchedPriceDisplay(
      {
        selected_price_type: "normal",
        selected_price_label: "일반견적가",
        selected_price: 200_000,
      },
      { quoteNormalPrice: 500_000, quoteSupportPlannedPrice: 200_000 },
    );
    assert.equal(line.label, "지원금 할인 예정가");
    assert.equal(line.amount, 200_000);
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

  it("prefers support_planned when normal equals selected but planned also matches", () => {
    assert.equal(
      inferSelectedPriceTypeFromAmounts(200_000, 200_000, 200_000, null, false),
      "support_planned",
    );
  });
});

describe("resolveEffectiveSelectedPriceType legacy kind", () => {
  it("uses support_planned_selected when DB type is normal", () => {
    const type = resolveEffectiveSelectedPriceType(
      {
        selected_price_type: "normal",
        selected_price_label: "일반견적가",
        selected_price: 200_000,
        client_price_selection_kind: "support_planned_selected",
      },
      { normalPrice: 200_000, supportPlannedPrice: 200_000 },
    );
    assert.equal(type, "support_planned");
  });
});
