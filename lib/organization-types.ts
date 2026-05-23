/**
 * 고객 단체유형 — 저장/표시/스폰서 매칭 공통 정규화 (UTF-8)
 */

export const CUSTOMER_ORGANIZATION_TYPES = [
  "회사원/직장인",
  "학생",
  "종교",
  "협회",
  "동호회",
  "공공기관",
  "기타단체",
] as const;

export type CustomerOrganizationType = (typeof CUSTOMER_ORGANIZATION_TYPES)[number];

const LEGACY_ORGANIZATION_TYPE_LABELS: Record<string, CustomerOrganizationType> = {
  "회사/직장": "회사원/직장인",
  학교: "학생",
  "교회/종교단체": "종교",
  공공기관: "협회",
  "협회/단체": "동호회",
  "기타 소속단체": "공공기관",
};

export function normalizeCustomerOrganizationType(value: unknown): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (raw === "") return "";
  return LEGACY_ORGANIZATION_TYPE_LABELS[raw] ?? raw;
}

export function isKnownCustomerOrganizationType(
  value: string,
): value is CustomerOrganizationType {
  return (CUSTOMER_ORGANIZATION_TYPES as readonly string[]).includes(value);
}
