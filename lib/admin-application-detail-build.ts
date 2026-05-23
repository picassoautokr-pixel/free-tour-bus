import { SETTLEMENT_TYPE_LABELS } from "@/lib/support-calculation";
import { safeText } from "@/lib/sponsor";

export type AdminMatchedDriver = {
  source: "member" | "guest";
  company_name: string;
  driver_name: string;
  phone: string;
  quote_id: string;
  selected_price: number | null;
  selected_price_label: string;
  badge: "제휴기사" | "일반기사";
};

export type AdminMemberQuoteCard = {
  id: string;
  partner_driver_id: string;
  company_name: string;
  driver_name: string;
  phone: string;
  price: number | null;
  support_settlement_type: string;
  support_settlement_label: string;
  total_support_display: number | null;
  customer_support_display: number | null;
  extension_support_display: number | null;
  discount_price_display: number | null;
  sponsor_confirmed: boolean;
  created_at: string;
  message: string;
  status: string;
  vehicle_type: string;
  available_time: string;
  is_matched: boolean;
  sponsor_quote_enabled: boolean;
  support_breakdown: Record<string, unknown> | null;
};

export type AdminGuestQuoteCard = {
  id: string;
  company_name: string;
  driver_name: string;
  phone: string;
  price: number | null;
  created_at: string;
  message: string;
  status: string;
  vehicle_type: string;
  available_time: string;
  is_matched: boolean;
  match_result: string;
};

export type AdminSponsorDetail = {
  sponsor_company_name: string;
  support_status: string;
  support_kind: string;
  support_condition: string;
  support_type: string;
  estimated_support_amount: number | null;
  approved_support_amount: number | null;
  approved_at: string;
  assigned_staff_name: string;
  assigned_staff_phone: string;
  preapproval_id: string;
  sponsor_confirmed: boolean;
};

export type AdminSmsLog = {
  type: string;
  target_role: string;
  target_name: string;
  target_phone: string;
  status: string;
  sent_at: string;
  error: string;
};

export type AdminQuoteSummary = {
  member_quote_count: number;
  guest_quote_count: number;
  avg_normal_price: number | null;
  avg_estimated_support: number | null;
  avg_approved_support: number | null;
  extension_round: number;
};

export type AdminApplicationDetailPayload = {
  application: Record<string, unknown>;
  matched_driver: AdminMatchedDriver | null;
  member_quotes: AdminMemberQuoteCard[];
  guest_quotes: AdminGuestQuoteCard[];
  sponsor: AdminSponsorDetail | null;
  sms_logs: AdminSmsLog[];
  quote_summary: AdminQuoteSummary;
};

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function sponsorStageConfirmed(sponsor: AdminSponsorDetail | null): boolean {
  if (!sponsor) return false;
  return (
    sponsor.sponsor_confirmed ||
    sponsor.support_status === "approved" ||
    Boolean(sponsor.approved_at)
  );
}

function buildMemberQuoteCard(
  quote: Record<string, unknown>,
  finalQuoteId: string,
  sponsorConfirmed: boolean,
): AdminMemberQuoteCard {
  const settlement = safeText(quote.support_settlement_type, "client_priority");
  const totalPlanned = parseInteger(quote.total_planned_support ?? quote.estimated_support_amount);
  const totalConfirmed = parseInteger(quote.total_confirmed_support ?? quote.approved_support_amount);
  const customerPlanned = parseInteger(quote.customer_planned_support ?? quote.customer_support_amount);
  const customerConfirmed = parseInteger(quote.customer_confirmed_support ?? quote.final_customer_support_amount);
  const extension = parseInteger(quote.extension_support_amount);
  const discountPlanned = parseInteger(quote.support_discount_planned_price ?? quote.member_price);
  const discountApplied = parseInteger(
    quote.support_discount_applied_price ?? quote.final_member_price ?? quote.sponsor_discounted_price,
  );

  return {
    id: safeText(quote.id),
    partner_driver_id: safeText(quote.partner_driver_id),
    company_name: safeText(quote.company_name, "—"),
    driver_name: safeText(quote.manager_name, "—"),
    phone: safeText(quote.phone, "—"),
    price: parseInteger(quote.price),
    support_settlement_type: settlement,
    support_settlement_label: SETTLEMENT_TYPE_LABELS[settlement as keyof typeof SETTLEMENT_TYPE_LABELS] ?? settlement,
    total_support_display: sponsorConfirmed ? totalConfirmed : totalPlanned,
    customer_support_display: sponsorConfirmed ? customerConfirmed : customerPlanned,
    extension_support_display: extension,
    discount_price_display: sponsorConfirmed ? discountApplied : discountPlanned,
    sponsor_confirmed: sponsorConfirmed,
    created_at: safeText(quote.created_at),
    message: safeText(quote.message),
    status: safeText(quote.status, "submitted"),
    vehicle_type: safeText(quote.vehicle_type, "—"),
    available_time: safeText(quote.available_time, "—"),
    is_matched: safeText(quote.id) === finalQuoteId,
    sponsor_quote_enabled: quote.sponsor_quote_enabled === true,
    support_breakdown:
      quote.support_breakdown && typeof quote.support_breakdown === "object"
        ? (quote.support_breakdown as Record<string, unknown>)
        : null,
  };
}

