import type { SupabaseClient } from "@supabase/supabase-js";

import {
  findDefaultRule,
  normalizeApplicationGroupType,
  parseRuleTargetGroups,
  ruleMatchesApplication,
} from "@/lib/sponsor-rule-helpers";
import { parseInteger, safeText, sponsorSupportTypeLabel } from "@/lib/sponsor";
import { calculateTotalPlannedSupport } from "@/lib/support-calculation";
import { refreshApplicationSupportBreakdownSnapshot } from "@/lib/support-breakdown-snapshot";
import { refreshApplicationSponsorSupportSummary } from "@/lib/sponsor-support";

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
  maxPassengerCount: number;
  remainingDailyBudget: number | null;
}): number {
  return calculateTotalPlannedSupport({
    passengerCount: params.passengerCount ?? 0,
    supportPerPerson: params.supportPerPerson,
    supportPerCase: params.supportPerCase,
    maxSupportAmount: params.maxSupportAmount,
    maxPassengerCount: params.maxPassengerCount,
    dailyBudgetRemaining: params.remainingDailyBudget,
  });
}

function seoulTodayRange(): { start: string; end: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const ymd = formatter.format(new Date());
  const start = new Date(`${ymd}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function todayApprovedTotal(
  supabase: SupabaseClient,
  sponsorCompanyId: string,
): Promise<number> {
  const { start, end } = seoulTodayRange();
  const { data } = await supabase
    .from("sponsor_preapprovals")
    .select("approved_support_amount, estimated_support_amount")
    .eq("sponsor_company_id", sponsorCompanyId)
    .eq("status", "approved")
    .gte("approved_at", start)
    .lt("approved_at", end);
  return (Array.isArray(data) ? data : []).reduce((sum, raw) => {
    const row = raw as Record<string, unknown>;
    const amount =
      parseInteger(row.approved_support_amount) ?? parseInteger(row.estimated_support_amount) ?? 0;
    return sum + Math.max(0, amount);
  }, 0);
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
      "id, application_type, departure_region, passenger_count, departure, destination, organization_type, organization_name",
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
  const groupType = normalizeApplicationGroupType(
    safeText(applicationRow.organization_type) ||
      safeText(applicationRow.organization_name),
  );

  const { data: companies, error: companiesError } = await supabase
    .from("sponsor_companies")
    .select("id, company_name, status")
    .eq("status", "approved");
  if (companiesError) throw new Error(companiesError.message);

  const approvedCompanyIds = (Array.isArray(companies) ? companies : [])
    .map((row) => safeText((row as Record<string, unknown>).id))
    .filter(Boolean);
  if (approvedCompanyIds.length === 0) {
    await refreshApplicationSponsorSupportSummary(supabase, id);
    return { created: 0, matched: [] };
  }

  const { data: rules, error: rulesError } = await supabase
    .from("sponsor_rules")
    .select("*")
    .eq("is_active", true)
    .in("sponsor_company_id", approvedCompanyIds);
  if (rulesError) throw new Error(rulesError.message);

  const rulesByCompany = new Map<string, Record<string, unknown>[]>();
  for (const rawRule of Array.isArray(rules) ? rules : []) {
    const rule = rawRule as Record<string, unknown>;
    const sponsorCompanyId = safeText(rule.sponsor_company_id);
    if (!sponsorCompanyId) continue;
    const list = rulesByCompany.get(sponsorCompanyId) ?? [];
    list.push(rule);
    rulesByCompany.set(sponsorCompanyId, list);
  }

  const bestByCompany = new Map<
    string,
    { row: Record<string, unknown>; matched: MatchResult["matched"][number] }
  >();
  const dailyApprovedByCompany = new Map<string, number>();

  for (const [sponsorCompanyId, companyRules] of rulesByCompany) {
    const matching = companyRules.filter((rule) => {
      const serviceRegions = normalizeRegions(rule.service_regions);
      const regionMatches =
        serviceRegions.length === 0 || serviceRegions.includes(departureRegion);
      if (!regionMatches) return false;
      return ruleMatchesApplication(rule as { id: string }, {
        passengerCount,
        groupType,
      });
    });

    if (matching.length === 0) continue;

    const defaultRule = findDefaultRule(matching as { id: string }[]);
    let picked: Record<string, unknown> | null = null;
    if (defaultRule) {
      picked = matching.find((r) => safeText(r.id) === defaultRule.id) ?? defaultRule;
    } else {
      let bestAmt = -1;
      for (const candidate of matching) {
        const ruleAmt = estimateSupport({
          passengerCount,
          supportPerPerson: parseInteger(candidate.support_per_person) ?? 0,
          supportPerCase: parseInteger(candidate.support_per_case) ?? 0,
          maxSupportAmount: parseInteger(candidate.max_support_amount) ?? 0,
          maxPassengerCount: parseInteger(candidate.max_passenger_count) ?? 0,
          remainingDailyBudget: null,
        });
        if (ruleAmt > bestAmt) {
          bestAmt = ruleAmt;
          picked = candidate;
        }
      }
    }
    if (!picked) continue;

    const rule = picked as Record<string, unknown>;
    const sponsorRuleId = safeText(rule.id);
    const supportPerPerson = parseInteger(rule.support_per_person) ?? 0;
    const supportPerCase = parseInteger(rule.support_per_case) ?? 0;
    const maxSupportAmount = parseInteger(rule.max_support_amount) ?? 0;
    const maxPassengerCount = parseInteger(rule.max_passenger_count) ?? 0;
    const dailyBudget = parseInteger(rule.daily_budget) ?? 0;
    let remainingDailyBudget: number | null = null;
    if (dailyBudget > 0) {
      let approvedTotal = dailyApprovedByCompany.get(sponsorCompanyId);
      if (approvedTotal == null) {
        approvedTotal = await todayApprovedTotal(supabase, sponsorCompanyId);
        dailyApprovedByCompany.set(sponsorCompanyId, approvedTotal);
      }
      remainingDailyBudget = Math.max(dailyBudget - approvedTotal, 0);
    }
    const estimatedSupportAmount = estimateSupport({
      passengerCount,
      supportPerPerson,
      supportPerCase,
      maxSupportAmount,
      maxPassengerCount,
      remainingDailyBudget,
    });

    const serviceRegions = normalizeRegions(rule.service_regions);
    const targetGroups = parseRuleTargetGroups(rule);
    const row = {
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
        serviceRegions.length === 0 ? "전국" : `지역 ${departureRegion}`,
        passengerCount != null ? `인원 ${passengerCount}명` : "인원 미정",
        groupType ? `단체 ${groupType}` : "단체 미정",
        targetGroups.length > 0 ? `지원단체 ${targetGroups.join(",")}` : "",
        rule.is_default === true || safeText(rule.title) === "기본지원"
          ? "기본지원"
          : safeText(rule.title),
      ]
        .filter(Boolean)
        .join(" · "),
      support_kind: safeText(rule.title),
      support_form_kind: sponsorSupportTypeLabel(rule.support_type),
      support_condition_label: safeText(rule.support_condition),
    };
    bestByCompany.set(sponsorCompanyId, {
      row,
      matched: {
        sponsor_company_id: sponsorCompanyId,
        sponsor_rule_id: sponsorRuleId,
        estimated_support_amount: estimatedSupportAmount,
      },
    });
  }

  const rowsToInsert = [...bestByCompany.values()].map((item) => item.row);
  const matched = [...bestByCompany.values()].map((item) => item.matched);

  if (rowsToInsert.length === 0) {
    await refreshApplicationSponsorSupportSummary(supabase, id);
    await refreshApplicationSupportBreakdownSnapshot(supabase, id);
    return { created: 0, matched: [] };
  }

  const { error: insertError } = await supabase
    .from("sponsor_preapprovals")
    .upsert(rowsToInsert, {
      onConflict: "application_id,sponsor_company_id,sponsor_rule_id",
      ignoreDuplicates: true,
    });
  if (insertError) throw new Error(insertError.message);
  await refreshApplicationSponsorSupportSummary(supabase, id);
  await refreshApplicationSupportBreakdownSnapshot(supabase, id);

  return { created: rowsToInsert.length, matched };
}
