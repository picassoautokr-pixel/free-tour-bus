import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminMemberQuoteSupportDisplay } from "@/lib/admin-member-quote-support-display";
import {
  deriveCustomerConfirmedSupport,
  resolvePartnerConfirmedSupport,
} from "@/lib/support-calculation";

test("deriveCustomerConfirmedSupport from normal and discount", () => {
  assert.equal(
    deriveCustomerConfirmedSupport({
      normalPrice: 500_000,
      finalDiscountPrice: 300_000,
      confirmedExtensionSupport: 0,
    }),
    200_000,
  );
  assert.equal(
    resolvePartnerConfirmedSupport({
      confirmedTotalSupport: 250_000,
      confirmedCustomerSupport: 200_000,
      confirmedExtensionSupport: 0,
    }),
    50_000,
  );
});

test("confirmed display: customer derived, not total fallback", () => {
  const display = buildAdminMemberQuoteSupportDisplay({
    quote: {
      price: 500_000,
      support_breakdown: {
        calculation_status: "failed",
        calculation_error: "planned missing",
      },
      final_member_price: 300_000,
    },
    application: {
      selected_price: 300_000,
      sponsor_approved_support_amount: 250_000,
      approved_support_amount: 250_000,
    },
    sponsor: {
      preapproval_id: "p1",
      sponsor_company_name: "테스트",
      support_status: "approved",
      support_stage_badge: "지원확정",
      support_kind: "",
      support_condition: "",
      support_type: "",
      estimated_support_amount: 400_000,
      approved_support_amount: 250_000,
      approved_at: "",
      assigned_staff_name: "",
      assigned_staff_phone: "",
      sponsor_confirmed: true,
    },
    sponsorConfirmed: true,
  });

  const byLabel = Object.fromEntries(display.rows.map((r) => [r.label, r.value]));
  assert.equal(byLabel["일반견적가"], 500_000);
  assert.equal(byLabel["확정 지원금"], 250_000);
  assert.equal(byLabel["고객 확정 지원금"], 200_000);
  assert.equal(byLabel["확정 연장 지원금"], 0);
  assert.equal(byLabel["지원금 할인 적용가"], 300_000);
  // 기사 확정 지원금 = 총 확정(250,000) - 고객 확정(200,000) = 50,000
  assert.equal(byLabel["기사 확정 지원금"], 50_000);
  assert.equal(display.debug.confirmed_customer_support_source, "derived:normal-final_discount-extension");
  assert.ok(display.fallbacksUsed.some((s) => s.includes("derived:normal-final_discount-extension") || s.includes("derived_from_price")));
});
