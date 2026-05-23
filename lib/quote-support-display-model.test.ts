import assert from "node:assert/strict";
import test from "node:test";

import { buildQuoteSupportDisplayModel } from "@/lib/quote-support-display-model";

test("confirmed client-priority support display model uses shared formula", () => {
  const model = buildQuoteSupportDisplayModel({
    application: {
      passenger_count: 45,
      sponsor_support_status: "approved",
      selected_price_type: "support_confirmed",
      selected_price_label: "지원금 할인 적용가",
      selected_price: 300_000,
      client_price_selection_kind: "support_confirmed_selected",
      extension_round: 0,
    },
    quote: {
      price: 600_000,
      support_settlement_type: "client_priority",
      planned_customer_support: 300_000,
      planned_total_support: 500_000,
    },
    sponsor_preapproval: {
      status: "approved",
      approved_support_amount: 500_000,
      estimated_support_amount: 500_000,
    },
    extension_count: 0,
  });

  assert.equal(model.support_stage, "지원확정");
  assert.equal(model.selected_quote_type, "할인견적");
  assert.equal(model.normal_price, 600_000);
  assert.equal(model.confirmed_total_support, 500_000);
  assert.equal(model.confirmed_customer_support, 300_000);
  assert.equal(model.confirmed_driver_support, 200_000);
  assert.equal(model.confirmed_extension_support, 0);
  assert.equal(model.final_discount_price, 300_000);
  assert.equal(model.selected_price_label, "지원금 할인 적용가");
  assert.equal(model.selected_price, 300_000);
  assert.deepEqual(
    model.display_rows.map((row) => [row.label, row.value]),
    [
      ["일반견적가", 600_000],
      ["확정 지원금", 500_000],
      ["고객 확정 지원금", 300_000],
      ["기사 확정 지원금", 200_000],
      ["연장회차", 0],
      ["확정 연장 지원금", 0],
      ["지원금 할인 적용가", 300_000],
    ],
  );
});
