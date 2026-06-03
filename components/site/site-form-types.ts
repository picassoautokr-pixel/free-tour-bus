/**
 * (site)/page.tsx 에서 추출한 공유 타입·상수·유틸 함수
 */

import type { ServiceRegion } from "@/lib/regions";

// ── 신청 유형 ────────────────────────────────────────────────────────────────
export const APPLICATION_TYPE_RESERVATION_DONE = "이미 예약을 완료하신 경우";
export const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

export const customerApplicationTypes = [
  APPLICATION_TYPE_NEW_BOOKING,
  APPLICATION_TYPE_RESERVATION_DONE,
] as const;

/** 증빙자료 첨부 영역을 표시하는 신청 유형 */
export const APPLICATION_TYPE_REQUIRES_ATTACHMENT = APPLICATION_TYPE_RESERVATION_DONE;

// ── 선택지 ───────────────────────────────────────────────────────────────────
export const tripTypes = ["왕복", "편도"] as const;
export const busGrades = ["일반", "프리미엄"] as const;

export const TIME_SLOT_OPTIONS = [
  { value: "dawn", label: "새벽", db: "새벽" },
  { value: "morning", label: "오전", db: "오전" },
  { value: "afternoon", label: "오후", db: "오후" },
  { value: "evening", label: "저녁", db: "저녁" },
  { value: "undecided", label: "미정", db: "미정" },
  { value: "negotiated", label: "협의", db: "협의" },
  { value: "custom", label: "직접입력", db: "" },
] as const;

export type DepartureTimeSlot = (typeof TIME_SLOT_OPTIONS)[number]["value"];

// ── 타입 정의 ────────────────────────────────────────────────────────────────
/** Supabase `applications`에 넣는 컬럼만 (id·created_at 등 자동값 제외) */
export type ApplicationInsertPayload = {
  receipt_number: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_detail: string;
  departure_region: string | null;
  destination: string;
  destination_detail: string;
  stopovers?: string[] | null;
  departure_date: string | null;
  departure_time: string;
  return_date: string | null;
  passenger_count: number;
  applicant_name: string;
  phone: string;
  organization_name: string;
  organization_type: string | null;
  request_message: string;
  file_url?: string | null;
  file_name?: string | null;
  status: string;
  quote_deadline_at?: string | null;
  quote_limit_count?: number | null;
  target_normal_price?: number | null;
  target_member_price?: number | null;
  preferred_quote_types?: string[];
  quote_status?: string;
  extension_round?: number;
  support_client_reward_ratio?: number;
  support_driver_ratio?: number;
  client_lookup_password?: string;
  client_lookup_password_set_at?: string;
};

/** 완료 모달 접수 요약 */
export type SubmitSuccessSummary = {
  receiptNumber: string;
  applicationType: string;
  applicantName: string;
  phone: string;
  departure: string;
  destination: string;
  departureDateTime: string;
};

export type FormData = {
  applicationType: string;
  tripType: string;
  busGrade: string;
  departure: string;
  departureRegion: ServiceRegion | "";
  departureRegionManual: boolean;
  destination: string;
  stopovers: string;
  departureDate: string;
  departureTimeSlot: DepartureTimeSlot;
  departureTimeCustom: string;
  returnDate: string;
  passengerCount: string;
  applicantName: string;
  phone: string;
  lookupPassword: string;
  lookupPasswordConfirm: string;
  organizationName: string;
  organizationType: string;
  requestMessage: string;
  quoteDeadlineOption: "12" | "24" | "36" | "48" | "custom";
  quoteDeadlineCustomHours: string;
  quoteLimitOption: "5" | "10" | "15" | "custom";
  quoteLimitCustomCount: string;
  targetNormalPrice: string;
  targetMemberPrice: string;
  preferredNormalQuote: boolean;
  preferredDiscountQuote: boolean;
};

export const INITIAL_FORM_DATA: FormData = {
  applicationType: APPLICATION_TYPE_NEW_BOOKING,
  tripType: "왕복",
  busGrade: "일반",
  departure: "",
  departureRegion: "",
  departureRegionManual: false,
  destination: "",
  stopovers: "",
  departureDate: "",
  departureTimeSlot: "custom",
  departureTimeCustom: "",
  returnDate: "",
  passengerCount: "",
  applicantName: "",
  phone: "",
  lookupPassword: "",
  lookupPasswordConfirm: "",
  organizationName: "",
  organizationType: "",
  requestMessage: "",
  quoteDeadlineOption: "12",
  quoteDeadlineCustomHours: "",
  quoteLimitOption: "5",
  quoteLimitCustomCount: "",
  targetNormalPrice: "",
  targetMemberPrice: "",
  preferredNormalQuote: true,
  preferredDiscountQuote: true,
};

export const DRAFT_STORAGE_KEY = "freeTourBusFormDraft";

// ── 유틸 함수 ────────────────────────────────────────────────────────────────
/** 모바일 입력 UX용: 숫자만 남기고 010-1234-5678 형태로 포맷 */
export function formatPhoneNumber(value: string): string {
  const numbers = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`;
}

/** FB-YYYYMMDD-#### (고객 로컬 날짜 기준) */
export function generateReceiptNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  let n = 0;
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    n = (buf[0] ?? 0) % 10000;
  } else {
    n = Math.floor(Math.random() * 10000);
  }
  const suffix = String(n).padStart(4, "0");
  return `FB-${y}${m}${d}-${suffix}`;
}

export function makeUploadObjectKey(fileName: string): string {
  const extRaw = fileName.split(".").pop() ?? "";
  const ext = extRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}${Date.now()}`;
  const safeRand = String(rand).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const safeFileName = `${Date.now()}_${safeRand}${ext ? `.${ext}` : ""}`;
  return `applications/${safeFileName}`;
}

/** DB `departure_time` 컬럼에 저장할 문자열 */
export function resolveDepartureTimeForDb(
  slot: DepartureTimeSlot,
  customHhMm: string,
): string {
  if (slot === "custom") return customHhMm.trim();
  const found = TIME_SLOT_OPTIONS.find((o) => o.value === slot);
  return found?.db ?? "오전";
}

export function formatDateLabelYmd(ymd: string): string {
  const t = ymd.trim();
  if (t === "") return "—";
  const d = new Date(`${t}T12:00:00`);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function buildDepartureDateTimeSummary(ymd: string, timeStored: string): string {
  const datePart = formatDateLabelYmd(ymd);
  const timePart = timeStored.trim() === "" ? "—" : timeStored.trim();
  if (datePart === "—" && timePart === "—") return "—";
  return `${datePart} · ${timePart}`;
}

export function parsePositiveIntegerText(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function addHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
