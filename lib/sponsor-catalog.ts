/** 후원업체 지원종류·지원형태·지원조건 카탈로그 (MVP: 회사 settings + 기본값) */

export const DEFAULT_SUPPORT_KINDS = [
  "전세버스",
  "단체여행",
  "기업복지",
  "금융상품 소개",
  "보험상담",
  "식품구매",
  "교육/연수",
] as const;

export const DEFAULT_SUPPORT_FORMS = [
  "현금지원",
  "물품지원",
  "할인지원",
  "쿠폰지원",
  "상담지원",
  "구매조건지원",
] as const;

export const DEFAULT_SUPPORT_CONDITIONS = [
  "홍보 시 지급",
  "구매 시 지급",
  "상담 완료 후 지급",
  "이용 완료 후 지급",
  "관리자 확인 후 지급",
  "담당자 배정 후 지급",
] as const;

export type SponsorDashboardSettings = {
  support_kinds?: string[];
  support_forms?: string[];
  support_conditions?: string[];
  total_budget?: number;
  monthly_budget?: number;
};

export function parseDashboardSettings(raw: unknown): SponsorDashboardSettings {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : undefined;
  return {
    support_kinds: arr(o.support_kinds),
    support_forms: arr(o.support_forms),
    support_conditions: arr(o.support_conditions),
    total_budget:
      typeof o.total_budget === "number" && Number.isFinite(o.total_budget)
        ? o.total_budget
        : undefined,
    monthly_budget:
      typeof o.monthly_budget === "number" && Number.isFinite(o.monthly_budget)
        ? o.monthly_budget
        : undefined,
  };
}

export function mergeCatalog(
  custom: string[] | undefined,
  defaults: readonly string[],
): string[] {
  const set = new Set<string>();
  for (const item of defaults) set.add(item);
  for (const item of custom ?? []) {
    const t = item.trim();
    if (t) set.add(t);
  }
  return [...set];
}

export function catalogFromSettings(settings: SponsorDashboardSettings) {
  return {
    supportKinds: mergeCatalog(settings.support_kinds, DEFAULT_SUPPORT_KINDS),
    supportForms: mergeCatalog(settings.support_forms, DEFAULT_SUPPORT_FORMS),
    supportConditions: mergeCatalog(
      settings.support_conditions,
      DEFAULT_SUPPORT_CONDITIONS,
    ),
  };
}
