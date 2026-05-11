import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";

import { USER_ROLES } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type Body = {
  application_id?: unknown;
  referred_phone?: unknown;
};

type DriverContext =
  | { ok: true; userId: string; partnerDriverId: string }
  | { ok: false; status: number; error: string };

function safeText(value: unknown, emptyLabel = ""): string {
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

function normalizeKoreanMobileDigits(value: unknown): string | null {
  const digits = safeText(value).replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

function formatKoreanMobile(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://www.free-bus.co.kr";
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
  const phoneDigits = normalizeKoreanMobileDigits(body.referred_phone);
  if (applicationId === "") {
    return NextResponse.json(
      { error: "application_id가 필요합니다." },
      { status: 400 },
    );
  }
  if (phoneDigits == null) {
    return NextResponse.json(
      { error: "유효한 휴대폰 번호(010)가 아닙니다." },
      { status: 400 },
    );
  }

  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim();
  if (!apiKey || !apiSecret || !from) {
    return NextResponse.json(
      {
        error:
          "솔라피 환경변수(SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.",
      },
      { status: 503 },
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
    .select(
      "id, application_type, departure, destination, departure_date, departure_time, passenger_count",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 502 });
  }

  const app = application as Record<string, unknown> | null;
  if (!app || safeText(app.application_type) !== APPLICATION_TYPE_NEW_BOOKING) {
    return NextResponse.json(
      { error: "전달 가능한 견적요청이 아닙니다." },
      { status: 400 },
    );
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const referredPhone = formatKoreanMobile(phoneDigits);

  const { data: inserted, error: insertError } = await admin
    .from("quote_referrals")
    .insert({
      application_id: applicationId,
      referrer_partner_driver_id: driver.partnerDriverId,
      referred_phone: referredPhone,
      token,
      status: "sent",
      expires_at: expiresAt,
    })
    .select("id, token")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  const baseUrl = siteBaseUrl();
  const dateTime = [safeText(app.departure_date, "미정"), safeText(app.departure_time, "")]
    .filter(Boolean)
    .join(" ");
  const passengerCount = parseInteger(app.passenger_count);
  const text = `[무료관광버스]
전세버스 견적요청이 전달되었습니다.

출발: ${safeText(app.departure, "미정")}
도착: ${safeText(app.destination, "미정")}
일시: ${dateTime || "미정"}
인원: ${passengerCount == null ? "미정" : passengerCount}

견적 확인/제출:
${baseUrl}/shared-quote/${token}

제휴기사 등록:
${baseUrl}/partner/register?ref=${token}`;

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to: phoneDigits, from, text }]);
    return NextResponse.json({ ok: true, referral: inserted });
  } catch (e) {
    console.error("[quote-referrals] Solapi send failed:", e);
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null && "toString" in e
          ? String(e)
          : "문자 발송에 실패했습니다.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
