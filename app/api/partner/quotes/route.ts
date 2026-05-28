import { NextResponse } from "next/server";

import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import {
  isApplicationQuoteAccepting,
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import { USER_ROLES } from "@/lib/roles";
import {
  buildConfirmedDbPayload,
  buildPlannedDbPayload,
  computeConfirmedFromPlanned,
} from "@/lib/quote-support-snapshot";
import {
  DRIVER_QUOTE_MINIMAL_SELECT,
  DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN,
} from "@/lib/driver-quote-select";
import {
  freezeQuotePlannedSupportBreakdown,
  refreshQuoteSnapshotsAfterSponsorConfirm,
} from "@/lib/support-breakdown-snapshot";
import { resolveSettlementType } from "@/lib/support-calculation";
import type { SponsorRuleRecord } from "@/lib/sponsor-rule-helpers";
import { getApprovedSponsorSupport, supportPlannedLimitForQuote } from "@/lib/sponsor-support";
import { estimateSponsorSupport } from "@/lib/support-estimate";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { isApplicationHidden } from "@/lib/application-visibility";
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
  if (isApplicationHidden(application as unknown as Record<string, unknown>)) {
    return NextResponse.json(
      { error: "견적 제출 대상 신청이 아닙니다." },
      { status: 404 },
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
  const totalPlannedSupport = supportPlannedLimitForQuote({
    preapprovedSupportAmountTotal: sponsorSummary.preapproved_support_amount_total,
    estimatedSupportAmount: supportEstimate.estimated_support_amount,
  });
  const supportInputLimit = Math.min(totalPlannedSupport, price);
  const customerPlannedSupport =
    requestedSupportDiscountAmount ?? supportInputLimit;
  if (customerPlannedSupport < 0 || customerPlannedSupport > supportInputLimit) {
    return NextResponse.json(
      { error: "고객 예정 지원금은 총 예정 지원금과 일반견적가를 초과할 수 없습니다." },
      { status: 400 },
    );
  }
  const partnerPlannedSupport = Math.max(totalPlannedSupport - customerPlannedSupport, 0);
  const plannedDiscountPrice = Math.max(0, price - customerPlannedSupport);
  const plannedSnapshot = {
    total: totalPlannedSupport,
    customer: customerPlannedSupport,
    driver: partnerPlannedSupport,
    discountPrice: plannedDiscountPrice,
    finalPrice: plannedDiscountPrice,
  };
  const confirmedTotal = Math.max(0, sponsorSummary.approved_support_amount_total);
  const sponsorSupportStatus =
    sponsorSummary.status === "none" && totalPlannedSupport > 0
      ? "preapproved"
      : sponsorSummary.status;
  const extensionRound = parsePrice(activeApplication.extension_round) ?? 0;
  const confirmedPayload =
    confirmedTotal > 0
      ? (() => {
          const computed = computeConfirmedFromPlanned({
            normalPrice: price,
            settlementType: resolveSettlementType(supportSettlementType),
            planned: plannedSnapshot,
            confirmedTotal,
            extensionApplied: extensionRound > 0,
          });
          return "error" in computed ? null : buildConfirmedDbPayload(computed);
        })()
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
    support_settlement_type: supportSettlementType,
    is_member_quote: true,
    converted_from_guest_quote_id: convertingGuestQuoteId,
    sponsor_support_status: sponsorSupportStatus,
    sponsor_approved_support_amount: sponsorSummary.approved_support_amount_total,
    sponsor_quote_enabled: true,
    ...buildPlannedDbPayload(plannedSnapshot),
    ...(confirmedPayload ?? {}),
  };

  const insertResult = await admin
    .from("driver_quotes")
    .insert(insertPayload)
    .select(DRIVER_QUOTE_MINIMAL_SELECT)
    .single();
  let inserted: unknown = insertResult.data;
  let insertError = insertResult.error;

  if (
    insertError &&
    /support_settlement_type|preapproved_support_amount|approved_support_amount|final_member_price|final_customer_support_amount|final_driver_support_amount|support_recalculated_at|does not exist|42703/i.test(
      insertError.message,
    )
  ) {
    const legacyPayload = {
      application_id: applicationId,
      partner_driver_id: driver.partnerDriverId,
      auth_user_id: driver.userId,
      price,
      vehicle_type: vehicleType,
      available_time: availableTime,
      message,
      status: "submitted",
      estimated_support_amount: totalPlannedSupport,
      support_discount_amount: customerPlannedSupport,
      customer_support_amount: customerPlannedSupport,
      member_price: plannedDiscountPrice,
      is_member_quote: true,
      converted_from_guest_quote_id: convertingGuestQuoteId,
      sponsor_support_amount: totalPlannedSupport,
      sponsor_support_status: sponsorSupportStatus,
      sponsor_approved_support_amount: sponsorSummary.approved_support_amount_total,
      sponsor_discounted_price: plannedDiscountPrice,
      sponsor_quote_enabled: true,
      driver_support_amount: partnerPlannedSupport,
    };
    const legacy = await admin
      .from("driver_quotes")
      .insert(legacyPayload)
      .select(DRIVER_QUOTE_MINIMAL_SELECT_NO_BREAKDOWN)
      .single();
    inserted = legacy.data;
    insertError = legacy.error;
  }

  if (
    insertError &&
    /estimated_support_amount|support_discount_amount|customer_support_amount|member_price|is_member_quote|converted_from_guest_quote_id|sponsor_support_amount|sponsor_support_status|sponsor_approved_support_amount|sponsor_discounted_price|sponsor_quote_enabled|driver_support_amount|client_reward_amount|does not exist|42703/i.test(
      insertError.message,
    )
  ) {
    const minimalSupportPayload = {
      application_id: applicationId,
      partner_driver_id: driver.partnerDriverId,
      auth_user_id: driver.userId,
      price,
      vehicle_type: vehicleType,
      available_time: availableTime,
      message,
      status: "submitted",
      support_discount_amount: customerPlannedSupport,
      customer_support_amount: customerPlannedSupport,
      member_price: plannedDiscountPrice,
      sponsor_discounted_price: plannedDiscountPrice,
    };
    const minimalSupport = await admin
      .from("driver_quotes")
      .insert(minimalSupportPayload)
      .select("id, price, support_discount_amount, customer_support_amount, member_price, sponsor_discounted_price")
      .single();
    inserted = minimalSupport.data;
    insertError = minimalSupport.error;
  }

  if (
    insertError &&
    /support_discount_amount|customer_support_amount|member_price|sponsor_discounted_price|does not exist|42703/i.test(
      insertError.message,
    )
  ) {
    const memberPriceOnlyPayload = {
      application_id: applicationId,
      partner_driver_id: driver.partnerDriverId,
      auth_user_id: driver.userId,
      price,
      vehicle_type: vehicleType,
      available_time: availableTime,
      message,
      status: "submitted",
      member_price: plannedDiscountPrice,
    };
    const memberPriceOnly = await admin
      .from("driver_quotes")
      .insert(memberPriceOnlyPayload)
      .select("id, price, member_price")
      .single();
    inserted = memberPriceOnly.data;
    insertError = memberPriceOnly.error;
  }

  if (
    insertError &&
    /member_price|does not exist|42703/i.test(
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

  if (insertedId !== "") {
    const { data: topPre } = await admin
      .from("sponsor_preapprovals")
      .select("sponsor_rule_id")
      .eq("application_id", applicationId)
      .order("estimated_support_amount", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ruleId = safeText((topPre as Record<string, unknown> | null)?.sponsor_rule_id);
    let rule: SponsorRuleRecord | null = null;
    if (ruleId) {
      const { data: ruleRow } = await admin
        .from("sponsor_rules")
        .select("*")
        .eq("id", ruleId)
        .maybeSingle();
      rule = ruleRow ? (ruleRow as SponsorRuleRecord) : null;
    }
    const { data: appExt } = await admin
      .from("applications")
      .select("extension_round")
      .eq("id", applicationId)
      .maybeSingle();
    await freezeQuotePlannedSupportBreakdown(admin, insertedId, {
      rule,
      normalPrice: price,
      planned: plannedSnapshot,
      supportMode: resolveSettlementType(supportSettlementType),
      extensionRound:
        parsePrice((appExt as Record<string, unknown> | null)?.extension_round) ?? 0,
    });
  }

  await processApplicationQuoteLifecycle(admin, applicationId);

  return NextResponse.json({ ok: true, quote: inserted });
}

export async function PATCH(request: Request) {
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
  const requestedSupportDiscountAmount = parsePrice(body.support_discount_amount);
  const supportSettlementType =
    safeText(body.support_settlement_type) === "ratio" ? "ratio" : "client_priority";
  const vehicleType = safeText(body.vehicle_type);
  const availableTime = safeText(body.available_time);
  const message = safeText(body.message);

  if (applicationId === "" || price == null || price <= 0) {
    return NextResponse.json({ error: "견적 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (vehicleType === "" || availableTime === "") {
    return NextResponse.json({ error: "차량유형과 가능 출발시간을 입력해 주세요." }, { status: 400 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const memberOrFilter = `partner_driver_id.eq.${driver.partnerDriverId},auth_user_id.eq.${driver.userId}`;
  const { data: existing, error: existingError } = await admin
    .from("driver_quotes")
    .select("id")
    .eq("application_id", applicationId)
    .or(memberOrFilter)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 502 });
  }
  if (!existing) {
    return NextResponse.json({ error: "수정할 견적을 찾을 수 없습니다." }, { status: 404 });
  }

  const quoteId = safeText((existing as { id?: unknown }).id);
  await processApplicationQuoteLifecycle(admin, applicationId);
  const { data: application } = await admin
    .from("applications")
    .select(`application_type, passenger_count, ${quoteLifecycleSelectColumns()}`)
    .eq("id", applicationId)
    .maybeSingle();

  const appType = safeText(
    (application as { application_type?: unknown } | null)?.application_type,
  );
  if (!application || appType !== APPLICATION_TYPE_NEW_BOOKING) {
    return NextResponse.json({ error: "견적 수정 대상이 아닙니다." }, { status: 400 });
  }
  if (
    !isApplicationQuoteAccepting(
      application as unknown as Record<string, unknown>,
    )
  ) {
    return NextResponse.json(
      { error: "견적이 마감되어 수정할 수 없습니다." },
      { status: 409 },
    );
  }

  const supportEstimate = estimateSponsorSupport({
    passengerCount: (application as { passenger_count?: unknown }).passenger_count,
    price,
  });
  const sponsorSummary = await getApprovedSponsorSupport(admin, applicationId);
  const totalPlannedSupport = supportPlannedLimitForQuote({
    preapprovedSupportAmountTotal: sponsorSummary.preapproved_support_amount_total,
    estimatedSupportAmount: supportEstimate.estimated_support_amount,
  });
  const supportInputLimit = Math.min(totalPlannedSupport, price);
  const customerPlannedSupport =
    requestedSupportDiscountAmount ?? supportInputLimit;
  if (customerPlannedSupport < 0 || customerPlannedSupport > supportInputLimit) {
    return NextResponse.json(
      { error: "고객 예정 지원금은 총 예정 지원금과 일반견적가를 초과할 수 없습니다." },
      { status: 400 },
    );
  }
  const partnerPlannedSupport = Math.max(totalPlannedSupport - customerPlannedSupport, 0);
  const plannedDiscountPrice = Math.max(0, price - customerPlannedSupport);
  const plannedSnapshot = {
    total: totalPlannedSupport,
    customer: customerPlannedSupport,
    driver: partnerPlannedSupport,
    discountPrice: plannedDiscountPrice,
    finalPrice: plannedDiscountPrice,
  };
  const confirmedTotal = Math.max(0, sponsorSummary.approved_support_amount_total);
  const sponsorSupportStatus =
    sponsorSummary.status === "none" && totalPlannedSupport > 0
      ? "preapproved"
      : sponsorSummary.status;
  const patchExtensionRound =
    parsePrice(
      (application as unknown as Record<string, unknown> | null)?.extension_round,
    ) ?? 0;
  const confirmedPayload =
    confirmedTotal > 0
      ? (() => {
          const computed = computeConfirmedFromPlanned({
            normalPrice: price,
            settlementType: resolveSettlementType(supportSettlementType),
            planned: plannedSnapshot,
            confirmedTotal,
            extensionApplied: patchExtensionRound > 0,
          });
          return "error" in computed ? null : buildConfirmedDbPayload(computed);
        })()
      : null;

  const updatePayload: Record<string, unknown> = {
    price,
    vehicle_type: vehicleType,
    available_time: availableTime,
    message,
    support_settlement_type: supportSettlementType,
    sponsor_support_status: sponsorSupportStatus,
    sponsor_approved_support_amount: sponsorSummary.approved_support_amount_total,
    sponsor_quote_enabled: true,
    ...buildPlannedDbPayload(plannedSnapshot),
    ...(confirmedPayload ?? {}),
  };

  let { data: updated, error: updateError } = await admin
    .from("driver_quotes")
    .update(updatePayload)
    .eq("id", quoteId)
    .select("id, price")
    .single();

  // 존재하지 않는 컬럼이 포함된 경우 해당 컬럼 제거 후 재시도
  if (
    updateError &&
    /does not exist|column .* does not exist|schema cache|42703/i.test(updateError.message)
  ) {
    const OPTIONAL_PATCH_COLUMNS = [
      "sponsor_approved_support_amount",
      "sponsor_support_status",
      "sponsor_quote_enabled",
      "support_settlement_type",
      "planned_total_support",
      "planned_customer_support",
      "planned_driver_support",
      "planned_discount_price",
      "planned_final_price",
      "preapproved_support_amount",
      "confirmed_total_support",
      "confirmed_customer_support",
      "confirmed_driver_support",
      "confirmed_discount_price",
      "confirmed_final_price",
      "approved_support_amount",
      "final_customer_support_amount",
      "final_driver_support_amount",
      "final_member_price",
      "extension_support_amount",
      "support_recalculated_at",
    ];
    const fallbackPayload: Record<string, unknown> = { ...updatePayload };
    // 에러 메시지에서 문제 컬럼명을 추출해 제거, 안 되면 선택적 컬럼 전체 제거
    const colMatch = /column ['"]?(\w+)['"]? (does not exist|of ')/i.exec(updateError.message);
    if (colMatch?.[1]) {
      delete fallbackPayload[colMatch[1]];
    } else {
      for (const col of OPTIONAL_PATCH_COLUMNS) {
        delete fallbackPayload[col];
      }
    }
    const retry = await admin
      .from("driver_quotes")
      .update(fallbackPayload)
      .eq("id", quoteId)
      .select("id, price")
      .single();
    updated = retry.data;
    updateError = retry.error;
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 502 });
  }

  // support_breakdown JSONB를 갱신해 loadCalls() 후 화면에 반영
  await freezeQuotePlannedSupportBreakdown(admin, quoteId, {
    rule: null,
    normalPrice: price,
    planned: plannedSnapshot,
    supportMode: resolveSettlementType(supportSettlementType),
    extensionRound: patchExtensionRound,
  });
  if (confirmedTotal > 0) {
    await refreshQuoteSnapshotsAfterSponsorConfirm(admin, applicationId);
  }

  await processApplicationQuoteLifecycle(admin, applicationId);
  return NextResponse.json({ ok: true, quote: updated, updated: true });
}
