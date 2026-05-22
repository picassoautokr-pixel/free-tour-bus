import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQuoteDebugReport } from "./quote-debug-trace";

describe("buildQuoteDebugReport", () => {
  it("detects support_planned label mismatch", () => {
    const report = buildQuoteDebugReport({
      role: "client",
      application: {
        selected_price_type: "support_planned",
        selected_price_label: "일반견적가",
        selected_price: 200_000,
      },
      quote: {
        price: 500_000,
        support_discount_planned_price: 200_000,
        sponsor_quote_enabled: true,
        planned_total_support: 300_000,
        planned_customer_support: 300_000,
        support_settlement_type: "client_priority",
      },
    });
    const ui = report.sections.find((s) => s.id === "ui_state");
    const matchedUi = ui?.entries.find((e) => e.id === "ui_matched");
    assert.ok(String(matchedUi?.result).includes("지원금 할인 예정가"));
    const codes = report.errors.map((e) => e.code);
    assert.ok(
      codes.includes("legacy_normal_label") || codes.includes("label_type_mismatch"),
    );
  });
});