function buildGuestQuoteCard(
  quote: Record<string, unknown>,
  finalQuoteId: string,
  finalSource: string,
): AdminGuestQuoteCard {
  const id = safeText(quote.id);
  return {
    id,
    company_name: safeText(quote.guest_company_name, "—"),
    driver_name: safeText(quote.guest_driver_name, "—"),
    phone: safeText(quote.guest_phone, "—"),
    price: parseInteger(quote.price),
    created_at: safeText(quote.created_at),
    message: safeText(quote.message),
    status: safeText(quote.status, "submitted"),
    vehicle_type: safeText(quote.vehicle_type, "—"),
    available_time: safeText(quote.available_time, "—"),
    is_matched: finalSource === "guest" && id === finalQuoteId,
    match_result: safeText(quote.match_result, "pending"),
  };
}

function pickPrimarySponsor(
  preapprovals: Record<string, unknown>[],
): AdminSponsorDetail | null {
  if (preapprovals.length === 0) return null;
  const approved =
    preapprovals.find((p) => safeText(p.status) === "approved") ??
    preapprovals.find((p) => safeText(p.status) === "preapproved") ??
    preapprovals[0];
  const row = approved;
  return {
    preapproval_id: safeText(row.id),
    sponsor_company_name: safeText(row.sponsor_company_name, "—"),
    support_status: safeText(row.status),
    support_kind: safeText(row.support_kind),
    support_condition: safeText(row.support_condition_label) || safeText(row.support_condition),
    support_type: safeText(row.support_type),
    estimated_support_amount: parseInteger(row.estimated_support_amount),
    approved_support_amount: parseInteger(row.approved_support_amount),
    approved_at: safeText(row.approved_at),
    assigned_staff_name: safeText(row.assigned_staff_name),
    assigned_staff_phone: safeText(row.assigned_staff_phone),
    sponsor_confirmed: safeText(row.status) === "approved",
  };
}

function buildMatchedDriver(
  finalQuoteId: string,
  finalSource: string,
  memberQuotes: AdminMemberQuoteCard[],
  guestQuotes: AdminGuestQuoteCard[],
  application: Record<string, unknown>,
): AdminMatchedDriver | null {
  if (!finalQuoteId) return null;

  if (finalSource === "guest") {
    const gq = guestQuotes.find((q) => q.id === finalQuoteId);
    if (!gq) return null;
    return {
      source: "guest",
      company_name: gq.company_name,
      driver_name: gq.driver_name,
      phone: gq.phone,
      quote_id: gq.id,
      selected_price: parseInteger(application.selected_price) ?? gq.price,
      selected_price_label: safeText(application.selected_price_label, "일반견적가"),
      badge: "일반기사",
    };
  }

  const mq = memberQuotes.find((q) => q.id === finalQuoteId);
  if (!mq) return null;
  return {
    source: "member",
    company_name: mq.company_name,
    driver_name: mq.driver_name,
    phone: mq.phone,
    quote_id: mq.id,
    selected_price: parseInteger(application.selected_price) ?? mq.discount_price_display ?? mq.price,
    selected_price_label: safeText(application.selected_price_label, "지원금 할인 적용가"),
    badge: "제휴기사",
  };
}

