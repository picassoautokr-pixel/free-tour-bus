import { NextResponse } from "next/server";

import {
  buildSummary,
  type SponsorCallRow,
} from "@/lib/sponsor-call-view-model";
import {
  catalogFromSettings,
  parseDashboardSettings,
} from "@/lib/sponsor-catalog";
import { mapSponsorApplicationTripFields } from "@/lib/sponsor-application-map";
import { DEFAULT_SPONSOR_RULE_TITLE } from "@/lib/sponsor-rule-helpers";
import { sponsorRuleIsInUse } from "@/lib/sponsor-rule-usage";
import {
  normalizeStringArray,
  parseInteger,
  parseSponsorSupportType,
  safeText,
} from "@/lib/sponsor";

const APPLICATION_TRIP_SELECT_FULL =
  "id, created_at, application_type, organization_type, organization_name, applicant_name, departure_region, departure, destination, stopovers, departure_date, departure_time, passenger_count, trip_type, bus_grade, quote_status, quote_closed_at, quote_deadline_at, quote_limit_count, final_selected_quote_id, client_price_selection_kind, selected_price_type, selected_price_label, selected_price";

const APPLICATION_TRIP_SELECT_BASE =
  "id, created_at, application_type, organization_type, organization_name, applicant_name, departure_region, departure, destination, stopovers, departure_date, departure_time, passenger_count, trip_type, bus_grade, quote_status, quote_closed_at, quote_deadline_at, quote_limit_count, final_selected_quote_id";

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|column .* does not exist|could not find .* column|schema cache/i.test(
      error?.message ?? "",
    )
  );
}
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type SponsorCompany = {
  id: string;
  status: string;
  company_name: string;
  manager_name: string;
  phone: string;
  email: string;
  support_type: string;
};

async function resolveSponsor() {
  const sessionClient = await createSupabaseRouteHandlerClient("sponsor");
  if (!sessionClient) return { error: "서버 설정 오류입니다.", status: 500 } as const;
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return { error: "로그인이 필요합니다.", status: 401 } as const;

  const admin = createServiceRoleSupabase();
  if (!admin) return { error: "서비스 설정 오류입니다.", status: 503 } as const;

  const { data, error } = await admin
    .from("sponsor_companies")
    .select(
      "id, status, company_name, manager_name, phone, email, support_type, dashboard_settings",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message, status: 502 } as const;
  if (!data) return { error: "스폰서 신청 정보를 찾을 수 없습니다.", status: 404 } as const;

  return { admin, company: data as SponsorCompany, userId: user.id } as const;
}

