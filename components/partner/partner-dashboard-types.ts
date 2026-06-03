import type { QuoteSupportBreakdown } from "@/lib/support-calculation";
import { formatStopovers } from "@/lib/stopovers";

export type PartnerMyQuote = {
  source: "member" | "guest";
  id: string;
  price: number | null;
  support_settlement_type?: "client_priority" | "ratio" | string;
  preapproved_support_amount?: number | null;
  approved_support_amount?: number | null;
  estimated_support_amount?: number | null;
  support_discount_amount?: number | null;
  customer_support_amount?: number | null;
  member_price?: number | null;
  final_customer_support_amount?: number | null;
  final_driver_support_amount?: number | null;
  final_member_price?: number | null;
  support_recalculated_at?: string;
  is_member_quote?: boolean;
  converted_from_guest_quote_id?: string;
  sponsor_support_amount?: number | null;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  sponsor_discounted_price?: number | null;
  sponsor_quote_enabled?: boolean;
  driver_support_amount?: number | null;
  client_reward_amount?: number | null;
  support_breakdown?: QuoteSupportBreakdown | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
  created_at: string;
  match_result?: string;
};

export type PartnerCall = {
  id: string;
  created_at: string;
  receipt_number: string;
  contract_number: string;
  contract_pdf_generated_at: string;
  contract_pdf_url: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_region: string;
  destination: string;
  stopovers?: string[];
  departure_date: string;
  departure_time: string;
  return_date: string;
  passenger_count: number | null;
  request_message?: string;
  estimated_support_amount: number;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  quote_count: number;
  call_category: "new" | "quoted" | "matched";
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  extension_round: number;
  support_client_reward_ratio: number;
  support_driver_ratio: number;
  auto_selected_quote_id: string;
  auto_selected_quote_source: string;
  final_selected_quote_id: string;
  final_selected_quote_source: string;
  client_price_selection_kind?: string | null;
  selected_price_type?: string | null;
  selected_price_label?: string | null;
  selected_price?: number | null;
  auto_final_confirm_at: string;
  contact_revealed_at: string;
  contract_status: string;
  contract_started_at: string;
  client_contract_confirmed_at: string;
  driver_contract_confirmed_at: string;
  deposit_amount: number;
  deposit_status: string;
  deposit_confirmed_at: string;
  contract_memo: string;
  customer_name?: string;
  customer_phone?: string;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  sponsor_estimated_support_amount?: number | null;
  sponsors?: Array<{
    id: string;
    company_name: string;
    status: string;
    estimated_support_amount: number | null;
    approved_support_amount: number | null;
  }>;
  my_quote: PartnerMyQuote | null;
};

export type PartnerDriverInfo = {
  company_name: string;
  manager_name: string;
  phone: string;
};

export type QuoteForm = {
  price: string;
  supportDiscountAmount: string;
  supportSettlementType: "client_priority" | "ratio";
  vehicleType: string;
  availableTime: string;
  message: string;
};

export type ReferralForm = {
  phones: string;
};

export type ReferralResult = {
  phone: string;
  status: "sent" | "skipped_duplicate" | "invalid_phone" | "send_failed";
  error?: string;
};

export const emptyQuoteForm: QuoteForm = {
  price: "",
  supportDiscountAmount: "",
  supportSettlementType: "client_priority",
  vehicleType: "",
  availableTime: "",
  message: "",
};

export const emptyReferralForm: ReferralForm = {
  phones: "",
};

export const PARTNER_NOTIFICATION_SOUND_PREF_KEY =
  "partnerDashboardSoundEnabled";
export const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

export function formatDate(value: string): string {
  const t = value.trim();
  if (t === "") return "미정";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toISOString().slice(0, 10);
}

export function formatDeparture(call: PartnerCall): string {
  const date = formatDate(call.departure_date);
  const time = call.departure_time.trim();
  if (time === "" || time === "—") return date;
  return `${date} ${time}`;
}

