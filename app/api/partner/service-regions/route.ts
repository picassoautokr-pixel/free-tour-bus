import { NextResponse } from "next/server";

import { normalizeServiceRegions } from "@/lib/regions";
import { USER_ROLES } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type DriverContext =
  | { ok: true; userId: string; partnerDriverId: string }
  | { ok: false; status: number; error: string };

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

async function resolveApprovedDriver(): Promise<DriverContext> {
  const sessionClient = await createSupabaseRouteHandlerClient("partner");
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

export async function PATCH(request: Request) {
  const driver = await resolveApprovedDriver();
  if (!driver.ok) {
    return NextResponse.json({ error: driver.error }, { status: driver.status });
  }

  let body: { service_regions?: unknown };
  try {
    body = (await request.json()) as { service_regions?: unknown };
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const serviceRegions = normalizeServiceRegions(body.service_regions);
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data, error } = await admin
    .from("partner_drivers")
    .update({ service_regions: serviceRegions })
    .eq("id", driver.partnerDriverId)
    .eq("auth_user_id", driver.userId)
    .select("service_regions")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    service_regions: normalizeServiceRegions(
      (data as { service_regions?: unknown } | null)?.service_regions,
    ),
  });
}
