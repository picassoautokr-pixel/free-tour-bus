import { NextResponse } from "next/server";

import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import { normalizeRegion, normalizeServiceRegions } from "@/lib/regions";
import { USER_ROLES } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

function hyphenKoreanMobile(digits: string): string {
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

type DriverContext =
  | {
      ok: true;
      userId: string;
      partnerDriverId: string;
      serviceRegions: string[];
      phoneDigits: string;
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
    .select("id, status, service_regions, phone")
    .eq("id", partnerDriverId)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (driverError) {
    return { ok: false, status: 502, error: driverError.message };
  }
  if (!driver || safeText((driver as { status?: unknown }).status, "").toLowerCase() !== "approved") {
    return { ok: false, status: 403, error: "관리자 승인 후 이용 가능합니다." };
  }

  const phoneDigits =
    digitsOnlyKoreanMobile(
      safeText((driver as { phone?: unknown } | null)?.phone, ""),
    ) ?? "";

  return {
    ok: true,
    userId: user.id,
    partnerDriverId,
    phoneDigits,
    serviceRegions: normalizeServiceRegions(
      (driver as { service_regions?: unknown } | null)?.service_regions,
    ),
  };
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
      "id, created_at, receipt_number, application_type, trip_type, bus_grade, departure, departure_region, destination, departure_date, departure_time, return_date, passenger_count, status",
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

  const rawRows = Array.isArray(applications) ? applications : [];
  const rows =
    driver.serviceRegions.length === 0
      ? rawRows
      : rawRows.filter((raw) => {
          const row = raw as Record<string, unknown>;
          const departureRegion = normalizeRegion(row.departure_region);
          return (
            departureRegion !== "" &&
            driver.serviceRegions.includes(departureRegion)
          );
        });
  const ids = rows
    .map((r) => safeText((r as { id?: unknown }).id, ""))
    .filter(Boolean);

  type MyQuotePayload = {
    source: "member" | "guest";
    id: string;
    price: number | null;
    vehicle_type: string;
    available_time: string;
    message: string;
    status: string;
    created_at: string;
    match_result?: string;
  };

  const quotedByApplication = new Map<string, MyQuotePayload>();
  if (ids.length > 0) {
    const orFilter = `partner_driver_id.eq.${driver.partnerDriverId},auth_user_id.eq.${driver.userId}`;
    const { data: memberQuotes, error: memberQuotesError } = await admin
      .from("driver_quotes")
      .select(
        "id, application_id, price, vehicle_type, available_time, message, status, created_at",
      )
      .in("application_id", ids)
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (memberQuotesError) {
      return NextResponse.json(
        { error: memberQuotesError.message },
        { status: 502 },
      );
    }

    const seenMemberApp = new Set<string>();
    for (const q of Array.isArray(memberQuotes) ? memberQuotes : []) {
      const row = q as Record<string, unknown>;
      const applicationId = safeText(row.application_id, "");
      if (applicationId === "" || seenMemberApp.has(applicationId)) continue;
      seenMemberApp.add(applicationId);
      quotedByApplication.set(applicationId, {
        source: "member",
        id: safeText(row.id, ""),
        price: parseInteger(row.price),
        vehicle_type: safeText(row.vehicle_type, "—"),
        available_time: safeText(row.available_time, "—"),
        message: safeText(row.message),
        status: safeText(row.status, "submitted"),
        created_at: safeText(row.created_at, ""),
      });
    }

    if (driver.phoneDigits !== "") {
      const guestPhones = [
        driver.phoneDigits,
        hyphenKoreanMobile(driver.phoneDigits),
      ];
      const { data: guestQuotes, error: guestQuotesError } = await admin
        .from("guest_driver_quotes")
        .select(
          "id, application_id, guest_phone, price, vehicle_type, available_time, message, status, match_result, created_at",
        )
        .in("application_id", ids)
        .in("guest_phone", guestPhones)
        .order("created_at", { ascending: false });

      if (guestQuotesError) {
        return NextResponse.json(
          { error: guestQuotesError.message },
          { status: 502 },
        );
      }

      const seenGuestApp = new Set<string>();
      for (const q of Array.isArray(guestQuotes) ? guestQuotes : []) {
        const row = q as Record<string, unknown>;
        const applicationId = safeText(row.application_id, "");
        if (applicationId === "" || seenGuestApp.has(applicationId)) continue;
        seenGuestApp.add(applicationId);
        if (quotedByApplication.has(applicationId)) continue;
        quotedByApplication.set(applicationId, {
          source: "guest",
          id: safeText(row.id, ""),
          price: parseInteger(row.price),
          vehicle_type: safeText(row.vehicle_type, "—"),
          available_time: safeText(row.available_time, "—"),
          message: safeText(row.message),
          status: safeText(row.status, "submitted"),
          created_at: safeText(row.created_at, ""),
          match_result: safeText(row.match_result, "pending"),
        });
      }

      const { error: linkErr } = await admin
        .from("guest_driver_quotes")
        .update({
          linked_partner_driver_id: driver.partnerDriverId,
          linked_auth_user_id: driver.userId,
        })
        .in("application_id", ids)
        .in("guest_phone", guestPhones)
        .is("linked_partner_driver_id", null);

      if (
        linkErr &&
        !/linked_partner_driver_id|linked_auth_user_id|does not exist|42703/i.test(
          linkErr.message,
        )
      ) {
        console.warn("[partner/calls] guest quote link update:", linkErr.message);
      }
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
      departure_region: safeText(row.departure_region, ""),
      destination: safeText(row.destination),
      departure_date: safeText(row.departure_date, ""),
      departure_time: safeText(row.departure_time),
      return_date: safeText(row.return_date, ""),
      passenger_count: parseInteger(row.passenger_count),
      my_quote: quote,
    };
  });

  return NextResponse.json({
    ok: true,
    calls,
    service_regions: driver.serviceRegions,
    service_regions_required: driver.serviceRegions.length === 0,
  });
}
