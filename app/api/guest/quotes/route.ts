import { NextResponse } from "next/server";

import {
  isApplicationQuoteAccepting,
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import { SERVICE_REGIONS, normalizeRegion } from "@/lib/regions";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type Body = {
  application_id?: unknown;
  referral_token?: unknown;
  guest_company_name?: unknown;
  guest_driver_name?: unknown;
  guest_phone?: unknown;
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

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const digits = value.replace(/[^\d]/g, "");
    if (digits !== "") {
      const n = Number.parseInt(digits, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function normalizeKoreanMobileDigits(value: unknown): string | null {
  const digits = safeText(value).replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

function clipRequestMessage(value: unknown): string {
  const text = safeText(value, "");
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

export async function GET(request: Request) {
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const region = normalizeRegion(searchParams.get("region"));

  let query = admin
    .from("applications")
    .select(
      "id, created_at, receipt_number, application_type, trip_type, bus_grade, departure_region, departure, destination, departure_date, departure_time, passenger_count, request_message, quote_status, quote_closed_at",
    )
    .eq("application_type", APPLICATION_TYPE_NEW_BOOKING)
    .order("created_at", { ascending: false })
    .limit(80);

  if (region) query = query.eq("departure_region", region);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  const quotes = (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>;
    if (!isApplicationQuoteAccepting(row)) return null;
    return {
      id: safeText(row.id),
      created_at: safeText(row.created_at),
      receipt_number: safeText(row.receipt_number),
      departure_region: safeText(row.departure_region),
      departure: safeText(row.departure),
      destination: safeText(row.destination),
      departure_date: safeText(row.departure_date),
      departure_time: safeText(row.departure_time),
      passenger_count: parseInteger(row.passenger_count),
      trip_type: safeText(row.trip_type),
      bus_grade: safeText(row.bus_grade),
      request_message: clipRequestMessage(row.request_message),
    };
  }).filter((quote): quote is NonNullable<typeof quote> => quote != null);

  return NextResponse.json({ ok: true, regions: SERVICE_REGIONS, quotes });
}

export async function POST(request: Request) {
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
  const referralToken = safeText(body.referral_token);
  const guestCompanyName = safeText(body.guest_company_name);
  const guestDriverName = safeText(body.guest_driver_name);
  const guestPhone = normalizeKoreanMobileDigits(body.guest_phone);
  const price = parseInteger(body.price);
  const vehicleType = safeText(body.vehicle_type);
  const availableTime = safeText(body.available_time);
  const message = safeText(body.message);

  if (applicationId === "") {
    return NextResponse.json(
      { error: "견적요청을 확인할 수 없습니다." },
      { status: 400 },
    );
  }
  if (guestCompanyName === "" && guestDriverName === "") {
    return NextResponse.json(
      { error: "업체명 또는 기사명을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (guestPhone == null) {
    return NextResponse.json(
      { error: "휴대폰번호를 확인해 주세요." },
      { status: 400 },
    );
  }
  if (price == null || price <= 0) {
    return NextResponse.json(
      { error: "견적금액을 올바르게 입력해 주세요." },
      { status: 400 },
    );
  }
  if (vehicleType === "" || availableTime === "") {
    return NextResponse.json(
      { error: "차량유형과 가능 출발시간을 입력해 주세요." },
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
    .select(`application_type, ${quoteLifecycleSelectColumns()}`)
    .eq("id", applicationId)
    .maybeSingle();
  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 502 });
  }
  if (
    !application ||
    safeText((application as { application_type?: unknown }).application_type) !==
      APPLICATION_TYPE_NEW_BOOKING
  ) {
    return NextResponse.json(
      { error: "견적 제출 대상 신청이 아닙니다." },
      { status: 400 },
    );
  }
  await processApplicationQuoteLifecycle(admin, applicationId);
  const { data: latestApplication, error: latestApplicationError } = await admin
    .from("applications")
    .select(`application_type, ${quoteLifecycleSelectColumns()}`)
    .eq("id", applicationId)
    .maybeSingle();
  if (latestApplicationError) {
    return NextResponse.json({ error: latestApplicationError.message }, { status: 502 });
  }
  const activeApplication =
    (latestApplication as unknown as Record<string, unknown> | null) ??
    (application as unknown as Record<string, unknown>);
  if (!isApplicationQuoteAccepting(activeApplication)) {
    return NextResponse.json(
      { error: "견적이 마감되어 새 견적을 제출할 수 없습니다." },
      { status: 409 },
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("guest_driver_quotes")
    .select("id")
    .eq("application_id", applicationId)
    .eq("guest_phone", guestPhone)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }
  if (existing) {
    return NextResponse.json(
      { error: "이미 이 견적요청에 견적서를 제출했습니다." },
      { status: 409 },
    );
  }

  let quoteReferralId: string | null = null;
  if (referralToken !== "") {
    const { data: referral } = await admin
      .from("quote_referrals")
      .select("id")
      .eq("token", referralToken)
      .maybeSingle();
    quoteReferralId = safeText((referral as { id?: unknown } | null)?.id) || null;
  }

  const { data: inserted, error: insertError } = await admin
    .from("guest_driver_quotes")
    .insert({
      application_id: applicationId,
      quote_referral_id: quoteReferralId,
      referral_token: referralToken || null,
      guest_company_name: guestCompanyName,
      guest_driver_name: guestDriverName,
      guest_phone: guestPhone,
      price,
      vehicle_type: vehicleType,
      available_time: availableTime,
      message,
      status: "submitted",
      match_result: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      return NextResponse.json(
        { error: "이미 이 견적요청에 견적서를 제출했습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  await processApplicationQuoteLifecycle(admin, applicationId);

  return NextResponse.json({
    ok: true,
    quote: inserted,
    invite_url: `/partner/register?invitePhone=${guestPhone}`,
  });
}
