import type { PartnerDriverDetail } from "@/lib/partner-drivers-admin";

export type { PartnerDriverDetail };

export const PARTNER_STATUS_OPTIONS = [
  { value: "pending", label: "접수완료" },
  { value: "reviewing", label: "검토중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
] as const;

export type PartnerStatusValue =
  (typeof PARTNER_STATUS_OPTIONS)[number]["value"];

export function parsePartnerStatus(raw: string): PartnerStatusValue | null {
  const n = raw.trim().toLowerCase();
  if (n === "approve" || n === "approved") return "approved";
  if (n === "reject" || n === "rejected" || n === "denied") return "rejected";
  if (n === "reviewing" || n === "review") return "reviewing";
  if (n === "pending") return "pending";
  return null;
}

export function coercePartnerStatus(raw: string): PartnerStatusValue {
  return parsePartnerStatus(raw) ?? "pending";
}

export function statusLabelForSearch(raw: string): string {
  const known = parsePartnerStatus(raw);
  if (known === "pending") return "접수완료";
  if (known === "reviewing") return "검토중";
  if (known === "approved") return "승인완료";
  if (known === "rejected") return "반려";
  return raw.trim();
}

export function statusLabelForExport(raw: string): string {
  return statusLabelForSearch(raw);
}

export function formatCreatedAt(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ymdTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function referralSourceLabel(source: string): string {
  const trimmed = source.trim();
  if (trimmed === "quote_referral") return "견적요청 추천";
  if (trimmed === "quote_referral_phone_mismatch") {
    return "추천 링크 전화번호 불일치";
  }
  if (trimmed === "manual_phone_referral") return "추천인 연락처 직접 입력";
  if (trimmed === "manual_phone_referral_unregistered") {
    return "추천인 연락처 직접 입력(미가입)";
  }
  return trimmed === "" ? "—" : trimmed;
}

export function referralStatusLabel(row: PartnerDriverDetail): string {
  if (row.referral_source.trim() === "quote_referral_phone_mismatch") {
    return "추천인 자동등록 보류";
  }
  if (
    row.referral_source.trim() === "quote_referral" ||
    row.referral_source.trim() === "manual_phone_referral" ||
    row.referrer_partner_driver_id.trim() !== ""
  ) {
    return "추천인 자동등록 완료";
  }
  if (row.referral_source.trim() === "manual_phone_referral_unregistered") {
    return "미가입 추천인";
  }
  return "일반가입";
}

export type PartnerSortKey =
  | "created_at"
  | "company_name"
  | "manager_name"
  | "phone"
  | "email"
  | "region"
  | "business_type"
  | "vehicle_number"
  | "passenger_capacity"
  | "status";

export type PartnerFilterValue = "all" | PartnerStatusValue;

export function referralPhoneMatchLabel(row: PartnerDriverDetail): string {
  if (row.referral_source.trim() === "quote_referral_phone_mismatch") {
    return "불일치";
  }
  if (
    row.referral_source.trim() === "quote_referral" ||
    row.referral_source.trim() === "manual_phone_referral" ||
    row.referrer_partner_driver_id.trim() !== ""
  ) {
    return "일치";
  }
  if (row.referral_source.trim() === "manual_phone_referral_unregistered") {
    return "미가입";
  }
  return "—";
}
