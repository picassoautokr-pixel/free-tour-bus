import { NextResponse } from "next/server";

import {
  normalizeStringArray,
  parseInteger,
  parseSponsorSupportType,
  safeText,
} from "@/lib/sponsor";
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
    .select("id, status, company_name, manager_name, phone, email, support_type")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return { error: error.message, status: 502 } as const;
  if (!data) return { error: "후원업체 신청 정보를 찾을 수 없습니다.", status: 404 } as const;

  return { admin, company: data as SponsorCompany, userId: user.id } as const;
}

export async function GET() {
  const resolved = await resolveSponsor();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { admin, company } = resolved;
  if (company.status !== "approved") {
    return NextResponse.json({ ok: true, company, approved: false, rules: [], staff: [], calls: [] });
  }

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
  const [{ data: applicationRows }, { data: matchedRuleRows }, { data: quoteRows }] = await Promise.all([
    applicationIds.length > 0
      ? admin
          .from("applications")
          .select(
            "id, created_at, departure_region, departure, destination, stopovers, departure_date, departure_time, passenger_count, trip_type, bus_grade, quote_status, quote_closed_at",
          )
          .in("id", applicationIds)
      : Promise.resolve({ data: [] }),
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
  ]);

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
    return {
      id: safeText(preapproval.id),
      application_id: applicationId,
      sponsor_rule_id: safeText(preapproval.sponsor_rule_id),
      sponsor_rule_title: safeText(rule.title, "후원조건"),
      support_type: safeText(rule.support_type, company.support_type),
      support_condition: safeText(rule.support_condition),
      status: safeText(preapproval.status, "preapproved"),
      departure_region: safeText(application.departure_region),
      departure: safeText(application.departure),
      destination: safeText(application.destination),
      stopovers: normalizeStringArray(application.stopovers),
      departure_date: safeText(application.departure_date),
      departure_time: safeText(application.departure_time),
      passenger_count: parseInteger(preapproval.passenger_count) ?? parseInteger(application.passenger_count),
      trip_type: safeText(application.trip_type),
      bus_grade: safeText(application.bus_grade),
      quote_status: safeText(application.quote_status, "collecting"),
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
    };
  });

  return NextResponse.json({
    ok: true,
    company,
    approved: true,
    rules,
    staff: Array.isArray(staffRows) ? staffRows : [],
    calls,
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
    const patch = {
      sponsor_company_id: company.id,
      title: safeText(payload.title),
      service_regions: normalizeStringArray(payload.service_regions),
      support_per_person: parseInteger(payload.support_per_person) ?? 0,
      support_per_case: parseInteger(payload.support_per_case) ?? 0,
      max_support_amount: parseInteger(payload.max_support_amount) ?? 0,
      min_passenger_count: parseInteger(payload.min_passenger_count),
      max_passenger_count: parseInteger(payload.max_passenger_count),
      target_group: safeText(payload.target_group),
      support_condition: safeText(payload.support_condition),
      support_type: parseSponsorSupportType(payload.support_type),
      daily_budget: parseInteger(payload.daily_budget),
      monthly_budget: parseInteger(payload.monthly_budget),
      is_active: payload.is_active !== false,
      memo: safeText(payload.memo),
    };
    const query = id
      ? admin.from("sponsor_rules").update(patch).eq("id", id).eq("sponsor_company_id", company.id)
      : admin.from("sponsor_rules").insert(patch);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (type === "staff") {
    const patch = {
      sponsor_company_id: company.id,
      name: safeText(payload.name),
      phone: safeText(payload.phone),
      email: safeText(payload.email),
      role: safeText(payload.role),
      service_regions: normalizeStringArray(payload.service_regions),
      is_active: payload.is_active !== false,
    };
    const query = id
      ? admin.from("sponsor_staff").update(patch).eq("id", id).eq("sponsor_company_id", company.id)
      : admin.from("sponsor_staff").insert(patch);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
