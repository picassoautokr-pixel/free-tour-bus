import { NextResponse } from "next/server";

import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import {
  DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES,
  DEFAULT_BUSINESS_END_TIME,
  DEFAULT_BUSINESS_START_TIME,
  DEFAULT_QUOTE_AUTOMATION_TIMEZONE,
} from "@/lib/quote-auction";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type SettingsPayload = {
  business_start_time?: unknown;
  business_end_time?: unknown;
  auto_final_confirm_delay_minutes?: unknown;
  timezone?: unknown;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function validTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeSettings(row: Record<string, unknown> | null | undefined) {
  return {
    id: "quote_automation",
    business_start_time: validTime(safeText(row?.business_start_time))
      ? safeText(row?.business_start_time)
      : DEFAULT_BUSINESS_START_TIME,
    business_end_time: validTime(safeText(row?.business_end_time))
      ? safeText(row?.business_end_time)
      : DEFAULT_BUSINESS_END_TIME,
    auto_final_confirm_delay_minutes:
      parseInteger(row?.auto_final_confirm_delay_minutes) ??
      DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES,
    timezone: safeText(row?.timezone, DEFAULT_QUOTE_AUTOMATION_TIMEZONE),
    updated_at: safeText(row?.updated_at),
  };
}

async function requireAdminSession(): Promise<
  | { ok: true }
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

  const profile = await fetchProfileForAuthUser(sessionClient, user.id);
  if (profile && parseUserRole(profile.role) !== USER_ROLES.ADMIN) {
    return { ok: false, status: 403, error: "관리자만 접근할 수 있습니다." };
  }

  return { ok: true };
}

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data, error } = await admin
    .from("admin_settings")
    .select(
      "id, business_start_time, business_end_time, auto_final_confirm_delay_minutes, timezone, updated_at",
    )
    .eq("id", "quote_automation")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, settings: normalizeSettings(data) });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: SettingsPayload;
  try {
    body = (await request.json()) as SettingsPayload;
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const businessStartTime = safeText(
    body.business_start_time,
    DEFAULT_BUSINESS_START_TIME,
  );
  const businessEndTime = safeText(body.business_end_time, DEFAULT_BUSINESS_END_TIME);
  const delayMinutes =
    parseInteger(body.auto_final_confirm_delay_minutes) ??
    DEFAULT_AUTO_FINAL_CONFIRM_DELAY_MINUTES;
  const timezone = safeText(body.timezone, DEFAULT_QUOTE_AUTOMATION_TIMEZONE);

  if (!validTime(businessStartTime) || !validTime(businessEndTime)) {
    return NextResponse.json(
      { error: "업무시간은 HH:mm 형식이어야 합니다." },
      { status: 400 },
    );
  }
  if (businessStartTime >= businessEndTime) {
    return NextResponse.json(
      { error: "업무 종료시간은 시작시간보다 늦어야 합니다." },
      { status: 400 },
    );
  }
  if (delayMinutes <= 0 || delayMinutes > 1440) {
    return NextResponse.json(
      { error: "자동확정 대기시간은 1~1440분 사이여야 합니다." },
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

  const { data, error } = await admin
    .from("admin_settings")
    .upsert(
      {
        id: "quote_automation",
        business_start_time: businessStartTime,
        business_end_time: businessEndTime,
        auto_final_confirm_delay_minutes: delayMinutes,
        timezone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select(
      "id, business_start_time, business_end_time, auto_final_confirm_delay_minutes, timezone, updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, settings: normalizeSettings(data) });
}

