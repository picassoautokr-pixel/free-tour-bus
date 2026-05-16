import { NextResponse } from "next/server";

import { parseStopovers } from "@/lib/stopovers";
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

  const [{ data: ruleRows }, { data: staffRows }] = await Promise.all([
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
  ]);

  const rules = Array.isArray(ruleRows) ? ruleRows : [];
  const activeRegions = new Set<string>();
  for (const raw of rules) {
    const row = raw as Record<string, unknown>;
    if (row.is_active === false) continue;
    for (const region of normalizeStringArray(row.service_regions)) activeRegions.add(region);
  }

  let applicationQuery = admin
    .from("applications")
    .select(
      "id, created_at, departure_region, departure, destination, stopovers, departure_date, departure_time, passenger_count, trip_type, bus_grade, quote_status, quote_closed_at",
    )
    .eq("application_type", "신규로 예약이 필요하신 경우")
    .order("created_at", { ascending: false })
    .limit(60);

  if (activeRegions.size > 0) {
    applicationQuery = applicationQuery.in("departure_region", [...activeRegions]);
  }

  const { data: applicationRows } = await applicationQuery;
  const calls = (Array.isArray(applicationRows) ? applicationRows : []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const passengerCount = parseInteger(row.passenger_count);
    const supportRule = rules.find((ruleRaw) => {
      const rule = ruleRaw as Record<string, unknown>;
      if (rule.is_active === false) return false;
      const regions = normalizeStringArray(rule.service_regions);
      return regions.length === 0 || regions.includes(safeText(row.departure_region));
    }) as Record<string, unknown> | undefined;
    const perPerson = parseInteger(supportRule?.support_per_person) ?? 0;
    const perCase = parseInteger(supportRule?.support_per_case) ?? 0;
    const maxAmount = parseInteger(supportRule?.max_support_amount) ?? 0;
    const estimate = (passengerCount ?? 0) * perPerson + perCase;
    return {
      id: safeText(row.id),
      departure_region: safeText(row.departure_region),
      departure: safeText(row.departure),
      destination: safeText(row.destination),
      stopovers: parseStopovers(row.stopovers),
      departure_date: safeText(row.departure_date),
      departure_time: safeText(row.departure_time),
      passenger_count: passengerCount,
      trip_type: safeText(row.trip_type),
      bus_grade: safeText(row.bus_grade),
      quote_status: safeText(row.quote_status, "collecting"),
      quote_closed_at: safeText(row.quote_closed_at),
      estimated_support_amount: maxAmount > 0 ? Math.min(estimate, maxAmount) : estimate,
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
