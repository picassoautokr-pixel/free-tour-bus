import type { SupabaseClient } from "@supabase/supabase-js";

import { getApprovedSponsorSupport } from "@/lib/sponsor-support";

type DriverQuoteSupportRow = {
  id?: unknown;
  price?: unknown;
  support_settlement_type?: unknown;
  preapproved_support_amount?: unknown;
  approved_support_amount?: unknown;
  customer_support_amount?: unknown;
  support_discount_amount?: unknown;
  driver_support_amount?: unknown;
  sponsor_support_amount?: unknown;
  sponsor_approved_support_amount?: unknown;
  member_price?: unknown;
  sponsor_discounted_price?: unknown;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const text = String(value).trim();
  return text === "" ? emptyLabel : text;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|column .* does not exist|could not find .* column|schema cache/i.test(
      error?.message ?? "",
    )
  );
}

export function calculateSupportSettlement(input: {
  price: number | null;
  supportSettlementType?: string | null;
  preapprovedSupportAmount: number;
  approvedSupportAmount: number;
  customerSupportAmount: number;
  driverSupportAmount: number;
  fallbackMemberPrice?: number | null;
}) {
  const price = input.price;
  const approvedSupportAmount = Math.max(0, input.approvedSupportAmount);
  const customerSupportAmount = Math.max(0, input.customerSupportAmount);
  const driverSupportAmount = Math.max(0, input.driverSupportAmount);
  const preapprovedSupportAmount = Math.max(0, input.preapprovedSupportAmount);

  if (approvedSupportAmount <= 0) {
    return {
      finalCustomerSupportAmount: 0,
      finalDriverSupportAmount: 0,
      finalMemberPrice: price == null ? input.fallbackMemberPrice ?? null : price,
    };
  }

  if (input.supportSettlementType === "ratio" && preapprovedSupportAmount > 0) {
    const customerRatio = customerSupportAmount / preapprovedSupportAmount;
    const finalCustomerSupportAmount = Math.round(approvedSupportAmount * customerRatio);
    const finalDriverSupportAmount = Math.max(
      approvedSupportAmount - finalCustomerSupportAmount,
      0,
    );
    return {
      finalCustomerSupportAmount,
      finalDriverSupportAmount,
      finalMemberPrice:
        price == null ? input.fallbackMemberPrice ?? null : Math.max(price - finalCustomerSupportAmount, 0),
    };
  }

  const finalCustomerSupportAmount = Math.min(customerSupportAmount, approvedSupportAmount);
  const finalDriverSupportAmount = Math.max(
    approvedSupportAmount - finalCustomerSupportAmount,
    0,
  );
  return {
    finalCustomerSupportAmount,
    finalDriverSupportAmount,
    finalMemberPrice:
      price == null ? input.fallbackMemberPrice ?? null : Math.max(price - finalCustomerSupportAmount, 0),
  };
}

export async function recalculateDriverQuoteSupport(
  admin: SupabaseClient,
  applicationId: string,
) {
  const safeApplicationId = safeText(applicationId);
  if (!safeApplicationId) return { ok: true, updated: 0 };

  const sponsorSummary = await getApprovedSponsorSupport(admin, safeApplicationId);
  const approvedSupportAmount = Math.max(
    0,
    sponsorSummary.approved_support_amount_total,
  );

  const result = await admin
    .from("driver_quotes")
    .select(
      "id, price, support_settlement_type, preapproved_support_amount, approved_support_amount, customer_support_amount, support_discount_amount, driver_support_amount, sponsor_support_amount, sponsor_approved_support_amount, member_price, sponsor_discounted_price",
    )
    .eq("application_id", safeApplicationId);

  if (isMissingColumnError(result.error)) {
    return { ok: true, updated: 0, skipped: "missing_columns" };
  }
  if (result.error) throw new Error(result.error.message);

  const rows = Array.isArray(result.data) ? (result.data as DriverQuoteSupportRow[]) : [];
  let updated = 0;
  for (const row of rows) {
    const id = safeText(row.id);
    if (!id) continue;
    const price = parseInteger(row.price);
    const customerSupportAmount =
      parseInteger(row.customer_support_amount) ??
      parseInteger(row.support_discount_amount) ??
      0;
    const preapprovedSupportAmount =
      parseInteger(row.preapproved_support_amount) ??
      parseInteger(row.sponsor_support_amount) ??
      parseInteger(row.sponsor_approved_support_amount) ??
      approvedSupportAmount;
    const driverSupportAmount =
      parseInteger(row.driver_support_amount) ??
      Math.max(preapprovedSupportAmount - customerSupportAmount, 0);
    const settlement = calculateSupportSettlement({
      price,
      supportSettlementType: safeText(row.support_settlement_type, "client_priority"),
      preapprovedSupportAmount,
      approvedSupportAmount,
      customerSupportAmount,
      driverSupportAmount,
      fallbackMemberPrice:
        parseInteger(row.member_price) ?? parseInteger(row.sponsor_discounted_price),
    });

    const { error } = await admin
      .from("driver_quotes")
      .update({
        support_settlement_type:
          safeText(row.support_settlement_type) === "ratio" ? "ratio" : "client_priority",
        preapproved_support_amount: preapprovedSupportAmount,
        approved_support_amount: approvedSupportAmount,
        customer_support_amount: customerSupportAmount,
        driver_support_amount: driverSupportAmount,
        final_customer_support_amount: settlement.finalCustomerSupportAmount,
        final_driver_support_amount: settlement.finalDriverSupportAmount,
        final_member_price: settlement.finalMemberPrice,
        support_recalculated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (isMissingColumnError(error)) return { ok: true, updated, skipped: "missing_columns" };
    if (error) throw new Error(error.message);
    updated += 1;
  }

  return { ok: true, updated };
}
