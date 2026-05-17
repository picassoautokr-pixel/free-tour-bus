import { NextResponse } from "next/server";

import { ensureContractNumber } from "@/lib/contract-deposit";
import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import { processApplicationQuoteLifecycle } from "@/lib/quote-auction";
import { getQuoteDisplayPrices } from "@/lib/quote-display-prices";
import { normalizeRegion, normalizeServiceRegions } from "@/lib/regions";
import { USER_ROLES } from "@/lib/roles";
import { parseStopovers } from "@/lib/stopovers";
import { estimateSponsorSupport } from "@/lib/support-estimate";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_TYPE_NEW_BOOKING = "신규로 예약이 필요하신 경우";

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  return error?.code === "42703" || /does not exist|column .* does not exist/i.test(error?.message ?? "");
}

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
      driverInfo: {
        company_name: string;
        manager_name: string;
        phone: string;
      };
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
  if (safeText(p?.role, "").toLowerCase() !== USER_ROLES.DRIVER) {
    return { ok: false, status: 403, error: "제휴기사 계정으로 로그인해주세요." };
  }

  const partnerDriverId = safeText(p?.partner_driver_id, "");
  if (partnerDriverId === "") {
    return {
      ok: false,
      status: 403,
      error: "연결된 제휴기사 신청을 찾을 수 없습니다.",
    };
  }

  let driverResult = await admin
    .from("partner_drivers")
    .select("id, status, service_regions, company_name, manager_name, phone")
    .eq("id", partnerDriverId)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (isMissingColumnError(driverResult.error)) {
    driverResult = await admin
      .from("partner_drivers")
      .select("id, status, company_name, manager_name, phone")
      .eq("id", partnerDriverId)
      .eq("auth_user_id", user.id)
      .maybeSingle();
  }
  const { data: driver, error: driverError } = driverResult;

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
    driverInfo: {
      company_name: safeText((driver as { company_name?: unknown } | null)?.company_name, ""),
      manager_name: safeText((driver as { manager_name?: unknown } | null)?.manager_name, ""),
      phone: safeText((driver as { phone?: unknown } | null)?.phone, ""),
    },
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

  let applicationsResult: {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("applications")
    .select(
      "id, created_at, receipt_number, applicant_name, phone, application_type, trip_type, bus_grade, departure, departure_region, destination, stopovers, departure_date, departure_time, return_date, passenger_count, request_message, status, quote_status, quote_deadline_at, quote_limit_count, target_normal_price, target_member_price, quote_closed_at, extension_round, support_client_reward_ratio, support_driver_ratio, auto_selected_quote_id, auto_selected_quote_source, final_selected_quote_id, final_selected_quote_source, auto_final_confirm_at, contact_revealed_at, contract_status, contract_started_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_number, contract_pdf_generated_at, contract_pdf_url",
    )
    .eq("application_type", APPLICATION_TYPE_NEW_BOOKING)
    .order("created_at", { ascending: false })
    .limit(50);
  if (isMissingColumnError(applicationsResult.error)) {
    applicationsResult = await admin
      .from("applications")
      .select(
        "id, created_at, receipt_number, applicant_name, phone, application_type, trip_type, bus_grade, departure, departure_region, destination, stopovers, departure_date, departure_time, return_date, passenger_count, request_message, status, quote_status, quote_deadline_at, quote_limit_count, target_normal_price, target_member_price, quote_closed_at, extension_round, support_client_reward_ratio, support_driver_ratio, auto_selected_quote_id, auto_selected_quote_source, final_selected_quote_id, final_selected_quote_source, auto_final_confirm_at, contact_revealed_at, contract_number",
      )
      .eq("application_type", APPLICATION_TYPE_NEW_BOOKING)
      .order("created_at", { ascending: false })
      .limit(50);
  }
  const { data: applications, error: applicationsError } = applicationsResult;

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

  await Promise.all(ids.map((id) => processApplicationQuoteLifecycle(admin, id)));

  type MyQuotePayload = {
    source: "member" | "guest";
    id: string;
    price: number | null;
    estimated_support_amount?: number | null;
    support_settlement_type?: string;
    preapproved_support_amount?: number | null;
    approved_support_amount?: number | null;
    support_discount_amount?: number | null;
    customer_support_amount?: number | null;
    member_price?: number | null;
    final_customer_support_amount?: number | null;
    final_driver_support_amount?: number | null;
    final_member_price?: number | null;
    support_recalculated_at?: string;
    is_member_quote?: boolean;
    converted_from_guest_quote_id?: string;
    sponsor_support_amount?: number | null;
    sponsor_support_status?: string;
    sponsor_approved_support_amount?: number | null;
    sponsor_discounted_price?: number | null;
    sponsor_quote_enabled?: boolean;
    driver_support_amount?: number | null;
    client_reward_amount?: number | null;
    vehicle_type: string;
    available_time: string;
    message: string;
    status: string;
    created_at: string;
    match_result?: string;
  };

  const quotedByApplication = new Map<string, MyQuotePayload>();
  const quoteCountByApplication = new Map<string, number>();
  const sponsorSupportByApplication = new Map<
    string,
    {
      status: string;
      approvedAmount: number;
      estimatedAmount: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
    }
  >();
  if (ids.length > 0) {
    const [{ data: memberCountRows }, { data: guestCountRows }, { data: sponsorRows }] = await Promise.all([
      admin.from("driver_quotes").select("application_id").in("application_id", ids),
      admin.from("guest_driver_quotes").select("application_id").in("application_id", ids),
      admin
        .from("sponsor_preapprovals")
        .select("application_id, status, approved_support_amount, estimated_support_amount")
        .in("application_id", ids),
    ]);
    for (const raw of Array.isArray(memberCountRows) ? memberCountRows : []) {
      const applicationId = safeText((raw as { application_id?: unknown }).application_id, "");
      quoteCountByApplication.set(
        applicationId,
        (quoteCountByApplication.get(applicationId) ?? 0) + 1,
      );
    }
    for (const raw of Array.isArray(guestCountRows) ? guestCountRows : []) {
      const applicationId = safeText((raw as { application_id?: unknown }).application_id, "");
      quoteCountByApplication.set(
        applicationId,
        (quoteCountByApplication.get(applicationId) ?? 0) + 1,
      );
    }
    for (const raw of Array.isArray(sponsorRows) ? sponsorRows : []) {
      const row = raw as Record<string, unknown>;
      const applicationId = safeText(row.application_id, "");
      if (!applicationId) continue;
      const current =
        sponsorSupportByApplication.get(applicationId) ?? {
          status: "none",
          approvedAmount: 0,
          estimatedAmount: 0,
          approvedCount: 0,
          pendingCount: 0,
          rejectedCount: 0,
        };
      const status = safeText(row.status, "preapproved");
      if (status === "approved") {
        current.approvedCount += 1;
        current.approvedAmount +=
          parseInteger(row.approved_support_amount) ??
          parseInteger(row.estimated_support_amount) ??
          0;
      } else if (status === "preapproved" || status === "pending") {
        current.pendingCount += 1;
        current.estimatedAmount += parseInteger(row.estimated_support_amount) ?? 0;
      } else if (["rejected", "cancelled", "expired"].includes(status)) {
        current.rejectedCount += 1;
      }
      const activeKinds = [
        current.approvedCount > 0,
        current.pendingCount > 0,
        current.rejectedCount > 0,
      ].filter(Boolean).length;
      current.status =
        activeKinds > 1
          ? "mixed"
          : current.approvedCount > 0
            ? "approved"
            : current.pendingCount > 0
              ? "preapproved"
              : current.rejectedCount > 0
                ? "rejected"
                : "none";
      sponsorSupportByApplication.set(applicationId, current);
    }

    const orFilter = `partner_driver_id.eq.${driver.partnerDriverId},auth_user_id.eq.${driver.userId}`;
    let memberQuotesResult: {
      data: unknown[] | null;
      error: { message: string; code?: string } | null;
    } = await admin
      .from("driver_quotes")
      .select(
        "id, application_id, price, vehicle_type, available_time, message, status, created_at, estimated_support_amount, support_settlement_type, preapproved_support_amount, approved_support_amount, support_discount_amount, customer_support_amount, driver_support_amount, final_customer_support_amount, final_driver_support_amount, member_price, final_member_price, support_recalculated_at, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_support_status, sponsor_approved_support_amount, sponsor_discounted_price, sponsor_quote_enabled, client_reward_amount",
      )
      .in("application_id", ids)
      .or(orFilter)
      .order("created_at", { ascending: false });
    if (isMissingColumnError(memberQuotesResult.error)) {
      memberQuotesResult = await admin
        .from("driver_quotes")
        .select(
          "id, application_id, price, vehicle_type, available_time, message, status, created_at, estimated_support_amount, support_discount_amount, customer_support_amount, member_price, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_support_status, sponsor_approved_support_amount, sponsor_discounted_price, sponsor_quote_enabled, driver_support_amount, client_reward_amount",
        )
        .in("application_id", ids)
        .or(orFilter)
        .order("created_at", { ascending: false });
    }
    if (isMissingColumnError(memberQuotesResult.error)) {
      memberQuotesResult = await admin
        .from("driver_quotes")
        .select(
          "id, application_id, price, vehicle_type, available_time, message, status, created_at, support_discount_amount, customer_support_amount, member_price, sponsor_discounted_price",
        )
        .in("application_id", ids)
        .or(orFilter)
        .order("created_at", { ascending: false });
    }
    if (isMissingColumnError(memberQuotesResult.error)) {
      memberQuotesResult = await admin
        .from("driver_quotes")
        .select(
          "id, application_id, price, vehicle_type, available_time, message, status, created_at",
        )
        .in("application_id", ids)
        .or(orFilter)
        .order("created_at", { ascending: false });
    }
    const { data: memberQuotes, error: memberQuotesError } = memberQuotesResult;

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
      const displayPrices = getQuoteDisplayPrices(row);
      const finalCustomerSupportAmount = parseInteger(row.final_customer_support_amount);
      const preapprovedSupportAmount =
        (parseInteger(row.preapproved_support_amount) ?? 0) > 0
          ? parseInteger(row.preapproved_support_amount)
          : (parseInteger(row.estimated_support_amount) ?? 0) > 0
            ? parseInteger(row.estimated_support_amount)
            : parseInteger(row.sponsor_support_amount);
      quotedByApplication.set(applicationId, {
        source: "member",
        id: safeText(row.id, ""),
        price: displayPrices.normalPrice,
        estimated_support_amount: parseInteger(row.estimated_support_amount),
        support_settlement_type: safeText(row.support_settlement_type, "client_priority"),
        preapproved_support_amount: preapprovedSupportAmount,
        approved_support_amount: parseInteger(row.approved_support_amount),
        support_discount_amount: parseInteger(row.support_discount_amount),
        customer_support_amount: displayPrices.supportCustomerAmount,
        member_price: displayPrices.supportPrice,
        final_customer_support_amount: finalCustomerSupportAmount,
        final_driver_support_amount: parseInteger(row.final_driver_support_amount),
        final_member_price: parseInteger(row.final_member_price),
        support_recalculated_at: safeText(row.support_recalculated_at),
        is_member_quote: row.is_member_quote === true,
        converted_from_guest_quote_id: safeText(row.converted_from_guest_quote_id, ""),
        sponsor_support_amount: parseInteger(row.sponsor_support_amount),
        sponsor_support_status: safeText(row.sponsor_support_status),
        sponsor_approved_support_amount: parseInteger(row.sponsor_approved_support_amount),
        sponsor_discounted_price: parseInteger(row.sponsor_discounted_price),
        sponsor_quote_enabled:
          row.sponsor_quote_enabled === true ||
          displayPrices.supportPrice != null ||
          displayPrices.supportCustomerAmount > 0,
        driver_support_amount: parseInteger(row.driver_support_amount),
        client_reward_amount: parseInteger(row.client_reward_amount),
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
          "id, application_id, guest_phone, price, vehicle_type, available_time, message, status, match_result, created_at, converted_to_member_quote_id, converted_at",
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

  const calls = await Promise.all(rows.map(async (raw) => {
    const row = raw as Record<string, unknown>;
    const id = safeText(row.id, "");
    const quote = quotedByApplication.get(id) ?? null;
    const autoSelectedQuoteId = safeText(row.auto_selected_quote_id, "");
    const finalSelectedQuoteId = safeText(row.final_selected_quote_id, "");
    const selectedQuoteId = finalSelectedQuoteId || autoSelectedQuoteId;
    const contactRevealedAt = safeText(row.contact_revealed_at, "");
    const revealStatuses = new Set(["final_selected", "contract_pending", "completed"]);
    const callCategory =
      quote != null && selectedQuoteId !== "" && quote.id === selectedQuoteId
        ? "matched"
        : quote != null && finalSelectedQuoteId === ""
          ? "quoted"
          : "new";
    const passengerCount = parseInteger(row.passenger_count);
    const supportEstimate = estimateSponsorSupport({
      passengerCount,
      price: 0,
    });
    const sponsorSupport = sponsorSupportByApplication.get(id);
    const approvedSupportAmount = sponsorSupport?.approvedAmount ?? 0;
    const supportAmount =
      approvedSupportAmount > 0
        ? approvedSupportAmount
        : (sponsorSupport?.estimatedAmount ?? 0) > 0
          ? sponsorSupport?.estimatedAmount ?? 0
          : supportEstimate.supportAmount;
    const customerInfoVisible =
      quote != null &&
      finalSelectedQuoteId !== "" &&
      quote.id === finalSelectedQuoteId &&
      contactRevealedAt !== "" &&
      revealStatuses.has(safeText(row.quote_status, "collecting"));
    const contractNumber =
      quote != null && finalSelectedQuoteId !== "" && quote.id === finalSelectedQuoteId
        ? await ensureContractNumber(admin, row)
        : safeText(row.contract_number, "");
    return {
      id,
      created_at: safeText(row.created_at, ""),
      receipt_number: safeText(row.receipt_number, ""),
      contract_number: contractNumber,
      contract_pdf_generated_at: safeText(row.contract_pdf_generated_at, ""),
      contract_pdf_url: safeText(row.contract_pdf_url, ""),
      application_type: safeText(row.application_type),
      trip_type: safeText(row.trip_type),
      bus_grade: safeText(row.bus_grade),
      departure: safeText(row.departure),
      departure_region: safeText(row.departure_region, ""),
      destination: safeText(row.destination),
      stopovers: parseStopovers(row.stopovers),
      departure_date: safeText(row.departure_date, ""),
      departure_time: safeText(row.departure_time),
      return_date: safeText(row.return_date, ""),
      passenger_count: passengerCount,
      request_message: safeText(row.request_message),
      estimated_support_amount: supportAmount,
      quote_status: safeText(row.quote_status, "collecting"),
      quote_deadline_at: safeText(row.quote_deadline_at, ""),
      quote_limit_count: parseInteger(row.quote_limit_count),
      quote_count: quoteCountByApplication.get(id) ?? 0,
      call_category: callCategory,
      target_normal_price: parseInteger(row.target_normal_price),
      target_member_price: parseInteger(row.target_member_price),
      quote_closed_at: safeText(row.quote_closed_at, ""),
      extension_round: parseInteger(row.extension_round) ?? 0,
      support_client_reward_ratio: parseInteger(row.support_client_reward_ratio) ?? 0,
      support_driver_ratio: parseInteger(row.support_driver_ratio) ?? 100,
      auto_selected_quote_id: autoSelectedQuoteId,
      auto_selected_quote_source: safeText(row.auto_selected_quote_source, ""),
      final_selected_quote_id: finalSelectedQuoteId,
      final_selected_quote_source: safeText(row.final_selected_quote_source, ""),
      auto_final_confirm_at: safeText(row.auto_final_confirm_at, ""),
      contact_revealed_at: contactRevealedAt,
      contract_status: safeText(row.contract_status, ""),
      contract_started_at: safeText(row.contract_started_at, ""),
      client_contract_confirmed_at: safeText(row.client_contract_confirmed_at, ""),
      driver_contract_confirmed_at: safeText(row.driver_contract_confirmed_at, ""),
      deposit_amount: parseInteger(row.deposit_amount) ?? 0,
      deposit_status: safeText(row.deposit_status, "unpaid"),
      deposit_confirmed_at: safeText(row.deposit_confirmed_at, ""),
      contract_memo: safeText(row.contract_memo, ""),
      customer_name: customerInfoVisible ? safeText(row.applicant_name) : "",
      customer_phone: customerInfoVisible ? safeText(row.phone) : "",
      sponsor_support_status: sponsorSupport?.status ?? "none",
      sponsor_approved_support_amount: sponsorSupport?.approvedAmount ?? null,
      sponsor_estimated_support_amount: sponsorSupport?.estimatedAmount ?? null,
      my_quote: quote,
    };
  }));

  return NextResponse.json({
    ok: true,
    calls,
    service_regions: driver.serviceRegions,
    service_regions_required: driver.serviceRegions.length === 0,
    driver: driver.driverInfo,
  });
}
