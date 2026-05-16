import { NextResponse } from "next/server";

import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import { calculateSupportSettlement } from "@/lib/driver-quote-support";
import {
  isApplicationQuoteAccepting,
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import { USER_ROLES } from "@/lib/roles";
import { getApprovedSponsorSupport, supportLimitForQuote } from "@/lib/sponsor-support";
import { estimateSponsorSupport } from "@/lib/support-estimate";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

type Body = {
  application_id?: unknown;
  price?: unknown;
  sponsor_discounted_price?: unknown;
  support_discount_amount?: unknown;
  support_settlement_type?: unknown;
  vehicle_type?: unknown;
  available_time?: unknown;
  message?: unknown;
};

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function hyphenKoreanMobile(digits: string): string {
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
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
  | { ok: true; userId: string; partnerDriverId: string; phoneDigits: string }
  | { ok: false; status: number; error: string }
> {
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
    .select("id, status, phone")
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

  const phoneDigits =
    digitsOnlyKoreanMobile(
      safeText((driver as { phone?: unknown } | null)?.phone, ""),
    ) ?? "";

  return { ok: true, userId: user.id, partnerDriverId, phoneDigits };
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
  const requestedDiscountedPrice = parsePrice(body.sponsor_discounted_price);
  const requestedSupportDiscountAmount = parsePrice(body.support_discount_amount);
  const supportSettlementType =
    safeText(body.support_settlement_type) === "ratio" ? "ratio" : "client_priority";
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
    .select(`application_type, passenger_count, ${quoteLifecycleSelectColumns()}`)
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
  await processApplicationQuoteLifecycle(admin, applicationId);
  const { data: latestApplication, error: latestApplicationError } = await admin
    .from("applications")
    .select(`application_type, passenger_count, ${quoteLifecycleSelectColumns()}`)
    .eq("id", applicationId)
    .maybeSingle();
  if (latestApplicationError) {
    return NextResponse.json(
      { error: latestApplicationError.message },
      { status: 502 },
    );
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
  const supportEstimate = estimateSponsorSupport({
    passengerCount: activeApplication.passenger_count,
    price,
  });
  const sponsorSummary = await getApprovedSponsorSupport(admin, applicationId);
  const supportLimit = supportLimitForQuote({
    approvedSupportAmountTotal: sponsorSummary.approved_support_amount_total,
    estimatedSupportAmount: supportEstimate.estimated_support_amount,
  });
  const supportDiscountAmount =
    requestedSupportDiscountAmount ?? supportLimit;
  if (supportDiscountAmount > supportLimit) {
    return NextResponse.json(
      { error: "고객에게 반영할 지원금은 적용 가능한 지원금 한도보다 클 수 없습니다." },
      { status: 400 },
    );
  }
  const memberPrice = Math.max(0, price - supportDiscountAmount);
  const preapprovedSupportAmount = supportLimit;
  const approvedSupportAmount = Math.max(0, sponsorSummary.approved_support_amount_total);
  const driverSupportAmount = Math.max(
    preapprovedSupportAmount - supportDiscountAmount,
    0,
  );
  const finalSettlement =
    approvedSupportAmount > 0
      ? calculateSupportSettlement({
          price,
          supportSettlementType,
          preapprovedSupportAmount,
          approvedSupportAmount,
          customerSupportAmount: supportDiscountAmount,
          driverSupportAmount,
          fallbackMemberPrice: memberPrice,
        })
      : null;
  if (requestedDiscountedPrice != null && requestedDiscountedPrice > price) {
    return NextResponse.json(
      { error: "지원금 적용가는 일반 견적가보다 높을 수 없습니다." },
      { status: 400 },
    );
  }

  const memberOrFilter = `partner_driver_id.eq.${driver.partnerDriverId},auth_user_id.eq.${driver.userId}`;
  const { data: existingMember, error: existingMemberError } = await admin
    .from("driver_quotes")
    .select(
      "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status",
    )
    .eq("application_id", applicationId)
    .or(memberOrFilter)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingMemberError) {
    return NextResponse.json(
      { error: existingMemberError.message },
      { status: 502 },
    );
  }
  if (existingMember) {
    const row = existingMember as Record<string, unknown>;
    return NextResponse.json(
      {
        error: "already_quoted",
        quote_type: "member" as const,
        quote: {
          id: safeText(row.id),
          created_at: safeText(row.created_at),
          application_id: safeText(row.application_id),
          price: parsePrice(row.price),
          vehicle_type: safeText(row.vehicle_type, "—"),
          available_time: safeText(row.available_time, "—"),
          message: safeText(row.message),
          status: safeText(row.status, "submitted"),
        },
      },
      { status: 409 },
    );
  }

  let convertingGuestQuoteId: string | null = null;
  if (driver.phoneDigits !== "") {
    const guestPhones = [
      driver.phoneDigits,
      hyphenKoreanMobile(driver.phoneDigits),
    ];
    const { data: existingGuest, error: existingGuestError } = await admin
      .from("guest_driver_quotes")
      .select(
        "id, created_at, application_id, guest_phone, price, vehicle_type, available_time, message, status, match_result, converted_to_member_quote_id",
      )
      .eq("application_id", applicationId)
      .in("guest_phone", guestPhones)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingGuestError) {
      return NextResponse.json(
        { error: existingGuestError.message },
        { status: 502 },
      );
    }
    if (existingGuest) {
      const row = existingGuest as Record<string, unknown>;
      const convertedMemberQuoteId = safeText(row.converted_to_member_quote_id);
      if (convertedMemberQuoteId !== "") {
        return NextResponse.json(
          {
            error: "already_quoted",
            quote_type: "guest" as const,
            guest_quote_exists: true,
            can_submit_member_quote: false,
            member_quote_exists: true,
            quote: {
              id: safeText(row.id),
              created_at: safeText(row.created_at),
              application_id: safeText(row.application_id),
              guest_phone: safeText(row.guest_phone),
              price: parsePrice(row.price),
              vehicle_type: safeText(row.vehicle_type, "—"),
              available_time: safeText(row.available_time, "—"),
              message: safeText(row.message),
              status: safeText(row.status, "submitted"),
              match_result: safeText(row.match_result, "pending"),
            },
          },
          { status: 409 },
        );
      }
      convertingGuestQuoteId = safeText(row.id) || null;
    }
  }

  const insertPayload = {
    application_id: applicationId,
    partner_driver_id: driver.partnerDriverId,
    auth_user_id: driver.userId,
    price,
    vehicle_type: vehicleType,
    available_time: availableTime,
    message,
    status: "submitted",
    estimated_support_amount: supportLimit,
    support_settlement_type: supportSettlementType,
    preapproved_support_amount: preapprovedSupportAmount,
    approved_support_amount: approvedSupportAmount,
    support_discount_amount: supportDiscountAmount,
    customer_support_amount: supportDiscountAmount,
    member_price: memberPrice,
    is_member_quote: true,
    converted_from_guest_quote_id: convertingGuestQuoteId,
    sponsor_support_amount: supportDiscountAmount,
    sponsor_support_status: sponsorSummary.status,
    sponsor_approved_support_amount: sponsorSummary.approved_support_amount_total,
    sponsor_discounted_price: memberPrice,
    sponsor_quote_enabled: true,
    driver_support_amount: driverSupportAmount,
    final_customer_support_amount: finalSettlement?.finalCustomerSupportAmount ?? 0,
    final_driver_support_amount: finalSettlement?.finalDriverSupportAmount ?? 0,
    final_member_price: finalSettlement?.finalMemberPrice ?? null,
    support_recalculated_at: finalSettlement ? new Date().toISOString() : null,
    client_reward_amount: supportDiscountAmount,
  };

  const insertResult = await admin
    .from("driver_quotes")
    .insert(insertPayload)
    .select(
      "id, price, estimated_support_amount, support_settlement_type, preapproved_support_amount, approved_support_amount, support_discount_amount, customer_support_amount, driver_support_amount, final_customer_support_amount, final_driver_support_amount, member_price, final_member_price, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_support_status, sponsor_approved_support_amount, sponsor_discounted_price, sponsor_quote_enabled",
    )
    .single();
  let inserted: unknown = insertResult.data;
  let insertError = insertResult.error;

  if (
    insertError &&
    /estimated_support_amount|support_settlement_type|preapproved_support_amount|approved_support_amount|support_discount_amount|customer_support_amount|member_price|final_member_price|is_member_quote|converted_from_guest_quote_id|sponsor_support_amount|sponsor_support_status|sponsor_approved_support_amount|sponsor_discounted_price|sponsor_quote_enabled|driver_support_amount|final_customer_support_amount|final_driver_support_amount|client_reward_amount|does not exist|42703/i.test(
      insertError.message,
    )
  ) {
    const fallbackPayload = {
      application_id: applicationId,
      partner_driver_id: driver.partnerDriverId,
      auth_user_id: driver.userId,
      price,
      vehicle_type: vehicleType,
      available_time: availableTime,
      message,
      status: "submitted",
    };
    const fallback = await admin
      .from("driver_quotes")
      .insert(fallbackPayload)
      .select("id, price")
      .single();
    inserted = fallback.data;
    insertError = fallback.error;
  }

  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) {
      const { data: mem } = await admin
        .from("driver_quotes")
        .select(
          "id, created_at, application_id, price, vehicle_type, available_time, message, status",
        )
        .eq("application_id", applicationId)
        .or(memberOrFilter)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mem) {
        const row = mem as Record<string, unknown>;
        return NextResponse.json(
          {
            error: "already_quoted",
            quote_type: "member" as const,
            quote: {
              id: safeText(row.id),
              created_at: safeText(row.created_at),
              application_id: safeText(row.application_id),
              price: parsePrice(row.price),
              vehicle_type: safeText(row.vehicle_type, "—"),
              available_time: safeText(row.available_time, "—"),
              message: safeText(row.message),
              status: safeText(row.status, "submitted"),
            },
          },
          { status: 409 },
        );
      }
      if (driver.phoneDigits !== "") {
        const guestPhones = [
          driver.phoneDigits,
          hyphenKoreanMobile(driver.phoneDigits),
        ];
        const { data: g } = await admin
          .from("guest_driver_quotes")
          .select(
            "id, created_at, application_id, guest_phone, price, vehicle_type, available_time, message, status, match_result",
          )
          .eq("application_id", applicationId)
          .in("guest_phone", guestPhones)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (g) {
          const row = g as Record<string, unknown>;
          return NextResponse.json(
            {
              error: "already_quoted",
              quote_type: "guest" as const,
              quote: {
                id: safeText(row.id),
                created_at: safeText(row.created_at),
                application_id: safeText(row.application_id),
                guest_phone: safeText(row.guest_phone),
                price: parsePrice(row.price),
                vehicle_type: safeText(row.vehicle_type, "—"),
                available_time: safeText(row.available_time, "—"),
                message: safeText(row.message),
                status: safeText(row.status, "submitted"),
                match_result: safeText(row.match_result, "pending"),
              },
            },
            { status: 409 },
          );
        }
      }
      return NextResponse.json(
        { error: "이미 이 견적요청에 견적서를 제출했습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 502 });
  }

  const insertedId = safeText((inserted as { id?: unknown } | null)?.id);
  if (convertingGuestQuoteId != null && insertedId !== "") {
    const { error: convertError } = await admin
      .from("guest_driver_quotes")
      .update({
        converted_to_member_quote_id: insertedId,
        converted_at: new Date().toISOString(),
        match_result: "converted_to_member_quote",
      })
      .eq("id", convertingGuestQuoteId);
    if (
      convertError &&
      !/converted_to_member_quote_id|converted_at|does not exist|42703/i.test(
        convertError.message,
      )
    ) {
      return NextResponse.json(
        {
          error: `회원 견적은 저장되었지만 비회원 견적 전환 상태 갱신에 실패했습니다: ${convertError.message}`,
        },
        { status: 502 },
      );
    }
  }

  await processApplicationQuoteLifecycle(admin, applicationId);

  return NextResponse.json({ ok: true, quote: inserted });
}
