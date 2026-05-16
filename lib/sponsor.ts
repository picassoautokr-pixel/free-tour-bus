export const SPONSOR_SUPPORT_TYPES = [
  { value: "cash", label: "현금지원" },
  { value: "goods", label: "물품지원" },
  { value: "discount", label: "할인지원" },
  { value: "coupon", label: "쿠폰지원" },
  { value: "consulting", label: "상담/컨설팅" },
] as const;

export const SPONSOR_STATUSES = [
  { value: "pending", label: "대기" },
  { value: "reviewing", label: "검토" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "반려" },
  { value: "suspended", label: "정지" },
] as const;

export type SponsorSupportType = (typeof SPONSOR_SUPPORT_TYPES)[number]["value"];
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number]["value"];

const SUPPORT_TYPE_SET = new Set<string>(SPONSOR_SUPPORT_TYPES.map((item) => item.value));
const STATUS_SET = new Set<string>(SPONSOR_STATUSES.map((item) => item.value));

export function parseSponsorSupportType(raw: unknown): SponsorSupportType {
  const value = String(raw ?? "").trim();
  return SUPPORT_TYPE_SET.has(value) ? (value as SponsorSupportType) : "cash";
}

export function parseSponsorStatus(raw: unknown): SponsorStatus {
  const value = String(raw ?? "").trim();
  return STATUS_SET.has(value) ? (value as SponsorStatus) : "pending";
}

export function sponsorSupportTypeLabel(raw: unknown): string {
  const value = parseSponsorSupportType(raw);
  return SPONSOR_SUPPORT_TYPES.find((item) => item.value === value)?.label ?? value;
}

export function sponsorStatusLabel(raw: unknown): string {
  const value = parseSponsorStatus(raw);
  return SPONSOR_STATUSES.find((item) => item.value === value)?.label ?? value;
}

export function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

export function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const digits = value.replace(/[^\d-]/g, "");
    if (digits !== "") {
      const n = Number.parseInt(digits, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