export async function GET() {
  const resolved = await resolveSponsor();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { admin, company } = resolved;
  if (company.status !== "approved") {
    return NextResponse.json({
      ok: true,
      company,
      approved: false,
      rules: [],
      staff: [],
      calls: [],
      summary: null,
      catalog: null,
    });
  }

  const companyRecord = company as Record<string, unknown>;
  const dashboardSettings = parseDashboardSettings(companyRecord.dashboard_settings);
  const catalog = catalogFromSettings(dashboardSettings);

  const [{ data: ruleRows }, { data: staffRows }, { data: preapprovalRows }] = await Promise.all([
    admin
      .from("sponsor_rules")
      .select("*")
      .eq("sponsor_company_id", company.id)
      .order("created_at", { ascending: false }),
    admin
      .from("sponsor_staff")
      .select("*")
      .eq("sponsor_company_id", company.id)
      .order("created_at", { ascending: false }),
    admin
      .from("sponsor_preapprovals")
      .select("*")
      .eq("sponsor_company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  const rules = Array.isArray(ruleRows) ? ruleRows : [];
  const preapprovals = Array.isArray(preapprovalRows) ? preapprovalRows : [];
  const applicationIds = [
    ...new Set(preapprovals.map((raw) => safeText((raw as Record<string, unknown>).application_id)).filter(Boolean)),
  ];
  const ruleIds = [
    ...new Set(preapprovals.map((raw) => safeText((raw as Record<string, unknown>).sponsor_rule_id)).filter(Boolean)),
  ];
  let applicationRows: unknown[] = [];
  if (applicationIds.length > 0) {
    const applicationResultFull = await admin
      .from("applications")
      .select(APPLICATION_TRIP_SELECT_FULL)
      .in("id", applicationIds);
    const applicationResult =
      isMissingColumnError(applicationResultFull.error)
        ? await admin
            .from("applications")
            .select(APPLICATION_TRIP_SELECT_BASE)
            .in("id", applicationIds)
        : applicationResultFull;
    if (applicationResult.error) {
      return NextResponse.json({ error: applicationResult.error.message }, { status: 502 });
    }
    applicationRows = Array.isArray(applicationResult.data) ? applicationResult.data : [];
  }

  const finalQuoteIds = [
    ...new Set(
      (Array.isArray(applicationRows) ? applicationRows : [])
        .map((row) => safeText((row as Record<string, unknown>).final_selected_quote_id))
        .filter(Boolean),
    ),
  ];
  const [{ data: matchedRuleRows }, { data: quoteRows }, { data: finalQuoteRows }] =
    await Promise.all([
    ruleIds.length > 0
      ? admin
          .from("sponsor_rules")
          .select("id, title, support_type, support_condition")
          .in("id", ruleIds)
      : Promise.resolve({ data: [] }),
    applicationIds.length > 0
      ? admin
          .from("driver_quotes")
          .select("application_id, sponsor_quote_enabled, status")
          .in("application_id", applicationIds)
      : Promise.resolve({ data: [] }),
    finalQuoteIds.length > 0
      ? admin
          .from("driver_quotes")
          .select("id, application_id, partner_driver_id, auth_user_id")
          .in("id", finalQuoteIds)
      : Promise.resolve({ data: [] }),
  ]);

  const partnerDriverIds = [
    ...new Set(
      (Array.isArray(finalQuoteRows) ? finalQuoteRows : [])
        .map((raw) => safeText((raw as Record<string, unknown>).partner_driver_id))
        .filter(Boolean),
    ),
  ];
  const { data: partnerDriverRows } =
    partnerDriverIds.length > 0
      ? await admin
          .from("partner_drivers")
          .select("id, name, phone")
          .in("id", partnerDriverIds)
      : { data: [] };
  const driverByPartnerId = new Map(
    (Array.isArray(partnerDriverRows) ? partnerDriverRows : []).map((row) => [
      safeText((row as Record<string, unknown>).id),
      row as Record<string, unknown>,
    ]),
  );
  const finalQuoteById = new Map(
    (Array.isArray(finalQuoteRows) ? finalQuoteRows : []).map((row) => [
      safeText((row as Record<string, unknown>).id),
      row as Record<string, unknown>,
    ]),
  );

  const applicationById = new Map(
    (Array.isArray(applicationRows) ? applicationRows : []).map((row) => [
      safeText((row as Record<string, unknown>).id),
      row as Record<string, unknown>,
    ]),
  );
  const ruleTitleById = new Map(
    (Array.isArray(matchedRuleRows) ? matchedRuleRows : []).map((row) => [
      safeText((row as Record<string, unknown>).id),
      row as Record<string, unknown>,
    ]),
  );
  const staffById = new Map(
    (Array.isArray(staffRows) ? staffRows : []).map((row) => [
      safeText((row as Record<string, unknown>).id),
      row as Record<string, unknown>,
    ]),
  );
  const quoteStatsByApplication = new Map<
    string,
    { quote_count: number; sponsor_quote_count: number; matched_quote_count: number; final_quote_count: number }
  >();
  for (const raw of Array.isArray(quoteRows) ? quoteRows : []) {
    const row = raw as Record<string, unknown>;
    const applicationId = safeText(row.application_id);
    if (!applicationId) continue;
    const prev =
      quoteStatsByApplication.get(applicationId) ??
      { quote_count: 0, sponsor_quote_count: 0, matched_quote_count: 0, final_quote_count: 0 };
    prev.quote_count += 1;
    if (row.sponsor_quote_enabled === true) prev.sponsor_quote_count += 1;
    if (safeText(row.status) === "provisional_selected") prev.matched_quote_count += 1;
    if (safeText(row.status) === "final_selected") prev.final_quote_count += 1;
    quoteStatsByApplication.set(applicationId, prev);
  }

  const calls = preapprovals.map((raw) => {
    const preapproval = raw as Record<string, unknown>;
    const applicationId = safeText(preapproval.application_id);
    const application = applicationById.get(applicationId) ?? {};
    const rule = ruleTitleById.get(safeText(preapproval.sponsor_rule_id)) ?? {};
    const assignedStaff = staffById.get(safeText(preapproval.assigned_staff_id)) ?? {};
    const quoteStats =
      quoteStatsByApplication.get(applicationId) ??
      { quote_count: 0, sponsor_quote_count: 0, matched_quote_count: 0, final_quote_count: 0 };
    const trip = mapSponsorApplicationTripFields(application, preapproval, rule);
    const finalQuoteId = safeText(application.final_selected_quote_id);
    const matchCompleted = Boolean(finalQuoteId);
    const finalQuote = finalQuoteById.get(finalQuoteId);
    const partnerDriver = finalQuote
      ? driverByPartnerId.get(safeText(finalQuote.partner_driver_id))
      : null;
    const row: SponsorCallRow = {
      id: safeText(preapproval.id),
      application_id: applicationId,
      sponsor_rule_id: safeText(preapproval.sponsor_rule_id),
      sponsor_rule_title: safeText(rule.title, "후원조건"),
      support_type: safeText(rule.support_type, company.support_type),
      support_condition: safeText(rule.support_condition),
      status: safeText(preapproval.status, "preapproved"),
      payout_status: safeText(preapproval.payout_status) || undefined,
      support_kind: safeText(preapproval.support_kind) || undefined,
      support_form_kind: safeText(preapproval.support_form_kind) || undefined,
      support_condition_label: safeText(preapproval.support_condition_label) || undefined,
      departure_region: trip.departure_region,
      departure: trip.departure,
      destination: trip.destination,
      stopovers: trip.stopovers,
      departure_date: trip.departure_date,
      departure_time: trip.departure_time,
      passenger_count: trip.passenger_count,
      trip_type: trip.trip_type,
      bus_grade: trip.bus_grade,
      group_type: trip.group_type,
      quote_status: trip.quote_status,
      quote_deadline_at: trip.quote_deadline_at,
      quote_limit_count: trip.quote_limit_count,
      final_selected_quote_id: safeText(application.final_selected_quote_id),
      selected_price_type: safeText(application.selected_price_type) || undefined,
      selected_price_label: safeText(application.selected_price_label) || undefined,
      selected_price: parseInteger(application.selected_price),
      client_price_selection_kind: safeText(application.client_price_selection_kind) || undefined,
      organization_name: trip.organization_name,
      quote_closed_at: safeText(application.quote_closed_at),
      estimated_support_amount: parseInteger(preapproval.estimated_support_amount) ?? 0,
      approved_support_amount: parseInteger(preapproval.approved_support_amount),
      matched_reason: safeText(preapproval.matched_reason),
      decision_memo: safeText(preapproval.decision_memo),
      decided_at: safeText(preapproval.decided_at),
      approved_at: safeText(preapproval.approved_at),
      rejected_at: safeText(preapproval.rejected_at),
      assigned_staff_id: safeText(preapproval.assigned_staff_id),
      assigned_staff_name: safeText(assignedStaff.name),
      assigned_staff_phone: safeText(assignedStaff.phone),
      staff_sms_sent_at: safeText(preapproval.staff_sms_sent_at),
      staff_sms_error: safeText(preapproval.staff_sms_error),
      quote_count: quoteStats.quote_count,
      sponsor_quote_count: quoteStats.sponsor_quote_count,
      matched_quote_count: quoteStats.matched_quote_count,
      final_quote_count: quoteStats.final_quote_count,
      customer_name: matchCompleted ? safeText(application.applicant_name) : "",
      customer_phone: matchCompleted ? safeText(application.phone) : "",
      driver_name: matchCompleted ? safeText(partnerDriver?.name) : "",
      driver_phone: matchCompleted ? safeText(partnerDriver?.phone) : "",
    };
    return row;
  });

  const summary = buildSummary(
    calls as SponsorCallRow[],
    dashboardSettings.total_budget ?? dashboardSettings.monthly_budget,
  );

  return NextResponse.json({
    ok: true,
    company,
    approved: true,
    rules,
    staff: Array.isArray(staffRows) ? staffRows : [],
    calls,
    summary,
    catalog,
    dashboard_settings: dashboardSettings,
  });
}

export async function POST(request: Request) {
  const resolved = await resolveSponsor();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { admin, company } = resolved;
  if (company.status !== "approved") {
    return NextResponse.json({ error: "승인된 후원업체만 이용할 수 있습니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  const type = safeText(body.type);
  const id = safeText(body.id);
  const payload = (body.payload ?? {}) as Record<string, unknown>;

  if (type === "rule") {
    const targetGroups = normalizeStringArray(payload.target_groups);
    const patch: Record<string, unknown> = {
      sponsor_company_id: company.id,
      title: safeText(payload.title),
      service_regions: normalizeStringArray(payload.service_regions),
      support_per_person: parseInteger(payload.support_per_person) ?? 0,
      support_per_case: parseInteger(payload.support_per_case) ?? 0,
      max_support_amount: parseInteger(payload.max_support_amount) ?? 0,
      min_passenger_count: parseInteger(payload.min_passenger_count),
      max_passenger_count: parseInteger(payload.max_passenger_count),
      target_group: targetGroups[0] ?? safeText(payload.target_group),
      support_condition: safeText(payload.support_condition),
      support_type: parseSponsorSupportType(payload.support_type),
      daily_budget: parseInteger(payload.daily_budget),
      monthly_budget: parseInteger(payload.monthly_budget),
      is_active: payload.is_active !== false,
      is_default: payload.is_default === true,
      memo: safeText(payload.memo),
      target_groups: targetGroups.length > 0 ? targetGroups : null,
    };
    let query = id
      ? admin.from("sponsor_rules").update(patch).eq("id", id).eq("sponsor_company_id", company.id)
      : admin.from("sponsor_rules").insert(patch);
    let { error } = await query;
    if (error && /target_groups|does not exist|42703/i.test(error.message)) {
      const legacy = { ...patch };
      delete legacy.target_groups;
      query = id
        ? admin.from("sponsor_rules").update(legacy).eq("id", id).eq("sponsor_company_id", company.id)
        : admin.from("sponsor_rules").insert(legacy);
      ({ error } = await query);
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (type === "rule_delete") {
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    const { data: target } = await admin
      .from("sponsor_rules")
      .select("title, is_default")
      .eq("id", id)
      .eq("sponsor_company_id", company.id)
      .maybeSingle();
    const targetRow = (target ?? {}) as Record<string, unknown>;
    if (
      targetRow.is_default === true ||
      safeText(targetRow.title) === DEFAULT_SPONSOR_RULE_TITLE
    ) {
      return NextResponse.json({ error: "기본지원은 삭제할 수 없습니다." }, { status: 400 });
    }
    const inUse = await sponsorRuleIsInUse(admin, id, company.id);
    if (inUse) {
      const { error } = await admin
        .from("sponsor_rules")
        .update({ is_active: false })
        .eq("id", id)
        .eq("sponsor_company_id", company.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 502 });
      return NextResponse.json({ ok: true, soft_deleted: true });
    }
    const { error } = await admin
      .from("sponsor_rules")
      .delete()
      .eq("id", id)
      .eq("sponsor_company_id", company.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, soft_deleted: false });
  }

  if (type === "staff_delete") {
    if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    const { error } = await admin
      .from("sponsor_staff")
      .delete()
      .eq("id", id)
      .eq("sponsor_company_id", company.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (type === "staff") {
    const regions = normalizeStringArray(
      payload.assigned_regions ?? payload.service_regions,
    );
    const patch: Record<string, unknown> = {
      sponsor_company_id: company.id,
      name: safeText(payload.name),
      phone: safeText(payload.phone),
      email: safeText(payload.email),
      role: safeText(payload.role),
      service_regions: regions,
      assigned_regions: regions,
      is_active: payload.is_active !== false,
    };
    const query = id
      ? admin.from("sponsor_staff").update(patch).eq("id", id).eq("sponsor_company_id", company.id)
      : admin.from("sponsor_staff").insert(patch);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (type === "settings") {
    const patch = {
      dashboard_settings: {
        support_kinds: normalizeStringArray(payload.support_kinds),
        support_forms: normalizeStringArray(payload.support_forms),
        support_conditions: normalizeStringArray(payload.support_conditions),
        total_budget: parseInteger(payload.total_budget),
        monthly_budget: parseInteger(payload.monthly_budget),
      },
    };
    let { error } = await admin
      .from("sponsor_companies")
      .update(patch)
      .eq("id", company.id);
    if (error && /dashboard_settings|does not exist|42703/i.test(error.message)) {
      return NextResponse.json(
        { error: "dashboard_settings 컬럼이 없습니다. sql/sponsor_preapprovals_payout.sql 을 적용해 주세요." },
        { status: 502 },
      );
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
