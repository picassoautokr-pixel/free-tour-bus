import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";

import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import {
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
  supportRewardAmounts,
} from "@/lib/quote-auction";
import { ensureContractNumber } from "@/lib/contract-deposit";
import { getQuoteDisplayPrices } from "@/lib/quote-display-prices";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

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

function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    /does not exist|column .* does not exist|could not find .* column|schema cache/i.test(
      error?.message ?? "",
    )
  );
}

function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://www.free-bus.co.kr";
}

function formatWon(value: number | null): string {
  return value == null ? "확인 중" : `${value.toLocaleString("ko-KR")}원`;
}

function hyphenKoreanMobile(digits: string): string {
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export async function GET(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  if (!sessionClient) {
    return NextResponse.json(
      { error: "서버 설정 오류(Supabase)입니다." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const applicationId = safeText(searchParams.get("application_id"));
  if (applicationId === "") {
    return NextResponse.json(
      { error: "application_id가 필요합니다." },
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

  await processApplicationQuoteLifecycle(admin, applicationId);

  const applicationResult: {
    data: unknown | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("applications")
    .select(
      `${quoteLifecycleSelectColumns()}, created_at, receipt_number, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url`,
    )
    .eq("id", applicationId)
    .maybeSingle();
  const { data: applicationRaw, error: applicationError } = applicationResult;
  if (applicationError) {
    return NextResponse.json({ error: applicationError.message }, { status: 502 });
  }
  const sponsorSummaryResult: {
    data: unknown | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("applications")
    .select(
      "sponsor_support_status, sponsor_approved_support_amount, sponsor_preapproved_count, sponsor_approved_count, sponsor_rejected_count",
    )
    .eq("id", applicationId)
    .maybeSingle();
  const sponsorSummary = isMissingColumnError(sponsorSummaryResult.error)
    ? {}
    : ((sponsorSummaryResult.data as Record<string, unknown> | null) ?? {});

  let quotesResult: {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("driver_quotes")
    .select(
      "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, estimated_support_amount, support_settlement_type, preapproved_support_amount, approved_support_amount, support_discount_amount, customer_support_amount, driver_support_amount, final_customer_support_amount, final_driver_support_amount, member_price, final_member_price, support_recalculated_at, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_support_status, sponsor_approved_support_amount, sponsor_discounted_price, sponsor_quote_enabled, client_reward_amount",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (isMissingColumnError(quotesResult.error)) {
    quotesResult = await admin
      .from("driver_quotes")
      .select(
        "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, estimated_support_amount, support_discount_amount, customer_support_amount, member_price, is_member_quote, converted_from_guest_quote_id, sponsor_support_amount, sponsor_support_status, sponsor_approved_support_amount, sponsor_discounted_price, sponsor_quote_enabled, driver_support_amount, client_reward_amount",
      )
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
  }
  if (isMissingColumnError(quotesResult.error)) {
    quotesResult = await admin
      .from("driver_quotes")
      .select(
        "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, support_discount_amount, customer_support_amount, member_price, sponsor_discounted_price",
      )
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
  }
  if (isMissingColumnError(quotesResult.error)) {
    quotesResult = await admin
      .from("driver_quotes")
      .select(
        "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status",
      )
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
  }
  const { data: quotesRaw, error: quotesError } = quotesResult;

  if (quotesError) {
    return NextResponse.json({ error: quotesError.message }, { status: 502 });
  }

  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [];
  const partnerIds = Array.from(
    new Set(
      quotes
        .map((q) => safeText((q as { partner_driver_id?: unknown }).partner_driver_id))
        .filter(Boolean),
    ),
  );

  const partnerById = new Map<
    string,
    { company_name: string; manager_name: string; phone: string }
  >();
  if (partnerIds.length > 0) {
    const { data: partnersRaw, error: partnersError } = await admin
      .from("partner_drivers")
      .select("id, company_name, manager_name, phone")
      .in("id", partnerIds);

    if (partnersError) {
      return NextResponse.json(
        { error: partnersError.message },
        { status: 502 },
      );
    }

    for (const raw of Array.isArray(partnersRaw) ? partnersRaw : []) {
      const row = raw as Record<string, unknown>;
      const id = safeText(row.id);
      if (id === "") continue;
      partnerById.set(id, {
        company_name: safeText(row.company_name, "—"),
        manager_name: safeText(row.manager_name, "—"),
        phone: safeText(row.phone, "—"),
      });
    }
  }

  let normalized = quotes.map((raw) => {
    const row = raw as Record<string, unknown>;
    const partnerDriverId = safeText(row.partner_driver_id);
    const partner = partnerById.get(partnerDriverId);
    const displayPrices = getQuoteDisplayPrices(row);
    const finalCustomerSupportAmount = parseInteger(row.final_customer_support_amount);
    return {
      id: safeText(row.id),
      created_at: safeText(row.created_at),
      application_id: safeText(row.application_id),
      partner_driver_id: partnerDriverId,
      auth_user_id: safeText(row.auth_user_id),
      price: displayPrices.normalPrice,
      estimated_support_amount: parseInteger(row.estimated_support_amount),
      support_settlement_type: safeText(row.support_settlement_type, "client_priority"),
      preapproved_support_amount: parseInteger(row.preapproved_support_amount),
      approved_support_amount: parseInteger(row.approved_support_amount),
      support_discount_amount: parseInteger(row.support_discount_amount),
      customer_support_amount: displayPrices.supportCustomerAmount,
      member_price: displayPrices.supportPrice,
      final_customer_support_amount: finalCustomerSupportAmount,
      final_driver_support_amount: parseInteger(row.final_driver_support_amount),
      final_member_price: parseInteger(row.final_member_price),
      support_recalculated_at: safeText(row.support_recalculated_at),
      is_member_quote: row.is_member_quote === true,
      converted_from_guest_quote_id: safeText(row.converted_from_guest_quote_id),
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
      company_name: partner?.company_name ?? "—",
      manager_name: partner?.manager_name ?? "—",
      phone: partner?.phone ?? "—",
    };
  });

  const guestSelectFull =
    "id, created_at, application_id, quote_referral_id, referral_token, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status, match_result, result_notified_at, result_sms_error, linked_partner_driver_id, linked_auth_user_id, converted_to_member_quote_id, converted_at";
  const guestSelectBasic =
    "id, created_at, application_id, quote_referral_id, referral_token, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status, match_result, result_notified_at, result_sms_error, converted_to_member_quote_id, converted_at";

  let guestRaw: unknown[] | null = null;
  let guestError: { message: string } | null = null;
  let guestHasLinkColumns = true;

  {
    const res = await admin
      .from("guest_driver_quotes")
      .select(guestSelectFull)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
    guestRaw = Array.isArray(res.data) ? res.data : [];
    guestError = res.error;
    if (
      res.error &&
      /linked_partner_driver_id|linked_auth_user_id|does not exist|42703/i.test(
        res.error.message,
      )
    ) {
      guestHasLinkColumns = false;
      const res2 = await admin
        .from("guest_driver_quotes")
        .select(guestSelectBasic)
        .eq("application_id", applicationId)
        .order("created_at", { ascending: false });
      guestRaw = Array.isArray(res2.data) ? res2.data : [];
      guestError = res2.error;
    }
  }

  if (guestError) {
    return NextResponse.json({ error: guestError.message }, { status: 502 });
  }

  const guestRows = guestRaw ?? [];
  const linkedIds = guestHasLinkColumns
    ? Array.from(
        new Set(
          guestRows
            .map((raw) =>
              safeText(
                (raw as { linked_partner_driver_id?: unknown })
                  .linked_partner_driver_id,
                "",
              ),
            )
            .filter(Boolean),
        ),
      )
    : [];

  const guestLinkPartnerById = new Map<
    string,
    { company_name: string; phone: string }
  >();
  if (linkedIds.length > 0) {
    const { data: linkedPartners, error: lpErr } = await admin
      .from("partner_drivers")
      .select("id, company_name, phone")
      .in("id", linkedIds);
    if (!lpErr) {
      for (const raw of Array.isArray(linkedPartners) ? linkedPartners : []) {
        const row = raw as Record<string, unknown>;
        const id = safeText(row.id);
        if (id === "") continue;
        guestLinkPartnerById.set(id, {
          company_name: safeText(row.company_name, "—"),
          phone: safeText(row.phone, "—"),
        });
      }
    }
  }

  const phoneVariants = Array.from(
    new Set(
      guestRows.flatMap((raw) => {
        const d = digitsOnlyKoreanMobile(
          safeText((raw as { guest_phone?: unknown }).guest_phone, ""),
        );
        if (!d) return [];
        return [d, hyphenKoreanMobile(d)];
      }),
    ),
  );

  const partnerByPhoneDigit = new Map<
    string,
    { id: string; company_name: string; phone: string }
  >();
  if (phoneVariants.length > 0) {
    const { data: phonePartners, error: ppErr } = await admin
      .from("partner_drivers")
      .select("id, company_name, phone")
      .in("phone", phoneVariants);
    if (!ppErr) {
      for (const raw of Array.isArray(phonePartners) ? phonePartners : []) {
        const row = raw as Record<string, unknown>;
        const d = digitsOnlyKoreanMobile(safeText(row.phone, ""));
        if (!d || partnerByPhoneDigit.has(d)) continue;
        partnerByPhoneDigit.set(d, {
          id: safeText(row.id),
          company_name: safeText(row.company_name, "—"),
          phone: safeText(row.phone, "—"),
        });
      }
    }
  }

  const guest_quotes = guestRows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const guestPhone = safeText(row.guest_phone, "—");
    const guestDigits = digitsOnlyKoreanMobile(guestPhone);
    const linkedId = guestHasLinkColumns
      ? safeText(row.linked_partner_driver_id, "")
      : "";
    const fromLink = linkedId !== "" ? guestLinkPartnerById.get(linkedId) : undefined;
    const fromPhone =
      guestDigits != null ? partnerByPhoneDigit.get(guestDigits) : undefined;
    const resolved = fromLink ?? fromPhone;
    return {
      id: safeText(row.id),
      created_at: safeText(row.created_at),
      application_id: safeText(row.application_id),
      quote_referral_id: safeText(row.quote_referral_id),
      referral_token: safeText(row.referral_token),
      guest_company_name: safeText(row.guest_company_name, "—"),
      guest_driver_name: safeText(row.guest_driver_name, "—"),
      guest_phone: guestPhone,
      price: parseInteger(row.price),
      vehicle_type: safeText(row.vehicle_type, "—"),
      available_time: safeText(row.available_time, "—"),
      message: safeText(row.message),
      status: safeText(row.status, "submitted"),
      match_result: safeText(row.match_result, "pending"),
      result_notified_at: safeText(row.result_notified_at),
      result_sms_error: safeText(row.result_sms_error),
      converted_to_member_quote_id: safeText(row.converted_to_member_quote_id),
      converted_at: safeText(row.converted_at),
      linked_partner_driver_id: linkedId,
      member_converted: resolved != null,
      linked_partner_company: resolved?.company_name ?? "",
      linked_partner_phone: resolved?.phone ?? "",
    };
  });

  const guestPriceById = new Map(
    guest_quotes.map((quote) => [quote.id, quote.price] as const),
  );
  normalized = normalized.map((quote) => ({
    ...quote,
    converted_from_guest_price:
      quote.converted_from_guest_quote_id !== ""
        ? (guestPriceById.get(quote.converted_from_guest_quote_id) ?? null)
        : null,
  }));

  const application = applicationRaw as Record<string, unknown> | null;
  const supportRewards = supportRewardAmounts({
    passengerCount: application?.passenger_count,
    extensionRound: application?.extension_round,
  });
  const contractNumber =
    application && safeText(application.final_selected_quote_id) !== ""
      ? await ensureContractNumber(admin, application)
      : safeText(application?.contract_number);
  const { data: notificationRows } = await admin
    .from("notification_logs")
    .select(
      "id, created_at, target_type, target_phone, target_name, notification_type, quote_id, quote_source, status, error, sent_at",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    ok: true,
    application: application
      ? {
          id: safeText(application.id),
          contract_number: contractNumber,
          contract_pdf_generated_at: safeText(application.contract_pdf_generated_at),
          contract_pdf_url: safeText(application.contract_pdf_url),
          quote_status: safeText(application.quote_status, "collecting"),
          quote_deadline_at: safeText(application.quote_deadline_at),
          quote_limit_count: parseInteger(application.quote_limit_count),
          target_normal_price: parseInteger(application.target_normal_price),
          target_member_price: parseInteger(application.target_member_price),
          quote_closed_at: safeText(application.quote_closed_at),
          quote_closed_reason: safeText(application.quote_closed_reason),
          auto_selected_quote_id: safeText(application.auto_selected_quote_id),
          auto_selected_quote_source: safeText(application.auto_selected_quote_source),
          auto_selected_at: safeText(application.auto_selected_at),
          auto_final_confirm_at: safeText(application.auto_final_confirm_at),
          final_selected_quote_id: safeText(application.final_selected_quote_id),
          final_selected_quote_source: safeText(application.final_selected_quote_source),
          final_selected_at: safeText(application.final_selected_at),
          contact_revealed_at: safeText(application.contact_revealed_at),
          contract_started_at: safeText(application.contract_started_at),
          client_contract_confirmed_at: safeText(application.client_contract_confirmed_at),
          driver_contract_confirmed_at: safeText(application.driver_contract_confirmed_at),
          deposit_amount: parseInteger(application.deposit_amount) ?? 0,
          deposit_status: safeText(application.deposit_status, "unpaid"),
          deposit_confirmed_at: safeText(application.deposit_confirmed_at),
          contract_memo: safeText(application.contract_memo),
          extension_round: parseInteger(application.extension_round) ?? 0,
          support_client_reward_ratio:
            parseInteger(application.support_client_reward_ratio) ??
            supportRewards.support_client_reward_ratio,
          support_driver_ratio:
            parseInteger(application.support_driver_ratio) ??
            supportRewards.support_driver_ratio,
          contract_status: safeText(application.contract_status),
          sponsor_support_status: safeText(sponsorSummary.sponsor_support_status, "none"),
          sponsor_approved_support_amount:
            parseInteger(sponsorSummary.sponsor_approved_support_amount) ?? 0,
          sponsor_preapproved_count: parseInteger(sponsorSummary.sponsor_preapproved_count) ?? 0,
          sponsor_approved_count: parseInteger(sponsorSummary.sponsor_approved_count) ?? 0,
          sponsor_rejected_count: parseInteger(sponsorSummary.sponsor_rejected_count) ?? 0,
          estimated_support_amount: supportRewards.estimated_support_amount,
          client_reward_amount: supportRewards.client_reward_amount,
          driver_support_amount: supportRewards.driver_support_amount,
        }
      : null,
    quotes: normalized,
    guest_quotes,
    notification_logs: (Array.isArray(notificationRows) ? notificationRows : []).map(
      (raw) => {
        const row = raw as Record<string, unknown>;
        return {
          id: safeText(row.id),
          created_at: safeText(row.created_at),
          target_type: safeText(row.target_type),
          target_phone: safeText(row.target_phone),
          target_name: safeText(row.target_name),
          notification_type: safeText(row.notification_type),
          quote_id: safeText(row.quote_id),
          quote_source: safeText(row.quote_source),
          status: safeText(row.status),
          error: safeText(row.error),
          sent_at: safeText(row.sent_at),
        };
      },
    ),
  });
}

export async function PATCH(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  if (!sessionClient) {
    return NextResponse.json(
      { error: "서버 설정 오류(Supabase)입니다." },
      { status: 500 },
    );
  }
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: {
    guest_quote_id?: unknown;
    match_result?: unknown;
    application_id?: unknown;
    action?: unknown;
  };
  try {
    body = (await request.json()) as {
      guest_quote_id?: unknown;
      match_result?: unknown;
      application_id?: unknown;
      action?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const action = safeText(body.action);
  const actionApplicationId = safeText(body.application_id);
  if (action !== "") {
    if (
      actionApplicationId === "" ||
      !["final_confirm", "reopen", "manual_close"].includes(action)
    ) {
      return NextResponse.json({ error: "관리자 액션 값이 올바르지 않습니다." }, { status: 400 });
    }

    const admin = createServiceRoleSupabase();
    if (!admin) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
        { status: 503 },
      );
    }

    if (action === "reopen") {
      const { error: updateError } = await admin
        .from("applications")
        .update({
          quote_status: "collecting",
          quote_closed_at: null,
          quote_closed_reason: "admin_reopened",
          auto_selected_quote_id: null,
          auto_selected_quote_source: null,
          auto_selected_at: null,
          auto_final_confirm_at: null,
          final_selected_quote_id: null,
          final_selected_quote_source: null,
          final_selected_at: null,
          contact_revealed_at: null,
          contract_status: "pending",
          contract_started_at: null,
          client_contract_confirmed_at: null,
          driver_contract_confirmed_at: null,
          deposit_amount: 0,
          deposit_status: "unpaid",
          deposit_confirmed_at: null,
          contract_memo: null,
          contract_number: null,
          contract_pdf_generated_at: null,
          contract_pdf_url: null,
        })
        .eq("id", actionApplicationId);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 502 });
      }
      await admin
        .from("driver_quotes")
        .update({ status: "submitted" })
        .eq("application_id", actionApplicationId);
      await admin
        .from("guest_driver_quotes")
        .update({ status: "submitted", match_result: "pending" })
        .eq("application_id", actionApplicationId);
      return NextResponse.json({ ok: true });
    }

    if (action === "manual_close") {
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from("applications")
        .update({
          quote_status: "manually_closed",
          quote_closed_at: now,
          quote_closed_reason: "admin_manual_close",
        })
        .eq("id", actionApplicationId);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 502 });
      }
      await processApplicationQuoteLifecycle(admin, actionApplicationId);
      return NextResponse.json({ ok: true });
    }

    await processApplicationQuoteLifecycle(admin, actionApplicationId);
    const { data: app, error: appError } = await admin
      .from("applications")
      .select(
        "id, created_at, receipt_number, auto_selected_quote_id, auto_selected_quote_source, final_selected_quote_id, contract_status, contract_started_at, contract_number",
      )
      .eq("id", actionApplicationId)
      .maybeSingle();
    if (appError) {
      return NextResponse.json({ error: appError.message }, { status: 502 });
    }
    const row = app as Record<string, unknown> | null;
    const selectedId = safeText(row?.auto_selected_quote_id);
    const selectedSource = safeText(row?.auto_selected_quote_source) === "guest"
      ? "guest"
      : "member";
    if (selectedId === "") {
      return NextResponse.json(
        { error: "자동확정된 견적이 없어 즉시 최종확정할 수 없습니다." },
        { status: 400 },
      );
    }
    const now = new Date().toISOString();
    const contractStartedAt = safeText(row?.contract_started_at) || now;
    const contractNumber = await ensureContractNumber(admin, {
      ...row,
      id: actionApplicationId,
      final_selected_at: now,
      contract_started_at: contractStartedAt,
    });
    const { error: finalError } = await admin
      .from("applications")
      .update({
        final_selected_quote_id: selectedId,
        final_selected_quote_source: selectedSource,
        final_selected_at: now,
        quote_status: "final_selected",
        contact_revealed_at: now,
        contract_status: safeText(row?.contract_status) || "pending",
        contract_started_at: contractStartedAt,
        contract_number: contractNumber,
      })
      .eq("id", actionApplicationId);
    if (finalError) {
      return NextResponse.json({ error: finalError.message }, { status: 502 });
    }
    await admin
      .from(selectedSource === "member" ? "driver_quotes" : "guest_driver_quotes")
      .update(
        selectedSource === "member"
          ? { status: "final_selected" }
          : { status: "final_selected", match_result: "selected" },
      )
      .eq("id", selectedId);
    await admin
      .from("driver_quotes")
      .update({ status: "not_selected" })
      .eq("application_id", actionApplicationId)
      .neq("id", selectedSource === "member" ? selectedId : "");
    await admin
      .from("guest_driver_quotes")
      .update({ status: "not_selected", match_result: "not_selected" })
      .eq("application_id", actionApplicationId)
      .neq("id", selectedSource === "guest" ? selectedId : "");
    return NextResponse.json({ ok: true });
  }

  const guestQuoteId = safeText(body.guest_quote_id);
  const matchResult = safeText(body.match_result);
  if (guestQuoteId === "" || !["pending", "selected", "not_selected"].includes(matchResult)) {
    return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data: guest, error: guestError } = await admin
    .from("guest_driver_quotes")
    .select("id, application_id, guest_phone, price")
    .eq("id", guestQuoteId)
    .maybeSingle();
  if (guestError) {
    return NextResponse.json({ error: guestError.message }, { status: 502 });
  }
  if (!guest) {
    return NextResponse.json({ error: "비회원 견적을 찾을 수 없습니다." }, { status: 404 });
  }

  let patch: Record<string, unknown> = { match_result: matchResult };
  if (matchResult === "not_selected") {
    const applicationId = safeText((guest as { application_id?: unknown }).application_id);
    const guestPhone = safeText((guest as { guest_phone?: unknown }).guest_phone);

    const [{ data: memberQuotes }, { data: guestQuotes }] = await Promise.all([
      admin.from("driver_quotes").select("price").eq("application_id", applicationId),
      admin.from("guest_driver_quotes").select("price").eq("application_id", applicationId),
    ]);
    const prices = [
      ...(Array.isArray(memberQuotes) ? memberQuotes : []),
      ...(Array.isArray(guestQuotes) ? guestQuotes : []),
    ]
      .map((row) => parseInteger((row as { price?: unknown }).price))
      .filter((v): v is number => v != null && v > 0);
    const averagePrice =
      prices.length === 0
        ? null
        : Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);

    const apiKey = process.env.SOLAPI_API_KEY?.trim();
    const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
    const from =
      process.env.SOLAPI_SENDER_NUMBER?.trim() ??
      process.env.SOLAPI_SENDER?.trim();
    if (apiKey && apiSecret && from && /^010\d{8}$/.test(guestPhone)) {
      const text = `[무료관광버스]
아쉽게도 이번 견적은 선택되지 않았습니다.

이번 콜의 평균 견적가는 ${formatWon(averagePrice)}입니다.
다음 콜부터 실시간으로 참여하려면 제휴기사로 가입해주세요.

가입하기:
${siteBaseUrl()}/partner/register?invitePhone=${guestPhone}`;
      try {
        const solapi = new SolapiMessageService(apiKey, apiSecret);
        await solapi.send([{ to: guestPhone, from, text }]);
        patch = {
          ...patch,
          result_notified_at: new Date().toISOString(),
          result_sms_error: null,
        };
      } catch (e) {
        patch = {
          ...patch,
          result_sms_error: e instanceof Error ? e.message : String(e),
        };
      }
    }
  }

  const { data: updated, error: updateError } = await admin
    .from("guest_driver_quotes")
    .update(patch)
    .eq("id", guestQuoteId)
    .select(
      "id, created_at, application_id, quote_referral_id, referral_token, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status, match_result, result_notified_at, result_sms_error",
    )
    .single();
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, guest_quote: updated });
}
