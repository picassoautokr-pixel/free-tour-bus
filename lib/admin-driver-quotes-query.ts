/**
 * driver_quotes — 존재 컬럼만 단계적 select (UTF-8)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const DRIVER_QUOTE_SELECT_CANDIDATES = [
  "id, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, created_at, support_breakdown",
  "id, application_id, partner_driver_id, price, vehicle_type, available_time, message, status, created_at, support_breakdown",
  "id, application_id, partner_driver_id, price, vehicle_type, available_time, message, status, created_at",
  "id, application_id, partner_driver_id, price, created_at",
] as const;

export function isMissingColumnError(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|column .* does not exist|could not find .* column|schema cache/i.test(
      error?.message ?? "",
    )
  );
}

export async function queryDriverQuotesForApplication(
  admin: SupabaseClient,
  applicationId: string,
): Promise<Record<string, unknown>[]> {
  let lastMessage = "driver_quotes 조회에 실패했습니다.";

  for (const select of DRIVER_QUOTE_SELECT_CANDIDATES) {
    const res = await admin
      .from("driver_quotes")
      .select(select as string)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });

    if (!res.error) {
      const rows = res.data as unknown;
      return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    }

    lastMessage = res.error.message;
    if (!isMissingColumnError(res.error)) {
      throw new Error(lastMessage);
    }
  }

  throw new Error(lastMessage);
}
