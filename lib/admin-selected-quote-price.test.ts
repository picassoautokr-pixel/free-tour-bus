import assert from "node:assert/strict";
import test from "node:test";

import type { AdminMemberQuoteCard } from "@/lib/admin-application-detail-build";
import { resolveAdminSelectedQuoteDisplay } from "@/lib/admin-selected-quote-price";

const memberQuote: AdminMemberQuoteCard = {
  id: "q1",
  partner_driver_id: "p1",
  company_name: "테스트",
  driver_name: "기사",
  phone: "010",
  price: 500_000,
  support_settlement_type: "client_priority",
  support_settlement_label: "고객 지원금 우선보장",
  support_rows: [
    { label: "일반견적가", value: 500_000 },
    { label: "확정 지원금", value: 250_000 },
    { label: "고객 확정 지원금", value: 200_000 },
    { label: "연장회차", value: 0 },
    { label: "확정 연장 지원금", value: 0 },
    { label: "지원금 할인 적용가", value: 300_000 },
  ],
  sponsor_stage_badge: "지원확정",
  created_at: "",
  message: "",
  status: "submitted",
  vehicle_type: "",
  available_time: "",
  is_matched: true,
  sponsor_quote_enabled: true,
  support_breakdown: null,
  support_debug: null,
};

test("selected quote uses discount row when stored price is normal price", () => {
  const result = resolveAdminSelectedQuoteDisplay({
    application: {
      selected_price_type: "support_confirmed",
      selected_price_label: "지원금 할인 적용가",
      selected_price: 500_000,
    },
    memberQuote,
    sponsorConfirmed: true,
  });
  assert.equal(result.selected_price, 300_000);
  assert.equal(result.selected_price_label, "지원금 할인 적용가");
  assert.equal(result.selected_price_type, "support_confirmed");
});

test("support_confirmed uses breakdown not stored normal price", () => {
  const result = resolveAdminSelectedQuoteDisplay({
    application: {
      selected_price_type: "support_confirmed",
      selected_price_label: "지원금 할인 적용가",
      selected_price: 500_000,
    },
    quoteRow: {
      price: 500_000,
      support_breakdown: {
        final_discount_price: 300_000,
        confirmed_total_support: 250_000,
        confirmed_customer_support: 200_000,
      },
    },
    sponsorConfirmed: false,
  });
  assert.equal(result.selected_price, 300_000);
  assert.match(result.calculation_source, /final_discount/);
});
