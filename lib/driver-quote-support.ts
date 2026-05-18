import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildQuoteSupportBreakdown,
  calculateSupportSettlementResult,
  parseSupportInteger,
  resolveSettlementType,
} from "@/lib/support-calculation";
import { getApprovedSponsorSupport } from "@/lib/sponsor-support";

type DriverQuoteSupportRow = {
  id?: unknown;
  price?: unknown;
  estimated_support_amount?: unknown;
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
  final_customer_support_amount?: unknown;
  final_driver_support_amount?: unknown;
  final_member_price?: unknown;
  extension_support_amount?: unknown;
  sponsor_quote_enabled?: unknown;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const text = String(value).trim();
  return text === "" ? emptyLabel : text;
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

/** @deprecated use calculateSupportSettlementResult from support-calculation */
export function calculateSupportSettlement(input: {
  price: number | null;
  supportSettlementType?: string | null;
  preapprovedSupportAmount: number;
  approvedSupportAmount: number;
  customerSupportAmount: number;
  driverSupportAmount: number;
  fallbackMemberPrice?: number | null;
  extensionApplied?: boolean;
  extensionSupportAmount?: number | null;
}) {
  const result = calculateSupportSettlementResult(input);
  return {
    finalCustomerSupportAmount: result.finalCustomerSupportAmount ?? 0,
    finalDriverSupportAmount: result.finalDriverSupportAmount ?? 0,
    finalMemberPrice: result.finalMemberPrice,
  };
}

export async function recalculateDriverQuoteSupport(
  admin: SupabaseClient,
  applicationId: string,
  options?: { extensionApplied?: boolean },
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
      "id, price, support_settlement_type, preapproved_support_amount, approved_support_amount, customer_support_amount, support_discount_amount, driver_support_amount, sponsor_support_amount, sponsor_approved_support_amount, member_price, sponsor_discounted_price, final_customer_support_amount, final_driver_support_amount, final_member_price, extension_support_amount, sponsor_quote_enabled",
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
    const price = parseSupportInteger(row.price);
    const customerSupportAmount =
      parseSupportInteger(row.customer_support_amount) ??
      parseSupportInteger(row.support_discount_amount) ??
      0;
    const preapprovedSupportAmount =
      parseSupportInteger(row.preapproved_support_amount) ??
      parseSupportInteger(row.estimated_support_amount) ??
      parseSupportInteger(row.sponsor_support_amount) ??
      sponsorSummary.preapproved_support_amount_total ??
      approvedSupportAmount;
    const driverSupportAmount =
      parseSupportInteger(row.driver_support_amount) ??
      Math.max(preapprovedSupportAmount - customerSupportAmount, 0);
    const activePreapprovedSupportAmount =
      approvedSupportAmount > 0 ||
      sponsorSummary.status === "preapproved" ||
      sponsorSummary.status === "mixed"
        ? preapprovedSupportAmount
        : preapprovedSupportAmount;
    const cappedCustomerSupportAmount = Math.min(
      customerSupportAmount,
      activePreapprovedSupportAmount,
      price ?? Number.MAX_SAFE_INTEGER,
    );
    const settlement = calculateSupportSettlementResult({
      price,
      supportSettlementType: resolveSettlementType(row.support_settlement_type),
      preapprovedSupportAmount: activePreapprovedSupportAmount,
      approvedSupportAmount,
      customerSupportAmount: cappedCustomerSupportAmount,
      driverSupportAmount,
      fallbackMemberPrice:
        parseSupportInteger(row.member_price) ?? parseSupportInteger(row.sponsor_discounted_price),
      extensionApplied: options?.extensionApplied,
      extensionSupportAmount: parseSupportInteger(row.extension_support_amount),
    });
    const breakdown = buildQuoteSupportBreakdown(
      {
        ...row,
        price,
        preapproved_support_amount: activePreapprovedSupportAmount,
        approved_support_amount: approvedSupportAmount,
        customer_support_amount: cappedCustomerSupportAmount,
        driver_support_amount: driverSupportAmount,
        final_customer_support_amount: settlement.finalCustomerSupportAmount,
        final_driver_support_amount: settlement.finalDriverSupportAmount,
        sponsor_quote_enabled: true,
        extension_applied: options?.extensionApplied,
        extension_support_amount: settlement.extensionSupportAmount,
      },
      { applicationApprovedSupportTotal: approvedSupportAmount },
    );
    const plannedMemberPrice = breakdown.supportDiscountPlannedPrice;

    const updatePayload: Record<string, unknown> = {
      support_settlement_type: resolveSettlementType(row.support_settlement_type),
      preapproved_support_amount: activePreapprovedSupportAmount,
      approved_support_amount: approvedSupportAmount > 0 ? approvedSupportAmount : null,
      customer_support_amount: cappedCustomerSupportAmount,
      driver_support_amount: driverSupportAmount,
      sponsor_support_amount: activePreapprovedSupportAmount,
      estimated_support_amount: activePreapprovedSupportAmount,
      member_price: plannedMemberPrice,
      sponsor_discounted_price: plannedMemberPrice,
      support_recalculated_at: new Date().toISOString(),
    };

    if (approvedSupportAmount > 0) {
      updatePayload.final_customer_support_amount = settlement.finalCustomerSupportAmount;
      updatePayload.final_driver_support_amount = settlement.finalDriverSupportAmount;
      updatePayload.final_member_price = settlement.finalMemberPrice;
      if (settlement.extensionSupportAmount != null) {
        updatePayload.extension_support_amount = settlement.extensionSupportAmount;
      }
    } else {
      updatePayload.final_customer_support_amount = null;
      updatePayload.final_driver_support_amount = null;
      updatePayload.final_member_price = null;
      updatePayload.extension_support_amount = null;
    }

    const { error } = await admin.from("driver_quotes").update(updatePayload).eq("id", id);
    if (isMissingColumnError(error)) return { ok: true, updated, skipped: "missing_columns" };
    if (error) throw new Error(error.message);
    updated += 1;
  }

  return { ok: true, updated };
}
