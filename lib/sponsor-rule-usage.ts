import type { SupabaseClient } from "@supabase/supabase-js";

import { safeText } from "@/lib/sponsor";

/** 견적·지원 연결 여부 — 연결 시 hard delete 금지 */
export async function sponsorRuleIsInUse(
  admin: SupabaseClient,
  ruleId: string,
  sponsorCompanyId: string,
): Promise<boolean> {
  const id = ruleId.trim();
  if (!id) return false;

  const { count, error } = await admin
    .from("sponsor_preapprovals")
    .select("id", { count: "exact", head: true })
    .eq("sponsor_rule_id", id)
    .eq("sponsor_company_id", sponsorCompanyId);

  if (error) return true;
  return (count ?? 0) > 0;
}
