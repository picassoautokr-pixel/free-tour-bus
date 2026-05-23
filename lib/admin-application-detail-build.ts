import { isSponsorStageConfirmed, resolveSponsorStageBadge } from "@/lib/admin-progress-stage";
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

export type AdminMemberQuoteSupportRow = {
  label: string;
  value: number | null;
};

export type AdminMemberQuoteDebug = {
  has_support_breakdown: boolean;
  planned_total_support: number | null;
  confirmed_total_support: number | null;
  calculation_status: string;
  fallback_used: unknown;
  missing_fields: unknown;
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
  support_rows: AdminMemberQuoteSupportRow[];
  sponsor_stage_badge: "지원검토" | "지원확정";
  created_at: string;
  message: string;
  status: string;
  vehicle_type: string;
  available_time: string;
  is_matched: boolean;
  sponsor_quote_enabled: boolean;
  support_breakdown: Record<string, unknown> | null;
  support_debug: AdminMemberQuoteDebug | null;
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
  support_stage_badge: "지원검토" | "지원확정" | "없음";
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

function breakdownField(
  breakdown: Record<string, unknown> | null,
  snake: string,
  camel: string,
): number | null {
  if (!breakdown) return null;
  return parseInteger(breakdown[snake] ?? breakdown[camel]);
}

function buildMemberQuoteSupportRows(
  quote: Record<string, unknown>,
  sponsorConfirmed: boolean,
): AdminMemberQuoteSupportRow[] {
  const breakdown =
    quote.support_breakdown && typeof quote.support_breakdown === "object"
      ? (quote.support_breakdown as Record<string, unknown>)
      : null;

  if (sponsorConfirmed) {
    const discountApplied =
      parseInteger(quote.confirmed_discount_price) ??
      parseInteger(quote.final_discount_applied_price) ??
      parseInteger(quote.support_discount_applied_price) ??
      parseInteger(quote.final_member_price) ??
      parseInteger(quote.sponsor_discounted_price) ??
      breakdownField(breakdown, "final_discount_price", "finalDiscountAppliedPrice") ??
      breakdownField(breakdown, "confirmed_discount_price", "supportDiscountAppliedPrice");

    return [
      {
        label: "확정 지원금",
        value:
          parseInteger(quote.confirmed_total_support) ??
          parseInteger(quote.total_confirmed_support) ??
          parseInteger(quote.approved_support_amount) ??
          breakdownField(breakdown, "confirmed_total_support", "totalConfirmedSupport"),
      },
      {
        label: "고객 확정 지원금",
        value:
          parseInteger(quote.confirmed_customer_support) ??
          parseInteger(quote.customer_confirmed_support) ??
          parseInteger(quote.final_customer_support_amount) ??
          breakdownField(breakdown, "confirmed_customer_support", "customerConfirmedSupport"),
      },
      {
        label: "확정 연장 지원금",
        value:
          parseInteger(quote.confirmed_extension_support) ??
          breakdownField(breakdown, "confirmed_extension_support", "extensionSupport"),
      },
      {
        label: "지원금 할인 적용가",
        value: discountApplied,
      },
    ];
  }

  return [
    {
      label: "예상 지원금",
      value:
        parseInteger(quote.planned_total_support) ??
        parseInteger(quote.total_planned_support) ??
        parseInteger(quote.estimated_support_amount) ??
        breakdownField(breakdown, "planned_total_support", "totalPlannedSupport"),
    },
    {
      label: "고객 예상 지원금",
      value:
        parseInteger(quote.planned_customer_support) ??
        parseInteger(quote.customer_planned_support) ??
        parseInteger(quote.customer_support_amount) ??
        breakdownField(breakdown, "planned_customer_support", "customerPlannedSupport"),
    },
    {
      label: "예상 연장 지원금",
      value:
        parseInteger(quote.planned_extension_support) ??
        breakdownField(breakdown, "planned_extension_support", "extensionSupport") ??
        parseInteger(quote.extension_support_amount),
    },
    {
      label: "지원금 할인 예상가",
      value:
        parseInteger(quote.planned_discount_price) ??
        parseInteger(quote.support_discount_planned_price) ??
        parseInteger(quote.member_price) ??
        breakdownField(breakdown, "planned_discount_price", "supportDiscountPlannedPrice"),
    },
  ];
}

function buildMemberQuoteDebug(
  quote: Record<string, unknown>,
  breakdown: Record<string, unknown> | null,
): AdminMemberQuoteDebug {
  const calcStatus =
    safeText(breakdown?.calculation_status) ||
    safeText(breakdown?.calculationStatus) ||
    "—";

  return {
    has_support_breakdown: breakdown != null,
    planned_total_support:
      parseInteger(quote.planned_total_support) ??
      parseInteger(quote.total_planned_support) ??
      breakdownField(breakdown, "planned_total_support", "totalPlannedSupport"),
    confirmed_total_support:
      parseInteger(quote.confirmed_total_support) ??
      parseInteger(quote.total_confirmed_support) ??
      breakdownField(breakdown, "confirmed_total_support", "totalConfirmedSupport"),
    calculation_status: calcStatus,
    fallback_used: breakdown?.fallback_used ?? breakdown?.fallbackUsed ?? null,
    missing_fields: breakdown?.missing_fields ?? breakdown?.missingFields ?? null,
  };
}

function buildMemberQuoteCard(
  quote: Record<string, unknown>,
  finalQuoteId: string,
  sponsorConfirmed: boolean,
): AdminMemberQuoteCard {
  const settlement = safeText(quote.support_settlement_type, "client_priority");
  const breakdown =
    quote.support_breakdown && typeof quote.support_breakdown === "object"
      ? (quote.support_breakdown as Record<string, unknown>)
      : null;

  return {
    id: safeText(quote.id),
    partner_driver_id: safeText(quote.partner_driver_id),
    company_name: safeText(quote.company_name, "—"),
    driver_name: safeText(quote.manager_name, "—"),
    phone: safeText(quote.phone, "—"),
    price: parseInteger(quote.price),
    support_settlement_type: settlement,
    support_settlement_label: SETTLEMENT_TYPE_LABELS[settlement as keyof typeof SETTLEMENT_TYPE_LABELS] ?? settlement,
    support_rows: buildMemberQuoteSupportRows(quote, sponsorConfirmed),
    sponsor_stage_badge: sponsorConfirmed ? "지원확정" : "지원검토",
    created_at: safeText(quote.created_at),
    message: safeText(quote.message),
    status: safeText(quote.status, "submitted"),
    vehicle_type: safeText(quote.vehicle_type, "—"),
    available_time: safeText(quote.available_time, "—"),
    is_matched: safeText(quote.id) === finalQuoteId,
    sponsor_quote_enabled: quote.sponsor_quote_enabled === true,
    support_breakdown: breakdown,
    support_debug: buildMemberQuoteDebug(quote, breakdown),
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
  const supportStatus = safeText(row.status);
  return {
    preapproval_id: safeText(row.id),
    sponsor_company_name: safeText(row.sponsor_company_name, "—"),
    support_status: supportStatus,
    support_stage_badge: resolveSponsorStageBadge(supportStatus),
    support_kind: safeText(row.support_kind),
    support_condition: safeText(row.support_condition_label) || safeText(row.support_condition),
    support_type: safeText(row.support_type),
    estimated_support_amount: parseInteger(row.estimated_support_amount),
    approved_support_amount: parseInteger(row.approved_support_amount),
    approved_at: safeText(row.approved_at),
    assigned_staff_name: safeText(row.assigned_staff_name),
    assigned_staff_phone: safeText(row.assigned_staff_phone),
    sponsor_confirmed: isSponsorStageConfirmed(supportStatus),
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
    selected_price:
      parseInteger(application.selected_price) ??
      mq.support_rows.find((r) => r.label.includes("할인"))?.value ??
      mq.price,
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
    is_hidden: appRaw.is_hidden === true || lifecycle.is_hidden === true,
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
  const sponsorConfirmed = sponsor ? sponsor.sponsor_confirmed : false;

  const member_quotes = params.memberQuoteRows.map((q) =>
    buildMemberQuoteCard(q, finalQuoteId, sponsorConfirmed),
  );
  const guest_quotes = params.guestQuoteRows.map((q) =>
    buildGuestQuoteCard(q, finalQuoteId, finalSource),
  );

  const memberPrices = member_quotes.map((q) => q.price).filter((v): v is number => v != null);
  const supports = member_quotes
    .map((q) => q.support_rows[0]?.value)
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
