import { NextResponse } from "next/server";

import { USER_ROLES } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type Body = {
  application_id?: unknown;
  price?: unknown;
  vehicle_type?: unknown;
  available_time?: unknown;
  message?: unknown;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (digits !== "") {
      const n = Number.parseInt(digits, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

async function resolveApprovedDriver(): Promise<
  | { ok: true; userId: string; partnerDriverId: string }
  | { ok: false; status: number; error: string }
> {
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
  if (safeText(p?.role).toLowerCase() !== USER_ROLES.DRIVER) {
    return { ok: false, status: 403, error: "기사 계정으로 로그인해 주세요." };
  }

  const partnerDriverId = safeText(p?.partner_driver_id);
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

  const status = safeText((driver as { status?: unknown } | null)?.status);
  if (!driver || status.toLowerCase() !== "approved") {
    return { ok: false, status: 403, error: "관리자 승인 후 이용 가능합니다." };
  }

  return { ok: true, userId: user.id, partnerDriverId };
}

export async function POST(request: Request) {
  const driver = await resolveApprovedDriver();
  if (!driver.ok) {
    return NextResponse.json({ error: driver.error }, { status: driver.status });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const applicationId = safeText(body.application_id);
  const price = parsePrice(body.price);
  const vehicleType = safeText(body.vehicle_type);
  const availableTime = safeText(body.available_time);
  const message = safeText(body.message);

  if (applicationId === "") {
    return NextResponse.json(
      { error: "application_id가 필요합니다." },
      { status: 400 },
    );
  }
  if (price == null || price <= 0) {
    return NextResponse.json(
      { error: "견적금액을 올바르게 입력해 주세요." },
      { status: 400 },
    );
  }
  if (vehicleType === "") {
    return NextResponse.json(
      { error: "차량유형을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (availableTime === "") {
    return NextResponse.json(
      { error: "가능 출발시간을 입력해 주세요." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data: application, error: applicationError } = await admin
    .from("applications")
    .select("id, application_type")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    return NextResponse.json(
      { error: applicationError.message },
      { status: 502 },
    );
  }

  const appType = safeText(
    (application as { application_type?: unknown } | null)?.application_type,
  );
  if (!application || appType !== APPLICATION_TYPE_NEW_BOOKING) {
    return NextResponse.json(
      { error: "견적 제출 대상 신청이 아닙니다." },
      { status: 400 },
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("driver_quotes")
    .select("id")
    .eq("application_id", applicationId)
    .eq("partner_driver_id", driver.partnerDriverId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }
  if (existing) {
    return NextResponse.json(
      { error: "이미 견적을 제출했습니다." },
      { status: 409 },
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("driver_quotes")
    .insert({
      application_id: applicationId,
      partner_driver_id: driver.partnerDriverId,
      auth_user_id: driver.userId,
      price,
      vehicle_type: vehicleType,
      available_time: availableTime,
      message,
      status: "submitted",
    })
    .select("id, price")
    .single();

  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      return NextResponse.json(
        { error: "이미 견적을 제출했습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, quote: inserted });
}