export function formatPrice(value: number | null): string {
  if (value == null) return "제출 완료";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatRemaining(deadline: string): string {
  const time = new Date(deadline).getTime();
  if (!Number.isFinite(time)) return "마감시간 미정";
  const diff = time - Date.now();
  if (diff <= 0) return "마감 임박";
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.ceil((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours <= 0) return `마감까지 ${minutes}분`;
  return `마감까지 ${hours}시간`;
}

export function isQuoteClosed(call: PartnerCall): boolean {
  const closedStatuses = new Set([
    "closed_by_time",
    "closed_by_quote_count",
    "closed_by_price",
    "auto_selected",
    "final_selected",
    "completed",
    "contract_pending",
    "manually_closed",
  ]);
  return (
    call.quote_closed_at.trim() !== "" ||
    call.final_selected_quote_id.trim() !== "" ||
    closedStatuses.has(call.quote_status)
  );
}

export function isMatchedCall(call: PartnerCall): boolean {
  if (call.call_category === "matched") return true;
  if (call.my_quote == null) return false;
  const selectedQuoteId =
    call.final_selected_quote_id.trim() || call.auto_selected_quote_id.trim();
  return selectedQuoteId !== "" && call.my_quote.id === selectedQuoteId;
}

export function isNewCall(call: PartnerCall): boolean {
  return (
    call.call_category === "new" &&
    call.my_quote == null &&
    !isQuoteClosed(call)
  );
}

export function isQuotedCall(call: PartnerCall): boolean {
  return (
    call.call_category === "quoted" &&
    call.my_quote != null &&
    call.final_selected_quote_id.trim() === "" &&
    !isMatchedCall(call)
  );
}

export function canRevealCustomerInfo(call: PartnerCall): boolean {
  if (call.my_quote == null) return false;
  const revealStatuses = new Set([
    "final_selected",
    "contract_pending",
    "completed",
  ]);
  return (
    call.contact_revealed_at.trim() !== "" &&
    call.final_selected_quote_id.trim() !== "" &&
    call.my_quote.id === call.final_selected_quote_id &&
    revealStatuses.has(call.quote_status)
  );
}

export function supportQuotePrice(quote: PartnerMyQuote): number | null {
  const storedPrice =
    quote.final_member_price ??
    quote.member_price ??
    quote.sponsor_discounted_price;
  if (storedPrice != null) return storedPrice;
  const customerSupportAmount =
    quote.customer_support_amount ?? quote.support_discount_amount ?? null;
  if (quote.price == null || customerSupportAmount == null) return null;
  return Math.max(0, quote.price - customerSupportAmount);
}

export function formatSubmittedAt(iso: string): string {
  const t = iso.trim();
  if (t === "" || t === "—") return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function parsePriceInput(value: string): number | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

export function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const text = String(value).trim();
  return text === "" ? emptyLabel : text;
}

export function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d-]/g, "");
    if (digits !== "") {
      const parsed = Number.parseInt(digits, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function supportDiscountFor(call: PartnerCall, value: string): number {
  const parsed = parsePriceInput(value);
  return parsed ?? call.estimated_support_amount;
}

export function discountedPriceFor(
  call: PartnerCall,
  priceText: string,
  supportDiscountText: string,
): number | null {
  const price = parsePriceInput(priceText);
  if (price == null) return null;
  return Math.max(price - supportDiscountFor(call, supportDiscountText), 0);
}

export function parseReferralPhones(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function referralStatusLabel(
  status: ReferralResult["status"],
): string {
  if (status === "sent") return "발송 완료";
  if (status === "skipped_duplicate") return "중복 건너뜀";
  if (status === "invalid_phone") return "번호 오류";
  return "발송 실패";
}

export function buildReferralPreview(call: PartnerCall): string {
  const stopoverText = formatStopovers(call.stopovers);
  return `[지원금 전세버스]
전세버스 견적요청이 전달되었습니다.

출발: ${call.departure}
${stopoverText ? `경유: ${stopoverText}\n` : ""}도착: ${call.destination}
일시: ${formatDeparture(call)}
인원: ${call.passenger_count ?? "미정"}

견적 확인:
https://www.free-bus.co.kr/shared-quote/{전달 후 생성}

제휴기사 등록:
https://www.free-bus.co.kr/partner/register?ref={전달 후 생성}`;
}

export function logRealtime(message: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  if (payload === undefined) console.log(message);
  else console.log(message, payload);
}
