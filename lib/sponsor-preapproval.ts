import type { SupabaseClient } from "@supabase/supabase-js";

import { parseInteger, safeText } from "@/lib/sponsor";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type MatchResult = {
  created: number;
  matched: Array<{
    sponsor_company_id: string;
    sponsor_rule_id: string;
    estimated_support_amount: number;
  }>;
};

function normalizeRegions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeText(item)).filter(Boolean);
}

function passengerInRange(
  passengerCount: number | null,
  minValue: unknown,
  maxValue: unknown,
): boolean {
  const min = parseInteger(minValue);
  const max = parseInteger(maxValue);
  if (min != null && (passengerCount == null || passengerCount < min)) return false;
  if (max != null && (passengerCount == null || passengerCount > max)) return false;
  return true;
}

function estimateSupport(params: {
  passengerCount: number | null;
  supportPerPerson: number;
  supportPerCase: number;
  maxSupportAmount: number;
}): number {
  const raw =
    (params.passengerCount ?? 0) * params.supportPerPerson + params.supportPerCase;
  if (params.maxSupportAmount > 0) return Math.min(raw, params.maxSupportAmount);
  return raw;
}

export async function matchSponsorPreapprovals(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<MatchResult> {
  const id = applicationId.trim();
  if (!id) return { created: 0, matched: [] };

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select(
      "id, application_type, departure_region, passenger_count, departure, destination",
    )
    .eq("id", id)
    .maybeSingle();

  if (applicationError || !application) {
    if (applicationError) throw new Error(applicationError.message);
    return { created: 0, matched: [] };
  }

  const applicationRow = application as Record<string, unknown>;
  if (safeText(applicationRow.application_type) !== APPLICATION_TYPE_NEW_BOOKING) {
    return { created: 0, matched: [] };
  }

  const departureRegion = safeText(applicationRow.departure_region);
  const passengerCount = parseInteger(applicationRow.passenger_count);

  const { data: companies, error: companiesError } = await supabase
    .from("sponsor_companies")
    .select("id, company_name, status")
    .eq("status", "approved");
  if (companiesError) throw new Error(companiesError.message);

  const approvedCompanyIds = (Array.isArray(companies) ? companies : [])
    .map((row) => safeText((row as Record<string, unknown>).id))
    .filter(Boolean);
  if (approvedCompanyIds.length === 0) return { created: 0, matched: [] };

  const { data: rules, error: rulesError } = await supabase
    .from("sponsor_rules")
    .select("*")
    .eq("is_active", true)
    .in("sponsor_company_id", approvedCompanyIds);
  if (rulesError) throw new Error(rulesError.message);

  const rowsToInsert: Array<Record<string, unknown>> = [];
  const matched: MatchResult["matched"] = [];

  for (const rawRule of Array.isArray(rules) ? rules : []) {
    const rule = rawRule as Record<string, unknown>;
    const sponsorCompanyId = safeText(rule.sponsor_company_id);
    const sponsorRuleId = safeText(rule.id);
    if (!sponsorCompanyId || !sponsorRuleId) continue;

    const serviceRegions = normalizeRegions(rule.service_regions);
    const regionMatches =
      serviceRegions.length === 0 || serviceRegions.includes(departureRegion);
    if (!regionMatches) continue;

    if (
      !passengerInRange(
        passengerCount,
        rule.min_passenger_count,
        rule.max_passenger_count,
      )
    ) {
      continue;
    }

    const supportPerPerson = parseInteger(rule.support_per_person) ?? 0;
    const supportPerCase = parseInteger(rule.support_per_case) ?? 0;
    const maxSupportAmount = parseInteger(rule.max_support_amount) ?? 0;
    const estimatedSupportAmount = estimateSupport({
      passengerCount,
      supportPerPerson,
      supportPerCase,
      maxSupportAmount,
    });

    rowsToInsert.push({
      application_id: id,
      sponsor_company_id: sponsorCompanyId,
      sponsor_rule_id: sponsorRuleId,
      status: "preapproved",
      estimated_support_amount: estimatedSupportAmount,
      support_per_person: supportPerPerson,
      support_per_case: supportPerCase,
      passenger_count: passengerCount,
      matched_region: serviceRegions.length === 0 ? "전국" : departureRegion,
      matched_reason: [
        serviceRegions.length === 0
          ? "전국 조건"
          : `지역 ${departureRegion}`,
        passengerCount != null ? `인원 ${passengerCount}명` : "인원 미정",
      ].join(" · "),
    });
    matched.push({
      sponsor_company_id: sponsorCompanyId,
      sponsor_rule_id: sponsorRuleId,
      estimated_support_amount: estimatedSupportAmount,
    });
  }

  if (rowsToInsert.length === 0) return { created: 0, matched: [] };

  const { error: insertError } = await supabase
    .from("sponsor_preapprovals")
    .upsert(rowsToInsert, {
      onConflict: "application_id,sponsor_company_id,sponsor_rule_id",
      ignoreDuplicates: true,
    });
  if (insertError) throw new Error(insertError.message);

  return { created: rowsToInsert.length, matched };
}
