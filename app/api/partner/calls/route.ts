import { NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type DriverContext =
  | {
      ok: true;
      userId: string;
      partnerDriverId: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function safeText(value: unknown, emptyLabel = "—"): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function resolveApprovedDriver(): Promise<DriverContext> {
  const sessionClient = await createSupabaseRouteHandlerClient();
  if (!sessionClient) {
    return { ok: false, status: 500, error: "서버 설정 오류(Supabase)입니다." };
  }

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.",
    };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role, partner_driver_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return { ok: false, status: 502, error: profileError.message };
  }

  const p = profile as
    | { role?: unknown; partner_driver_id?: unknown }
    | null
    | undefined;
  if (safeText(p?.role, "").toLowerCase() !== USER_ROLES.DRIVER) {
    return { ok: false, status: 403, error: "기사 계정으로 로그인해 주세요." };
  }

  const partnerDriverId = safeText(p?.partner_driver_id, "");
  if (partnerDriverId === "") {
    return {
      ok: false,
      status: 403,
      error: "연결된 제휴기사 신청을 찾을 수 없습니다.",
    };
  }

  const { data: driver, error: driverError } = await admin
    .from("partner_drivers")
    .select("id, status")
    .eq("id", partnerDriverId)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (driverError) {
    return { ok: false, status: 502, error: driverError.message };
  }
  if (!driver || safeText((driver as { status?: unknown }).status, "").toLowerCase() !== "approved") {
    return { ok: false, status: 403, error: "관리자 승인 후 이용 가능합니다." };
  }

  return { ok: true, userId: user.id, partnerDriverId };
}

export async function GET() {
  const driver = await resolveApprovedDriver();
  if (!driver.ok) {
    return NextResponse.json({ error: driver.error }, { status: driver.status });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data: applications, error: applicationsError } = await admin
    .from("applications")
    .select(
      "id, created_at, receipt_number, application_type, trip_type, bus_grade, departure, destination, departure_date, departure_time, return_date, passenger_count, status",
    )
    .eq("application_type", APPLICATION_TYPE_NEW_BOOKING)
    .order("created_at", { ascending: false })
    .limit(50);

  if (applicationsError) {
    return NextResponse.json(
      { error: applicationsError.message },
      { status: 502 },
    );
  }

  const rows = Array.isArray(applications) ? applications : [];
  const ids = rows
    .map((r) => safeText((r as { id?: unknown }).id, ""))
    .filter(Boolean);

  const quotedByApplication = new Map<string, { id: string; price: number | null }>();
  if (ids.length > 0) {
    const { data: quotes, error: quotesError } = await admin
      .from("driver_quotes")
      .select("id, application_id, price")
      .eq("partner_driver_id", driver.partnerDriverId)
      .in("application_id", ids);

    if (quotesError) {
      return NextResponse.json({ error: quotesError.message }, { status: 502 });
    }

    for (const q of Array.isArray(quotes) ? quotes : []) {
      const row = q as Record<string, unknown>;
      const applicationId = safeText(row.application_id, "");
      if (applicationId === "") continue;
      quotedByApplication.set(applicationId, {
        id: safeText(row.id, ""),
        price: parseInteger(row.price),
      });
    }
  }

  const calls = rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const id = safeText(row.id, "");
    const quote = quotedByApplication.get(id) ?? null;
    return {
      id,
      created_at: safeText(row.created_at, ""),
      receipt_number: safeText(row.receipt_number, ""),
      application_type: safeText(row.application_type),
      trip_type: safeText(row.trip_type),
      bus_grade: safeText(row.bus_grade),
      departure: safeText(row.departure),
      destination: safeText(row.destination),
      departure_date: safeText(row.departure_date, ""),
      departure_time: safeText(row.departure_time),
      return_date: safeText(row.return_date, ""),
      passenger_count: parseInteger(row.passenger_count),
      my_quote: quote,
    };
  });

  return NextResponse.json({ ok: true, calls });
}
