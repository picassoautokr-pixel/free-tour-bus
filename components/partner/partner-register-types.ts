/**
 * components/partner/partner-register-types.ts
 *
 * 제휴기사 등록 페이지에서 사용하는 공유 타입 및 유틸 함수
 */

export const BUSINESS_TYPE_OPTIONS = ["개인 기사", "법인 회사"] as const;
export const BUS_TYPE_OPTIONS = ["일반버스", "프리미엄버스"] as const;

export type BusinessTypeOption = (typeof BUSINESS_TYPE_OPTIONS)[number];

export type PartnerInsertPayload = {
  company_name: string;
  manager_name: string;
  phone: string;
  email: string | null;
  region: string;
  business_type: string;
  bus_types: string[];
  vehicle_model: string;
  vehicle_number: string;
  passenger_capacity: number;
  business_license_url: string | null;
  business_license_name: string | null;
  memo: string | null;
  referral_token?: string;
  referral_phone?: string;
  actual_referrer_phone?: string;
};

export type DuplicateRegistration = {
  duplicate: true;
  status: string;
  title?: string;
  message?: string;
  action_label?: string;
  action_url?: string;
  secondary_action_label?: string;
  secondary_action_url?: string;
};

export function formatPhoneNumber(value: string): string {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
}

export function makePartnerUploadKey(fileName: string): string {
  const extRaw = fileName.split(".").pop() ?? "";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}${Date.now()}`;
  const safeRand = String(rand).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `partner/${Date.now()}_${safeRand}${ext ? `.${ext}` : ""}`;
}

export function isSimpleEmail(s: string): boolean {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
