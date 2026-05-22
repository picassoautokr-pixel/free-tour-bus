import { calculateTotalPlannedSupport } from "@/lib/support-calculation";
import { normalizeStringArray, parseInteger, safeText, sponsorSupportTypeLabel } from "@/lib/sponsor";

export const SPONSOR_TARGET_GROUP_OPTIONS = [
  "회사원/직장인",
  "학생",
  "종교",
  "협회",
  "동호회",
  "공공기관",
  "기타단체",
] as const;

export const SPONSOR_SUPPORT_CONDITION_OPTIONS = [
  { value: "홍보시", label: "홍보시" },
  { value: "상담완료시", label: "상담완료시" },
  { value: "구매완료시", label: "구매완료시" },
] as const;

export const DEFAULT_SPONSOR_RULE_TITLE = "기본지원";

export const DEFAULT_SPONSOR_RULE_PATCH = {
  title: DEFAULT_SPONSOR_RULE_TITLE,
  support_per_person: 20_000,
  support_per_case: 0,
  max_support_amount: 900_000,
  min_passenger_count: 5,
  target_groups: ["회사원/직장인"],
  target_group: "회사원/직장인",
  support_type: "cash",
  support_condition: "홍보시",
  is_active: true,
} as const;

export type SponsorRuleRecord = Record<string, unknown> & {
  id: string;
  title?: string;
  support_per_person?: number;
  support_per_case?: number;
  max_support_amount?: number;
  min_passenger_count?: number | null;
  max_passenger_count?: number | null;
  target_group?: string;
  target_groups?: string[];
  support_condition?: string;
  support_type?: string;
  service_regions?: string[];
  is_active?: boolean;
};

export function parseRuleTargetGroups(rule: Record<string, unknown>): string[] {
  const fromArray = normalizeStringArray(rule.target_groups);
  if (fromArray.length > 0) return fromArray;
  const legacy = safeText(rule.target_group);
  if (!legacy) return [];
  return legacy.split(/[,·/]/).map((s) => s.trim()).filter(Boolean);
}

export function ruleMatchesPassengers(
  rule: SponsorRuleRecord,
  passengerCount: number | null,
): boolean {
  if (rule.is_active === false) return false;
  const min = parseInteger(rule.min_passenger_count) ?? 0;
  const passengers = passengerCount ?? 0;
  if (passengers < min) return false;
  const max = parseInteger(rule.max_passenger_count);
  if (max != null && max > 0 && passengers > max) return false;
  return true;
}

export function filterRulesForPassengers(
  rules: SponsorRuleRecord[],
  passengerCount: number | null,
): SponsorRuleRecord[] {
  return rules.filter((r) => ruleMatchesPassengers(r, passengerCount));
}

export function findDefaultRule(rules: SponsorRuleRecord[]): SponsorRuleRecord | null {
  return (
    rules.find((r) => safeText(r.title) === DEFAULT_SPONSOR_RULE_TITLE) ??
    rules.find((r) => r.is_active !== false) ??
    null
  );
}

export function calculatePlannedSupportFromRule(
  rule: SponsorRuleRecord,
  passengerCount: number,
): number {
  return calculateTotalPlannedSupport({
    passengerCount,
    supportPerPerson: parseInteger(rule.support_per_person) ?? 0,
    supportPerCase: parseInteger(rule.support_per_case) ?? 0,
    maxSupportAmount: parseInteger(rule.max_support_amount) ?? 0,
    maxPassengerCount: parseInteger(rule.max_passenger_count) ?? 0,
    dailyBudgetRemaining: null,
  });
}

export function ruleSupportFormLabel(rule: SponsorRuleRecord): string {
  return sponsorSupportTypeLabel(rule.support_type);
}

export function ruleSupportConditionLabel(rule: SponsorRuleRecord): string {
  return safeText(rule.support_condition, "—");
}

export function staffMatchesDepartureRegion(
  staff: { service_regions?: string[] | unknown; is_active?: boolean },
  departureRegion: string,
): boolean {
  if (staff.is_active === false) return false;
  const regions = normalizeStringArray(staff.service_regions);
  if (regions.length === 0) return true;
  const region = departureRegion.trim();
  if (!region) return true;
  return regions.includes(region);
}

export function sortStaffForCall<T extends { id: string; service_regions?: unknown }>(
  staff: T[],
  departureRegion: string,
): T[] {
  const matched: T[] = [];
  const other: T[] = [];
  for (const s of staff) {
    if (staffMatchesDepartureRegion(s, departureRegion)) matched.push(s);
    else other.push(s);
  }
  return [...matched, ...other];
}
