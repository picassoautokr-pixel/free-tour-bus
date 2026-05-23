/**
 * 어드민 신청 상세 — 섹션별 서버 로드 (UTF-8)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildAdminApplicationDetailPayload,
  buildGuestQuoteCard,
  buildMemberQuoteCard,
  buildMatchedDriver,
  pickPrimarySponsor,
  stripMemberQuoteForClient,
  type AdminApplicationDetailBasicPayload,
  type AdminApplicationDetailQuotesPayload,
  type AdminSmsLog,
  type AdminSponsorDetail,
} from "@/lib/admin-application-detail-build";
import { isSponsorStageConfirmed, resolveSponsorStageBadge } from "@/lib/admin-progress-stage";
import {
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import {
  resolveApplicationApprovedSupportTotal,
  resolveApplicationEstimatedSupportTotal,
} from "@/lib/application-approved-support";
import {
  DRIVER_QUOTE_MINIMAL_SELECT,
  DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN,
} from "@/lib/driver-quote-select";
import { resolveSettlementType } from "@/lib/support-calculation";
import { mapQuoteWithSupport } from "@/lib/quote-display-prices";
import { safeText } from "@/lib/sponsor";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|column .* does not exist|could not find .* column|schema cache/i.test(
      error?.message ?? "",
    )
  );
}

const APPLICATION_BASIC_SELECT = `${quoteLifecycleSelectColumns()}, created_at, receipt_number, applicant_name, phone, organization_name, organization_type, request_message, file_url, file_name, attachment_url, selected_price_type, selected_price_label, selected_price, admin_memo, status, is_hidden, sponsor_support_status, sponsor_approved_support_amount, sponsor_preapproved_count, sponsor_approved_count, sponsor_rejected_count, target_normal_price, target_member_price, quote_deadline_at, extension_round, support_breakdown_snapshot`;

const GUEST_QUOTE_SELECT =
  "id, created_at, application_id, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status";

const PREAPPROVAL_SELECT =
  "id, status, sponsor_company_id, sponsor_rule_id, estimated_support_amount, approved_support_amount, approved_at, support_kind, support_condition, support_type, assigned_staff_id";

async function loadMemberQuotesRows(
  admin: SupabaseClient,
  applicationId: string,
): Promise<Record<string, unknown>[]> {
  const primary = await admin
    .from("driver_quotes")
    .select(DRIVER_QUOTE_MINIMAL_SELECT)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (
    primary.error &&
    isMissingColumnError(primary.error) &&
    /support_breakdown/i.test(primary.error.message)
  ) {
    const fallback = await admin
      .from("driver_quotes")
      .select(DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    return Array.isArray(fallback.data) ? (fallback.data as Record<string, unknown>[]) : [];
  }

  if (primary.error) throw new Error(primary.error.message);
  return Array.isArray(primary.data) ? (primary.data as Record<string, unknown>[]) : [];
}

async function loadApplicationRow(
  admin: SupabaseClient,
  applicationId: string,
): Promise<Record<string, unknown> | null> {
  const res = await admin
    .from("applications")
    .select(APPLICATION_BASIC_SELECT)
    .eq("id", applicationId)
    .maybeSingle();
  if (res.error && isMissingColumnError(res.error)) {
    const fallback = await admin
      .from("applications")
      .select(`${quoteLifecycleSelectColumns()}, created_at, receipt_number, applicant_name, phone, selected_price_type, selected_price_label, selected_price`)
      .eq("id", applicationId)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    return fallback.data as Record<string, unknown> | null;
  }
  if (res.error) throw new Error(res.error.message);
  return res.data as Record<string, unknown> | null;
}

async function loadMatchedDriverOnly(
  admin: SupabaseClient,
  application: Record<string, unknown>,
  sponsorConfirmed: boolean,
): Promise<ReturnType<typeof buildMatchedDriver>> {
  const finalId = safeText(application.final_selected_quote_id);
  if (!finalId) return null;
  const source = safeText(application.final_selected_quote_source) === "guest" ? "guest" : "member";

  if (source === "guest") {
    const { data, error } = await admin
      .from("guest_driver_quotes")
      .select(GUEST_QUOTE_SELECT)
      .eq("id", finalId)
      .maybeSingle();
    if (error || !data) return null;
    const card = buildGuestQuoteCard(data as Record<string, unknown>, finalId, source);
    return buildMatchedDriver(finalId, source, [], [card], application);
  }

  let quoteRes = await admin
    .from("driver_quotes")
    .select(DRIVER_QUOTE_MINIMAL_SELECT)
    .eq("id", finalId)
    .maybeSingle();
  if (
    quoteRes.error &&
    isMissingColumnError(quoteRes.error) &&
    /support_breakdown/i.test(quoteRes.error.message)
  ) {
    quoteRes = await admin
      .from("driver_quotes")
      .select(DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN)
      .eq("id", finalId)
      .maybeSingle();
  }
  if (quoteRes.error || !quoteRes.data) return null;
  const quoteRaw = quoteRes.data;

  const quote = quoteRaw as Record<string, unknown>;
  const partnerId = safeText(quote.partner_driver_id);
  let company_name = "—";
  let manager_name = "—";
  let phone = "—";
  if (partnerId) {
    const { data: partner } = await admin
      .from("partner_drivers")
      .select("company_name, manager_name, phone")
      .eq("id", partnerId)
      .maybeSingle();
    if (partner) {
      const p = partner as Record<string, unknown>;
      company_name = safeText(p.company_name, "—");
      manager_name = safeText(p.manager_name, "—");
      phone = safeText(p.phone, "—");
    }
  }

  const appApproved = resolveApplicationApprovedSupportTotal(application);
  const appEstimated = resolveApplicationEstimatedSupportTotal(application);
  const supportFields = mapQuoteWithSupport(quote, {
    applicationApprovedSupportTotal: appApproved,
    applicationTotalPlannedSupport: appEstimated,
    sponsorApprovedSupportAmount: appApproved,
    sponsorEstimatedSupportAmount: appEstimated,
  });
  const row = {
    ...quote,
    company_name,
    manager_name,
    phone,
    ...supportFields,
    price: supportFields.price,
  };
  const card = buildMemberQuoteCard(row, finalId, sponsorConfirmed, application, null);
  return buildMatchedDriver(finalId, "member", [card], [], application);
}

export async function fetchAdminDetailBasic(
  admin: SupabaseClient,
  applicationId: string,
  listRow?: Record<string, unknown>,
): Promise<AdminApplicationDetailBasicPayload> {
  const [, application] = await Promise.all([
    processApplicationQuoteLifecycle(admin, applicationId),
    loadApplicationRow(admin, applicationId),
  ]);

  if (!application) {
    throw new Error("신청을 찾을 수 없습니다.");
  }

  const sponsorStatus = safeText(application.sponsor_support_status, "none");
  const sponsorConfirmed = isSponsorStageConfirmed(sponsorStatus);
  const preCount = parseInteger(application.sponsor_preapproved_count) ?? 0;
  const appCount = parseInteger(application.sponsor_approved_count) ?? 0;

  const applicationOut: Record<string, unknown> = {
    ...application,
    customer_name:
      safeText(application.applicant_name) || safeText(listRow?.applicant_name),
    customer_phone: safeText(application.phone) || safeText(listRow?.phone),
    applicant_name: safeText(listRow?.applicant_name) || safeText(application.applicant_name),
    phone: safeText(listRow?.phone) || safeText(application.phone),
    organization_name:
      safeText(listRow?.organization_name) || safeText(application.organization_name),
    organization_type:
      safeText(listRow?.organization_type) || safeText(application.organization_type),
    request_message: safeText(listRow?.request_message) || safeText(application.request_message),
    admin_memo: safeText(listRow?.admin_memo) || safeText(application.admin_memo),
    attachments: {
      file_url: safeText(listRow?.file_url) || safeText(application.file_url),
      file_name: safeText(listRow?.file_name) || safeText(application.file_name),
      attachment_url: safeText(listRow?.attachment_url) || safeText(application.attachment_url),
    },
    sponsor_approved_support_amount: resolveApplicationApprovedSupportTotal(application),
    approved_support_amount: resolveApplicationApprovedSupportTotal(application),
    estimated_support_amount: resolveApplicationEstimatedSupportTotal(application),
  };

  const matched_driver = await loadMatchedDriverOnly(admin, application, sponsorConfirmed);

  return {
    application: applicationOut,
    matched_driver,
    sponsor_stage: {
      support_stage_badge: resolveSponsorStageBadge(sponsorStatus),
      sponsor_confirmed: sponsorConfirmed,
      has_sponsor:
        (sponsorStatus !== "none" && sponsorStatus !== "") || preCount > 0 || appCount > 0,
    },
  };
}

async function loadMemberAndGuestQuotes(
  admin: SupabaseClient,
  applicationId: string,
  supportCtx: {
    application: Record<string, unknown>;
    appApprovedTotal: number | null;
    appEstimatedTotal: number | null;
    sponsor: AdminSponsorDetail | null;
  },
): Promise<{
  memberRows: Record<string, unknown>[];
  guestRows: Record<string, unknown>[];
}> {
  const [memberRaw, guestRes] = await Promise.all([
    loadMemberQuotesRows(admin, applicationId),
    admin
      .from("guest_driver_quotes")
      .select(GUEST_QUOTE_SELECT)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
  ]);

  if (guestRes.error) throw new Error(guestRes.error.message);
  const partnerIds = Array.from(
    new Set(
      memberRaw
        .map((r) => safeText((r as { partner_driver_id?: unknown }).partner_driver_id))
        .filter(Boolean),
    ),
  );

  const partnerById = new Map<string, { company_name: string; manager_name: string; phone: string }>();
  if (partnerIds.length > 0) {
    const { data: partners } = await admin
      .from("partner_drivers")
      .select("id, company_name, manager_name, phone")
      .in("id", partnerIds);
    for (const raw of Array.isArray(partners) ? partners : []) {
      const row = raw as Record<string, unknown>;
      const id = safeText(row.id);
      if (!id) continue;
      partnerById.set(id, {
        company_name: safeText(row.company_name, "—"),
        manager_name: safeText(row.manager_name, "—"),
        phone: safeText(row.phone, "—"),
      });
    }
  }

  const memberRows = memberRaw.map((raw) => {
    const row = raw as Record<string, unknown>;
    const partner = partnerById.get(safeText(row.partner_driver_id));
    const supportFields = mapQuoteWithSupport(row, {
      applicationApprovedSupportTotal: supportCtx.appApprovedTotal,
      applicationTotalPlannedSupport: supportCtx.appEstimatedTotal,
      sponsorEstimatedSupportAmount: supportCtx.sponsor?.estimated_support_amount ?? null,
      sponsorApprovedSupportAmount: supportCtx.sponsor?.approved_support_amount ?? null,
    });
    const breakdown = supportFields.support_breakdown;
    const sponsorActive =
      supportFields.sponsor_quote_enabled ||
      supportCtx.sponsor != null ||
      (supportCtx.appApprovedTotal ?? 0) > 0 ||
      (supportCtx.appEstimatedTotal ?? 0) > 0 ||
      breakdown != null;
    return {
      ...row,
      company_name: partner?.company_name ?? "—",
      manager_name: partner?.manager_name ?? "—",
      phone: partner?.phone ?? "—",
      price: supportFields.price,
      support_settlement_type: resolveSettlementType(
        row.support_settlement_type ?? breakdown?.settlementType,
      ),
      sponsor_quote_enabled: sponsorActive,
      confirmed_total_support: supportFields.total_confirmed_support,
      total_confirmed_support: supportFields.total_confirmed_support,
      planned_total_support: supportFields.total_planned_support,
      total_planned_support: supportFields.total_planned_support,
      confirmed_customer_support: supportFields.customer_confirmed_support,
      planned_customer_support: supportFields.customer_planned_support,
      confirmed_discount_price: supportFields.final_discount_applied_price,
      final_discount_applied_price: supportFields.final_discount_applied_price,
      support_discount_applied_price: supportFields.support_discount_applied_price,
      support_discount_planned_price: supportFields.support_discount_planned_price,
      member_price: supportFields.member_price,
      final_member_price: supportFields.support_discount_applied_price,
      extension_support_amount: supportFields.extension_support,
      support_breakdown: supportFields.support_breakdown,
    };
  });

  const guestRows = (Array.isArray(guestRes.data) ? guestRes.data : []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return { ...row };
  });

  return { memberRows, guestRows };
}

async function enrichPreapprovals(
  admin: SupabaseClient,
  preapprovals: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (preapprovals.length === 0) return [];

  const companyIds = [
    ...new Set(preapprovals.map((r) => safeText(r.sponsor_company_id)).filter(Boolean)),
  ];
  const ruleIds = [...new Set(preapprovals.map((r) => safeText(r.sponsor_rule_id)).filter(Boolean))];
  const staffIds = [...new Set(preapprovals.map((r) => safeText(r.assigned_staff_id)).filter(Boolean))];

  const [{ data: companies }, { data: rules }, { data: staff }] = await Promise.all([
    companyIds.length > 0
      ? admin.from("sponsor_companies").select("id, company_name").in("id", companyIds)
      : Promise.resolve({ data: [] }),
    ruleIds.length > 0
      ? admin.from("sponsor_rules").select("id, title, support_condition").in("id", ruleIds)
      : Promise.resolve({ data: [] }),
    staffIds.length > 0
      ? admin.from("sponsor_staff").select("id, name, phone").in("id", staffIds)
      : Promise.resolve({ data: [] }),
  ]);

  const companyNameById = new Map(
    (Array.isArray(companies) ? companies : []).map((r) => [
      safeText((r as Record<string, unknown>).id),
      safeText((r as Record<string, unknown>).company_name),
    ]),
  );
  const ruleById = new Map(
    (Array.isArray(rules) ? rules : []).map((r) => [
      safeText((r as Record<string, unknown>).id),
      r as Record<string, unknown>,
    ]),
  );
  const staffById = new Map(
    (Array.isArray(staff) ? staff : []).map((r) => [
      safeText((r as Record<string, unknown>).id),
      r as Record<string, unknown>,
    ]),
  );

  return preapprovals.map((row) => {
    const rule = ruleById.get(safeText(row.sponsor_rule_id)) ?? {};
    const staff = staffById.get(safeText(row.assigned_staff_id)) ?? {};
    return {
      ...row,
      sponsor_company_name: companyNameById.get(safeText(row.sponsor_company_id)) ?? "",
      support_condition: safeText(rule.support_condition),
      assigned_staff_name: safeText(staff.name),
      assigned_staff_phone: safeText(staff.phone),
    };
  });
}

export async function fetchAdminDetailQuotes(
  admin: SupabaseClient,
  applicationId: string,
  listRow: Record<string, unknown> | undefined,
  includeDebug: boolean,
): Promise<AdminApplicationDetailQuotesPayload> {
  const [, application, preRes] = await Promise.all([
    processApplicationQuoteLifecycle(admin, applicationId),
    loadApplicationRow(admin, applicationId),
    admin
      .from("sponsor_preapprovals")
      .select(PREAPPROVAL_SELECT)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
  ]);

  if (!application) throw new Error("신청을 찾을 수 없습니다.");

  const preRows = Array.isArray(preRes.data) ? (preRes.data as Record<string, unknown>[]) : [];
  const enrichedPre = await enrichPreapprovals(admin, preRows);
  const sponsor = pickPrimarySponsor(enrichedPre);
  const sponsorConfirmed = sponsor ? sponsor.sponsor_confirmed : false;
  const appApproved = resolveApplicationApprovedSupportTotal(application, sponsor);
  const appEstimated = resolveApplicationEstimatedSupportTotal(application, sponsor);
  const { memberRows, guestRows } = await loadMemberAndGuestQuotes(admin, applicationId, {
    application,
    appApprovedTotal: appApproved,
    appEstimatedTotal: appEstimated,
    sponsor,
  });

  const finalQuoteId = safeText(application.final_selected_quote_id);
  const finalSource = safeText(application.final_selected_quote_source) === "guest" ? "guest" : "member";

  const member_quotes = memberRows.map((q) => {
    const card = buildMemberQuoteCard(
      q,
      finalQuoteId,
      sponsorConfirmed,
      application,
      sponsor,
    );
    return stripMemberQuoteForClient(card, includeDebug);
  });
  const guest_quotes = guestRows.map((q) => buildGuestQuoteCard(q, finalQuoteId, finalSource));

  const detail = buildAdminApplicationDetailPayload({
    applicationRow: application,
    applicationLifecycle: application,
    memberQuoteRows: memberRows,
    guestQuoteRows: guestRows,
    preapprovalRows: enrichedPre,
    notificationRows: [],
    listRow,
  });

  return {
    member_quotes,
    guest_quotes,
    quote_summary: detail.quote_summary,
  };
}

export async function fetchAdminDetailSponsor(
  admin: SupabaseClient,
  applicationId: string,
): Promise<AdminSponsorDetail | null> {
  const { data, error } = await admin
    .from("sponsor_preapprovals")
    .select(PREAPPROVAL_SELECT)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const enriched = await enrichPreapprovals(
    admin,
    Array.isArray(data) ? (data as Record<string, unknown>[]) : [],
  );
  return pickPrimarySponsor(enriched);
}

export async function fetchAdminDetailSms(
  admin: SupabaseClient,
  applicationId: string,
): Promise<AdminSmsLog[]> {
  const { data, error } = await admin
    .from("notification_logs")
    .select(
      "notification_type, target_type, target_name, target_phone, status, sent_at, created_at, error",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      type: safeText(r.notification_type),
      target_role: safeText(r.target_type),
      target_name: safeText(r.target_name),
      target_phone: safeText(r.target_phone),
      status: safeText(r.status),
      sent_at: safeText(r.sent_at) || safeText(r.created_at),
      error: safeText(r.error),
    };
  });
}

export async function fetchAdminDetailDebug(
  admin: SupabaseClient,
  applicationId: string,
  listRow: Record<string, unknown> | undefined,
): Promise<unknown> {
  const [basic, quotes, sponsor, sms] = await Promise.all([
    fetchAdminDetailBasic(admin, applicationId, listRow),
    fetchAdminDetailQuotes(admin, applicationId, listRow, true),
    fetchAdminDetailSponsor(admin, applicationId),
    fetchAdminDetailSms(admin, applicationId),
  ]);
  return { basic, quotes, sponsor, sms };
}
