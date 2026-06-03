import type { QuoteSupportBreakdown } from "@/lib/support-calculation";

/** 목록·상세 공통 — Supabase row 정규화 */
export type ApplicationDetail = {
  id: string;
  created_at: string | null;
  receipt_number: string;
  application_type: string;
  trip_type: string;
  bus_grade: string;
  departure: string;
  departure_detail: string;
  departure_region: string;
  destination: string;
  destination_detail: string;
  stopovers: string[];
  departure_date: string | null;
  departure_time: string;
  return_date: string | null;
  passenger_count: number | null;
  applicant_name: string;
  phone: string;
  organization_name: string;
  organization_type: string;
  request_message: string;
  attachment_url: string;
  file_url: string;
  file_name: string;
  admin_memo: string;
  status: string;
  final_selected_quote_id: string;
  quote_status: string;
  is_hidden?: boolean;
};

export type DriverQuoteDetail = {
  id: string;
  created_at: string;
  partner_driver_id: string;
  company_name: string;
  manager_name: string;
  phone: string;
  price: number | null;
  support_settlement_type?: string;
  preapproved_support_amount?: number | null;
  approved_support_amount?: number | null;
  estimated_support_amount?: number | null;
  support_discount_amount?: number | null;
  member_price?: number | null;
  is_member_quote?: boolean;
  converted_from_guest_quote_id?: string;
  converted_from_guest_price?: number | null;
  sponsor_support_amount?: number | null;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  customer_support_amount?: number | null;
  sponsor_discounted_price?: number | null;
  sponsor_quote_enabled?: boolean;
  driver_support_amount?: number | null;
  final_customer_support_amount?: number | null;
  final_driver_support_amount?: number | null;
  final_member_price?: number | null;
  support_recalculated_at?: string;
  client_reward_amount?: number | null;
  support_breakdown?: QuoteSupportBreakdown | null;
  support_discount_planned_price?: number | null;
  support_discount_applied_price?: number | null;
  final_discount_applied_price?: number | null;
  extension_support_amount?: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
};

export type ApplicationQuoteLifecycle = {
  id: string;
  contract_number: string;
  contract_pdf_generated_at: string;
  contract_pdf_url: string;
  quote_status: string;
  quote_deadline_at: string;
  quote_limit_count: number | null;
  target_normal_price: number | null;
  target_member_price: number | null;
  quote_closed_at: string;
  quote_closed_reason: string;
  auto_selected_quote_id: string;
  auto_selected_quote_source: string;
  auto_selected_at: string;
  auto_final_confirm_at: string;
  final_selected_quote_id: string;
  final_selected_quote_source: string;
  final_selected_at: string;
  contact_revealed_at: string;
  contract_started_at: string;
  client_contract_confirmed_at: string;
  driver_contract_confirmed_at: string;
  deposit_amount: number;
  deposit_status: string;
  deposit_confirmed_at: string;
  contract_memo: string;
  extension_round: number;
  support_client_reward_ratio: number;
  support_driver_ratio: number;
  contract_status: string;
  sponsor_support_status?: string;
  sponsor_approved_support_amount?: number | null;
  sponsor_preapproved_count?: number;
  sponsor_approved_count?: number;
  sponsor_rejected_count?: number;
  estimated_support_amount: number;
  client_reward_amount: number;
  driver_support_amount: number;
};

export type GuestDriverQuoteDetail = {
  id: string;
  created_at: string;
  application_id: string;
  quote_referral_id: string;
  referral_token: string;
  guest_company_name: string;
  guest_driver_name: string;
  guest_phone: string;
  price: number | null;
  vehicle_type: string;
  available_time: string;
  message: string;
  status: string;
  match_result: string;
  result_notified_at: string;
  result_sms_error: string;
  linked_partner_driver_id?: string;
  converted_to_member_quote_id?: string;
  converted_at?: string;
  member_converted?: boolean;
  linked_partner_company?: string;
  linked_partner_phone?: string;
};

export type NotificationLogDetail = {
  id: string;
  created_at: string;
  target_type: string;
  target_phone: string;
  target_name: string;
  notification_type: string;
  quote_id: string;
  quote_source: string;
  status: string;
  error: string;
  sent_at: string;
};

export type SponsorPreapprovalDetail = {
  id: string;
  sponsor_company_name: string;
  sponsor_rule_title: string;
  estimated_support_amount: number;
  approved_support_amount?: number | null;
  status: string;
  matched_reason: string;
  assigned_staff_name?: string;
  assigned_staff_phone?: string;
  decision_memo?: string;
  decided_at?: string;
  approved_at?: string;
  rejected_at?: string;
  staff_sms_sent_at?: string;
  staff_sms_error?: string;
};

export type QuoteAutomationSettingsForm = {
  business_start_time: string;
  business_end_time: string;
  auto_final_confirm_delay_minutes: number;
  timezone: string;
};

export const APPLICATION_STATUSES = [
  { value: "pending", label: "접수완료" },
  { value: "reviewing", label: "검토중" },
  { value: "approved", label: "승인완료" },
  { value: "rejected", label: "반려" },
] as const;

export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number]["value"];
export type StatusFilterValue = "all" | ApplicationStatusValue;

export type SortKey =
  | "created_at"
  | "receipt_number"
  | "application_type"
  | "applicant_name"
  | "phone"
  | "organization_name"
  | "departure"
  | "departure_region"
  | "destination"
  | "passenger_count"
  | "status"
  | "quote_status"
  | "admin_memo";

export type SortDirection = "asc" | "desc";

export type DashboardStats = {
  total: number;
  todayCount: number;
  monthCount: number;
  pending: number;
  reviewing: number;
  approved: number;
  rejected: number;
};

export type AdminToast = { message: string };

export type RealtimeToastPayload =
  | {
      kind: "bus";
      applicantName: string;
      applicationTypeLabel: string;
      passengerLine: string;
    }
  | {
      kind: "partner";
      title: string;
      message: string;
    };

export type RecentNotificationItem = {
  kind: "bus" | "partner";
  id: string;
  created_at: string | null;
} & (
  | {
      kind: "bus";
      applicant_name: string;
      application_type: string;
      passenger_count: number | null;
    }
  | {
      kind: "partner";
      notification_id?: string;
      message: string;
    }
);
