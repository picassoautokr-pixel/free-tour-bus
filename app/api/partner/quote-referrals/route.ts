import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";

import { processApplicationQuoteLifecycle } from "@/lib/quote-auction";
import { USER_ROLES } from "@/lib/roles";
import { formatStopovers } from "@/lib/stopovers";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isApplicationHidden } from "@/lib/application-visibility";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type Body = {
  application_id?: unknown;
  phones?: unknown;
  referred_phone?: unknown;
};

type ReferralResult = {
  phone: string;
  status: "sent" | "skipped_duplicate" | "invalid_phone" | "send_failed";
  error?: string;
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

function isApplicationClosedForReferral(app: Record<string, unknown>): boolean {
  const closedStatuses = new Set([
    "closed_by_time",
    "closed_by_quote_count",
    "closed_by_price",
    "auto_selected",
    "final_selected",
    "completed",
    "contract_pending",
    "manually_closed",
  ]);
  return (
    safeText(app.quote_closed_at) !== "" ||
    safeText(app.final_selected_quote_id) !== "" ||
    closedStatuses.has(safeText(app.quote_status, "collecting"))
  );
}

function inputPhones(body: Body): unknown[] {
  if (Array.isArray(body.phones)) return body.phones;
  if (body.referred_phone != null) return [body.referred_phone];
  return [];
}

function phoneLookupValues(phones: string[]): string[] {
  const values = new Set<string>();
  for (const phone of phones) {
    values.add(phone);
    values.add(formatKoreanMobile(phone));
  }
  return [...values];
}

function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://www.free-bus.co.kr";
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
  if (applicationId === "") {
    return NextResponse.json(
      { error: "application_id가 필요합니다." },
      { status: 400 },
    );
  }

  const rawPhones = inputPhones(body);
  if (rawPhones.length === 0) {
    return NextResponse.json(
      { error: "전달할 휴대폰 번호를 입력해 주세요." },
      { status: 400 },
    );
  }

  const results: ReferralResult[] = [];
  const validPhones: string[] = [];
  const seenPhones = new Set<string>();
  for (const rawPhone of rawPhones) {
    const displayPhone = safeText(rawPhone);
    const normalized = normalizeKoreanMobileDigits(rawPhone);
    if (normalized == null) {
      results.push({
        phone: displayPhone.replace(/\s+/g, "") || String(rawPhone ?? ""),
        status: "invalid_phone",
      });
      continue;
    }
    if (seenPhones.has(normalized)) continue;
    seenPhones.add(normalized);
    validPhones.push(normalized);
  }

  if (validPhones.length > 20) {
    return NextResponse.json(
      { error: "한 번에 최대 20명까지만 전달할 수 있습니다." },
      { status: 400 },
    );
  }
  if (validPhones.length === 0) {
    return NextResponse.json({
      ok: true,
      success_count: 0,
      fail_count: results.length,
      skipped_count: 0,
      results,
    });
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
      "id, application_type, departure, destination, stopovers, departure_date, departure_time, passenger_count, quote_status, quote_closed_at, final_selected_quote_id",
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
  if (isApplicationHidden(app)) {
    return NextResponse.json(
      { error: "전달 가능한 견적요청이 아닙니다." },
      { status: 404 },
    );
  }

  await processApplicationQuoteLifecycle(admin, applicationId);
  const { data: latestApplication, error: latestApplicationError } = await admin
    .from("applications")
    .select(
      "id, application_type, departure, destination, stopovers, departure_date, departure_time, passenger_count, quote_status, quote_closed_at, final_selected_quote_id",
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (latestApplicationError) {
    return NextResponse.json(
      { error: latestApplicationError.message },
      { status: 502 },
    );
  }

  const activeApp =
    (latestApplication as unknown as Record<string, unknown> | null) ?? app;
  if (isApplicationClosedForReferral(activeApp)) {
    return NextResponse.json({ error: "quote_closed" }, { status: 409 });
  }

  const duplicatePhones = new Set<string>();
  if (validPhones.length > 0) {
    const { data: existingRows, error: existingError } = await admin
      .from("quote_referrals")
      .select("referred_phone")
      .eq("application_id", applicationId)
      .in("referred_phone", phoneLookupValues(validPhones));

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 502 });
    }

    for (const existing of Array.isArray(existingRows) ? existingRows : []) {
      const normalized = normalizeKoreanMobileDigits(
        (existing as { referred_phone?: unknown }).referred_phone,
      );
      if (normalized) duplicatePhones.add(normalized);
    }
  }

  for (const phone of validPhones) {
    if (duplicatePhones.has(phone)) {
      results.push({ phone, status: "skipped_duplicate" });
    }
  }

  const phonesToSend = validPhones.filter((phone) => !duplicatePhones.has(phone));
  if (phonesToSend.length > 0) {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setDate(dayStart.getDate() + 1);
    const expiresStart = new Date(dayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiresEnd = new Date(nextDayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { count, error: countError } = await admin
      .from("quote_referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_partner_driver_id", driver.partnerDriverId)
      .gte("expires_at", expiresStart.toISOString())
      .lt("expires_at", expiresEnd.toISOString());

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 502 });
    }
    if ((count ?? 0) + phonesToSend.length > 100) {
      return NextResponse.json(
        { error: "오늘 발송 가능 횟수를 초과했습니다." },
        { status: 429 },
      );
    }
  }

  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim();
  if (phonesToSend.length > 0 && (!apiKey || !apiSecret || !from)) {
    return NextResponse.json(
      {
        error:
          "솔라피 환경변수(SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.",
      },
      { status: 503 },
    );
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const rowsToInsert = phonesToSend.map((phone) => ({
    application_id: applicationId,
    referrer_partner_driver_id: driver.partnerDriverId,
    referred_phone: phone,
    token: randomUUID(),
    status: "sent",
    expires_at: expiresAt,
  }));

  const { data: insertedRows, error: insertError } =
    rowsToInsert.length > 0
      ? await admin
          .from("quote_referrals")
          .insert(rowsToInsert)
          .select("referred_phone, token")
      : { data: [], error: null };

  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      return NextResponse.json(
        { error: "일부 번호는 이미 이 콜을 전달받았습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  const baseUrl = siteBaseUrl();
  const dateTime = [safeText(activeApp.departure_date, "미정"), safeText(activeApp.departure_time, "")]
    .filter(Boolean)
    .join(" ");
  const passengerCount = parseInteger(activeApp.passenger_count);
  const stopoverText = formatStopovers(activeApp.stopovers);
  const insertedByPhone = new Map<string, string>();
  for (const inserted of Array.isArray(insertedRows) ? insertedRows : []) {
    const row = inserted as { referred_phone?: unknown; token?: unknown };
    const phone = normalizeKoreanMobileDigits(row.referred_phone);
    const token = safeText(row.token);
    if (phone && token) insertedByPhone.set(phone, token);
  }

  const solapi =
    phonesToSend.length > 0 && apiKey && apiSecret
      ? new SolapiMessageService(apiKey, apiSecret)
      : null;
  for (const phone of phonesToSend) {
    const token = insertedByPhone.get(phone);
    if (!token) {
      results.push({ phone, status: "send_failed", error: "추천 토큰 생성 실패" });
      continue;
    }
    const text = `[무료관광버스]
전세버스 견적요청이 전달되었습니다.

출발: ${safeText(activeApp.departure, "미정")}
${stopoverText ? `경유: ${stopoverText}\n` : ""}도착: ${safeText(activeApp.destination, "미정")}
일시: ${dateTime || "미정"}
인원: ${passengerCount == null ? "미정" : passengerCount}

견적 확인:
${baseUrl}/shared-quote/${token}

제휴기사 등록:
${baseUrl}/partner/register?ref=${token}`;

    try {
      await solapi?.send([{ to: phone, from: from ?? "", text }]);
      results.push({ phone, status: "sent" });
    } catch (e) {
      console.error("[quote-referrals] Solapi send failed:", e);
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "toString" in e
            ? String(e)
            : "문자 발송에 실패했습니다.";
      results.push({ phone, status: "send_failed", error: msg });
    }
  }

  const successCount = results.filter((r) => r.status === "sent").length;
  const skippedCount = results.filter((r) => r.status === "skipped_duplicate").length;
  const failCount = results.filter(
    (r) => r.status === "invalid_phone" || r.status === "send_failed",
  ).length;

  return NextResponse.json({
    ok: true,
    success_count: successCount,
    fail_count: failCount,
    skipped_count: skippedCount,
    results,
  });
}
