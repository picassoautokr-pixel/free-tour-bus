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
  emptyAdminQuoteSummary,
  type AdminApplicationDetailBasicPayload,
  type AdminApplicationDetailQuotesPayload,
  type AdminSmsLog,
  type AdminSponsorDetail,
} from "@/lib/admin-application-detail-build";
import { resolveSponsorStageBadge } from "@/lib/admin-progress-stage";
import { resolveAdminSponsorConfirmed } from "@/lib/admin-sponsor-confirmed";
import {
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import {
  resolveApplicationApprovedSupportTotal,
  resolveApplicationEstimatedSupportTotal,
} from "@/lib/application-approved-support";
import {
  queryDriverQuoteById,
  queryDriverQuotesForApplication,
  isMissingColumnError,
} from "@/lib/admin-driver-quotes-query";
import { resolveSettlementType } from "@/lib/support-calculation";
import { mapQuoteWithSupport } from "@/lib/quote-display-prices";
import { safeText } from "@/lib/sponsor";
import { normalizeCustomerOrganizationType } from "@/lib/organization-types";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const APPLICATION_LIFECYCLE_CORE =
  "id, quote_status, quote_deadline_at, target_normal_price, target_member_price, final_selected_quote_id, final_selected_quote_source, extension_round";

const APPLICATION_SELECT_CANDIDATES = [
  `${quoteLifecycleSelectColumns()}, created_at, receipt_number, applicant_name, phone, organization_name, organization_type, request_message, file_url, file_name, attachment_url, selected_price_type, selected_price_label, selected_price, client_price_selection_kind, admin_memo, status, is_hidden, sponsor_support_status, sponsor_preapproved_count, sponsor_approved_count, sponsor_rejected_count, support_breakdown_snapshot`,
  `${APPLICATION_LIFECYCLE_CORE}, created_at, receipt_number, applicant_name, phone, organization_name, organization_type, request_message, file_url, file_name, attachment_url, selected_price_type, selected_price_label, selected_price, client_price_selection_kind, admin_memo, status, sponsor_support_status, sponsor_preapproved_count, sponsor_approved_count, sponsor_rejected_count`,
  `${APPLICATION_LIFECYCLE_CORE}, created_at, receipt_number, applicant_name, phone, selected_price_type, selected_price_label, selected_price, client_price_selection_kind, admin_memo, status`,
  "id, created_at, receipt_number, applicant_name, phone, selected_price_type, selected_price_label, selected_price, client_price_selection_kind, admin_memo, status, final_selected_quote_id, final_selected_quote_source, quote_status, extension_round",
] as const;

const GUEST_QUOTE_SELECT =
  "id, created_at, application_id, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status";

const PREAPPROVAL_SELECT =
  "id, status, sponsor_company_id, sponsor_rule_id, estimated_support_amount, approved_support_amount, approved_at, support_kind, support_condition, support_type, assigned_staff_id";

async function loadApplicationRow(
  admin: SupabaseClient,
  applicationId: string,
): Promise<Record<string, unknown> | null> {
  let lastMessage = "신청을 찾을 수 없습니다.";
  for (const select of APPLICATION_SELECT_CANDIDATES) {
    const res = await admin.from("applications").select(select).eq("id", applicationId).maybeSingle();
    if (!res.error) {
      return res.data as Record<string, unknown> | null;
    }
    lastMessage = res.error.message;
    if (!isMissingColumnError(res.error)) {
      throw new Error(lastMessage);
    }
  }
  throw new Error(lastMessage);
}

async function loadMatchedDriverOnly(
  admin: SupabaseClient,
  applicationId: string,
  application: Record<string, unknown>,
  sponsorConfirmed: boolean,
  sponsor: AdminSponsorDetail | null,
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

  let quoteRaw: Record<string, unknown> | null = null;
  try {
    const rows = await queryDriverQuotesForApplication(admin, applicationId);
    quoteRaw = rows.find((r) => safeText(r.id) === finalId) ?? null;
    if (!quoteRaw) {
      quoteRaw = await queryDriverQuoteById(admin, finalId);
    }
  } catch (quoteLoadErr) {
    console.error("[application-detail] matched quote load", quoteLoadErr);
    try {
      quoteRaw = await queryDriverQuoteById(admin, finalId);
    } catch {
      return null;
    }
  }
  if (!quoteRaw) return null;

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
  try {
    const card = buildMemberQuoteCard(row, finalId, sponsorConfirmed, application, sponsor);
    return buildMatchedDriver(finalId, "member", [card], [], application, sponsorConfirmed, quote);
  } catch (cardErr) {
    console.error("[application-detail] matched member card", cardErr);
    return null;
  }
}

export async function fetchAdminDetailBasic(
  admin: SupabaseClient,
  applicationId: string,
  listRow?: Record<string, unknown>,
): Promise<AdminApplicationDetailBasicPayload> {
  const application = await loadApplicationRow(admin, applicationId);

  if (!application) {
    throw new Error("신청을 찾을 수 없습니다.");
  }

  try {
    await processApplicationQuoteLifecycle(admin, applicationId);
  } catch (lifecycleErr) {
    console.error("[application-detail] lifecycle", lifecycleErr);
  }

  const sponsorStatus = safeText(application.sponsor_support_status, "none");
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
      normalizeCustomerOrganizationType(
        safeText(listRow?.organization_type) || safeText(application.organization_type),
      ),
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

  const warnings: string[] = [];
  let sponsorQuick: AdminSponsorDetail | null = null;
  let preapprovalRows: Record<string, unknown>[] = [];
  let matched_driver: ReturnType<typeof buildMatchedDriver> = null;

  try {
    const sponsorResult = await fetchAdminDetailSponsorWithRows(admin, applicationId);
    preapprovalRows = sponsorResult.rows;
    sponsorQuick = pickPrimarySponsor(preapprovalRows);
  } catch (sponsorErr) {
    const msg = sponsorErr instanceof Error ? sponsorErr.message : "후원 정보 조회 실패";
    console.error("[application-detail] sponsor", sponsorErr);
    warnings.push(`후원 정보 조회 실패: ${msg}`);
  }

  const sponsorResolution = resolveAdminSponsorConfirmed({
    application,
    sponsor: sponsorQuick,
    preapprovalRows,
  });
  const sponsorConfirmedResolved = sponsorResolution.confirmed;

  if (safeText(application.final_selected_quote_id)) {
    try {
      matched_driver = await loadMatchedDriverOnly(
        admin,
        applicationId,
        application,
        sponsorConfirmedResolved,
        sponsorQuick,
      );
      if (!matched_driver) {
        warnings.push("매칭기사 견적을 찾지 못했습니다.");
      }
    } catch (matchedErr) {
      const msg = matchedErr instanceof Error ? matchedErr.message : "매칭기사 조회 실패";
      console.error("[application-detail] matched_driver", matchedErr);
      warnings.push(`매칭기사 조회 실패: ${msg}`);
    }
  }

  const hasSponsorFromPre =
    sponsorQuick != null ||
    (sponsorStatus !== "none" && sponsorStatus !== "") ||
    preCount > 0 ||
    appCount > 0;

  return {
    application: applicationOut,
    matched_driver,
    sponsor: sponsorQuick,
    sponsor_stage: {
      support_stage_badge: sponsorResolution.badge,
      sponsor_confirmed: sponsorConfirmedResolved,
      has_sponsor: hasSponsorFromPre,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
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
    queryDriverQuotesForApplication(admin, applicationId),
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

  try {
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
  } catch (enrichErr) {
    console.error("[application-detail] enrichPreapprovals", enrichErr);
    return preapprovals;
  }
}

export async function fetchAdminDetailQuotes(
  admin: SupabaseClient,
  applicationId: string,
  listRow: Record<string, unknown> | undefined,
  includeDebug: boolean,
): Promise<AdminApplicationDetailQuotesPayload> {
  try {
    await processApplicationQuoteLifecycle(admin, applicationId);
  } catch (lifecycleErr) {
    console.error("[application-detail] quotes lifecycle", lifecycleErr);
  }

  const [application, preRes] = await Promise.all([
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
  const sponsorResolution = resolveAdminSponsorConfirmed({
    application,
    sponsor,
    preapprovalRows: enrichedPre,
  });
  const sponsorConfirmed = sponsorResolution.confirmed;
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

  const member_quotes: AdminApplicationDetailQuotesPayload["member_quotes"] = [];
  for (const q of memberRows) {
    try {
      const card = buildMemberQuoteCard(
        q,
        finalQuoteId,
        sponsorConfirmed,
        application,
        sponsor,
      );
      member_quotes.push(stripMemberQuoteForClient(card, includeDebug));
    } catch (cardErr) {
      console.error("[application-detail] member quote card", cardErr);
    }
  }
  const guest_quotes = guestRows.map((q) => buildGuestQuoteCard(q, finalQuoteId, finalSource));

  let quote_summary = emptyAdminQuoteSummary(application);
  try {
    const detail = buildAdminApplicationDetailPayload({
      applicationRow: application,
      applicationLifecycle: application,
      memberQuoteRows: memberRows,
      guestQuoteRows: guestRows,
      preapprovalRows: enrichedPre,
      notificationRows: [],
      listRow,
    });
    quote_summary = detail.quote_summary;
  } catch (summaryErr) {
    console.error("[application-detail] quote_summary", summaryErr);
  }

  return {
    member_quotes,
    guest_quotes,
    quote_summary,
    sponsor,
    warnings: [],
  };
}

/** 견적종합 — 실패 시 warnings와 빈 목록 반환 (throw 하지 않음) */
export async function fetchAdminDetailQuotesResilient(
  admin: SupabaseClient,
  applicationId: string,
  listRow: Record<string, unknown> | undefined,
  includeDebug: boolean,
): Promise<AdminApplicationDetailQuotesPayload> {
  try {
    return await fetchAdminDetailQuotes(admin, applicationId, listRow, includeDebug);
  } catch (e) {
    const raw = e instanceof Error ? e.message : "견적종합 조회에 실패했습니다.";
    console.error("[application-detail] quotes failed:", raw, e);
    let application: Record<string, unknown> | null = null;
    try {
      application = await loadApplicationRow(admin, applicationId);
    } catch {
      application = null;
    }
    return {
      member_quotes: [],
      guest_quotes: [],
      quote_summary: emptyAdminQuoteSummary(application ?? undefined),
      sponsor: null,
      warnings: [`견적종합 조회 실패: ${raw}`],
    };
  }
}

export async function fetchAdminDetailSponsor(
  admin: SupabaseClient,
  applicationId: string,
): Promise<AdminSponsorDetail | null> {
  const { rows } = await fetchAdminDetailSponsorWithRows(admin, applicationId);
  return pickPrimarySponsor(rows);
}

async function fetchAdminDetailSponsorWithRows(
  admin: SupabaseClient,
  applicationId: string,
): Promise<{ rows: Record<string, unknown>[] }> {
  const { data, error } = await admin
    .from("sponsor_preapprovals")
    .select(PREAPPROVAL_SELECT)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = await enrichPreapprovals(
    admin,
    Array.isArray(data) ? (data as Record<string, unknown>[]) : [],
  );
  return { rows };
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
    fetchAdminDetailQuotesResilient(admin, applicationId, listRow, true),
    fetchAdminDetailSponsor(admin, applicationId),
    fetchAdminDetailSms(admin, applicationId),
  ]);
  return { basic, quotes, sponsor, sms };
}
