import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_SPONSOR_RULE_PATCH,
  DEFAULT_SPONSOR_RULE_TITLE,
} from "@/lib/sponsor-rule-helpers";
import { safeText } from "@/lib/sponsor";

function isMissingColumnError(error: { message?: string; code?: string } | null): boolean {
  return (
    error?.code === "42703" ||
    /is_default|does not exist|column/i.test(error?.message ?? "")
  );
}

/** 후원사 승인 시 1회 — 기본지원 중복 생성 방지 */
export async function ensureDefaultSponsorRuleForCompany(
  admin: SupabaseClient,
  sponsorCompanyId: string,
): Promise<{ id: string } | null> {
  const companyId = sponsorCompanyId.trim();
  if (!companyId) return null;

  const { data: byFlag, error: flagError } = await admin
    .from("sponsor_rules")
    .select("id, title, is_default")
    .eq("sponsor_company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  if (!flagError && byFlag) {
    return { id: safeText((byFlag as Record<string, unknown>).id) };
  }

  const { data: byTitle } = await admin
    .from("sponsor_rules")
    .select("id, title")
    .eq("sponsor_company_id", companyId)
    .eq("title", DEFAULT_SPONSOR_RULE_TITLE)
    .maybeSingle();

  if (byTitle) {
    const ruleId = safeText((byTitle as Record<string, unknown>).id);
    if (!flagError || !isMissingColumnError(flagError)) {
      await admin
        .from("sponsor_rules")
        .update({ is_default: true, is_active: true })
        .eq("id", ruleId);
    }
    return { id: ruleId };
  }

  const insertPayload: Record<string, unknown> = {
    sponsor_company_id: companyId,
    ...DEFAULT_SPONSOR_RULE_PATCH,
    is_default: true,
    service_regions: [],
    memo: "",
  };

  let { data: inserted, error } = await admin
    .from("sponsor_rules")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error && isMissingColumnError(error)) {
    const legacy = { ...insertPayload };
    delete legacy.is_default;
    ({ data: inserted, error } = await admin
      .from("sponsor_rules")
      .insert(legacy)
      .select("id")
      .single());
  }

  if (error || !inserted) return null;
  return { id: safeText((inserted as Record<string, unknown>).id) };
}
