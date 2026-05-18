import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildConfirmedDbPayload,
  clearConfirmedDbPayload,
  computeConfirmedFromPlanned,
  DRIVER_QUOTE_SUPPORT_SELECT,
  readPlannedSupport,
  type QuoteSupportRow,
} from "@/lib/quote-support-snapshot";
import { parseSupportInteger, resolveSettlementType } from "@/lib/support-calculation";
import { getApprovedSponsorSupport } from "@/lib/sponsor-support";

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

export async function recalculateDriverQuoteSupport(
  admin: SupabaseClient,
  applicationId: string,
  options?: { extensionApplied?: boolean },
) {
  const safeApplicationId = safeText(applicationId);
  if (!safeApplicationId) return { ok: true, updated: 0 };

  const sponsorSummary = await getApprovedSponsorSupport(admin, safeApplicationId);
  const confirmedTotal = Math.max(0, sponsorSummary.approved_support_amount_total);

  const result = await admin
    .from("driver_quotes")
    .select(DRIVER_QUOTE_SUPPORT_SELECT)
    .eq("application_id", safeApplicationId);

  if (isMissingColumnError(result.error)) {
    return { ok: true, updated: 0, skipped: "missing_columns" };
  }
  if (result.error) throw new Error(result.error.message);

  const rows = Array.isArray(result.data) ? (result.data as QuoteSupportRow[]) : [];
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = safeText(row.id);
    if (!id) continue;

    const price = parseSupportInteger(row.price);
    if (price == null) continue;

    const planned = readPlannedSupport(row, price);
    if (!planned) {
      skipped += 1;
      continue;
    }

    const settlementType = resolveSettlementType(row.support_settlement_type);

    if (confirmedTotal <= 0) {
      const { error } = await admin
        .from("driver_quotes")
        .update(clearConfirmedDbPayload())
        .eq("id", id);
      if (isMissingColumnError(error)) return { ok: true, updated, skipped: "missing_columns" };
      if (error) throw new Error(error.message);
      updated += 1;
      continue;
    }

    const computed = computeConfirmedFromPlanned({
      normalPrice: price,
      settlementType,
      planned,
      confirmedTotal,
      extensionApplied: options?.extensionApplied,
      extensionSupportAmount: parseSupportInteger(row.extension_support_amount),
    });

    if ("error" in computed) {
      skipped += 1;
      continue;
    }

    const { error } = await admin
      .from("driver_quotes")
      .update(buildConfirmedDbPayload(computed))
      .eq("id", id);

    if (isMissingColumnError(error)) return { ok: true, updated, skipped: "missing_columns" };
    if (error) throw new Error(error.message);
    updated += 1;
  }

  return { ok: true, updated, skipped };
}

/** @deprecated */
export function calculateSupportSettlement(input: {
  price: number | null;
  supportSettlementType?: string | null;
  preapprovedSupportAmount: number;
  approvedSupportAmount: number;
  customerSupportAmount: number;
  driverSupportAmount: number;
}) {
  const price = input.price ?? 0;
  const planned = {
    total: input.preapprovedSupportAmount,
    customer: input.customerSupportAmount,
    driver: input.driverSupportAmount,
    discountPrice: Math.max(price - input.customerSupportAmount, 0),
    finalPrice: Math.max(price - input.customerSupportAmount, 0),
  };
  if (input.approvedSupportAmount <= 0) {
    return {
      finalCustomerSupportAmount: planned.customer,
      finalDriverSupportAmount: planned.driver,
      finalMemberPrice: planned.discountPrice,
    };
  }
  const confirmed = computeConfirmedFromPlanned({
    normalPrice: price,
    settlementType: resolveSettlementType(input.supportSettlementType),
    planned,
    confirmedTotal: input.approvedSupportAmount,
  });
  if ("error" in confirmed) {
    return {
      finalCustomerSupportAmount: null,
      finalDriverSupportAmount: null,
      finalMemberPrice: null,
    };
  }
  return {
    finalCustomerSupportAmount: confirmed.customer,
    finalDriverSupportAmount: confirmed.driver,
    finalMemberPrice: confirmed.discountPrice,
  };
}