export function buildAdminApplicationDetailPayload(params: {
  applicationRow: Record<string, unknown> | null;
  applicationLifecycle: Record<string, unknown> | null;
  memberQuoteRows: Record<string, unknown>[];
  guestQuoteRows: Record<string, unknown>[];
  preapprovalRows: Record<string, unknown>[];
  notificationRows: Record<string, unknown>[];
  listRow?: Record<string, unknown>;
}): AdminApplicationDetailPayload {
  const lifecycle = params.applicationLifecycle ?? {};
  const list = params.listRow ?? {};
  const appRaw = params.applicationRow ?? {};

  const application: Record<string, unknown> = {
    ...appRaw,
    ...lifecycle,
    customer_name:
      safeText(appRaw.customer_name) ||
      safeText(list.applicant_name) ||
      safeText(appRaw.applicant_name),
    customer_phone: safeText(appRaw.phone) || safeText(list.phone),
    applicant_name: safeText(list.applicant_name) || safeText(appRaw.applicant_name),
    phone: safeText(list.phone) || safeText(appRaw.phone),
    organization_name: safeText(list.organization_name) || safeText(appRaw.organization_name),
    organization_type: safeText(list.organization_type) || safeText(appRaw.organization_type),
    request_message: safeText(list.request_message) || safeText(appRaw.request_message),
    memo: safeText(list.request_message) || safeText(appRaw.request_message),
    attachments: {
      file_url: safeText(list.file_url) || safeText(appRaw.file_url),
      file_name: safeText(list.file_name) || safeText(appRaw.file_name),
      attachment_url: safeText(list.attachment_url) || safeText(appRaw.attachment_url),
    },
    created_at: safeText(list.created_at) || safeText(appRaw.created_at),
    receipt_number: safeText(list.receipt_number) || safeText(appRaw.receipt_number),
    application_type: safeText(list.application_type) || safeText(appRaw.application_type),
    trip_type: safeText(list.trip_type) || safeText(appRaw.trip_type),
    bus_grade: safeText(list.bus_grade) || safeText(appRaw.bus_grade),
    departure: safeText(list.departure) || safeText(appRaw.departure),
    departure_region: safeText(list.departure_region) || safeText(appRaw.departure_region),
    destination: safeText(list.destination) || safeText(appRaw.destination),
    stopovers: list.stopovers ?? appRaw.stopovers ?? [],
    departure_date: list.departure_date ?? appRaw.departure_date ?? null,
    departure_time: safeText(list.departure_time) || safeText(appRaw.departure_time),
    return_date: list.return_date ?? appRaw.return_date ?? null,
    passenger_count: list.passenger_count ?? appRaw.passenger_count ?? null,
    admin_memo: safeText(list.admin_memo) || safeText(appRaw.admin_memo),
    status: safeText(list.status) || safeText(appRaw.status),
    selected_price_type: safeText(appRaw.selected_price_type),
    selected_price_label: safeText(appRaw.selected_price_label),
    selected_price: parseInteger(appRaw.selected_price),
    final_selected_guest_quote_id:
      safeText(appRaw.final_selected_guest_quote_id) ||
      (safeText(lifecycle.final_selected_quote_source) === "guest"
        ? safeText(lifecycle.final_selected_quote_id)
        : ""),
  };

  const finalQuoteId = safeText(lifecycle.final_selected_quote_id);
  const finalSource = safeText(lifecycle.final_selected_quote_source) === "guest" ? "guest" : "member";

  const sponsor = pickPrimarySponsor(params.preapprovalRows);
  const sponsorConfirmed = sponsorStageConfirmed(sponsor);

  const member_quotes = params.memberQuoteRows.map((q) =>
    buildMemberQuoteCard(q, finalQuoteId, sponsorConfirmed),
  );
  const guest_quotes = params.guestQuoteRows.map((q) =>
    buildGuestQuoteCard(q, finalQuoteId, finalSource),
  );

  const memberPrices = member_quotes.map((q) => q.price).filter((v): v is number => v != null);
  const supports = member_quotes
    .map((q) => q.total_support_display)
    .filter((v): v is number => v != null);

  const sms_logs: AdminSmsLog[] = params.notificationRows.map((row) => ({
    type: safeText(row.notification_type),
    target_role: safeText(row.target_type),
    target_name: safeText(row.target_name),
    target_phone: safeText(row.target_phone),
    status: safeText(row.status),
    sent_at: safeText(row.sent_at) || safeText(row.created_at),
    error: safeText(row.error),
  }));

  return {
    application,
    matched_driver: buildMatchedDriver(finalQuoteId, finalSource, member_quotes, guest_quotes, application),
    member_quotes,
    guest_quotes,
    sponsor,
    sms_logs,
    quote_summary: {
      member_quote_count: member_quotes.length,
      guest_quote_count: guest_quotes.length,
      avg_normal_price: average(memberPrices),
      avg_estimated_support: average(supports),
      avg_approved_support: sponsor?.approved_support_amount ?? null,
      extension_round: parseInteger(lifecycle.extension_round) ?? 0,
    },
  };
}

export function isApplicationMatchCompleted(lifecycle: Record<string, unknown> | null): boolean {
  return safeText(lifecycle?.final_selected_quote_id) !== "";
}
