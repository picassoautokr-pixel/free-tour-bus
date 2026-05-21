import { NextResponse } from "next/server";

import {
  calculateAutoFinalConfirmAt,
  getQuoteAutomationSettings,
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import { ensureContractNumber } from "@/lib/contract-deposit";
import { sendNotificationSms } from "@/lib/notification-service";
import { selectedPriceTypeToLegacyKind } from "@/lib/client-quote-match-selection";
import { NORMAL_MATCH_SPONSOR_REASON } from "@/lib/selected-price-display";
import { buildClientMemberQuoteSupport } from "@/lib/client-member-quote-payload";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const APPLICATION_SPONSOR_AND_SELECTED_PRICE_COLUMNS =
  "sponsor_support_status, sponsor_approved_support_amount, sponsor_preapproved_count, sponsor_approved_count, sponsor_rejected_count, client_price_selection_kind, selected_price_type, selected_price_label, selected_price";

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function digits(value: unknown): string {
  return safeText(value).replace(/\D/g, "");
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
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

function comparablePrice(quote: {
  price: number | null;
  member_price?: number | null;
}): number {
  return quote.member_price ?? quote.price ?? Number.MAX_SAFE_INTEGER;
}

async function resolveApplication(admin: ReturnType<typeof createServiceRoleSupabase>, request: Request) {
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.", status: 503 } as const;
  const { searchParams } = new URL(request.url);
  const receiptNumber = safeText(searchParams.get("receipt_number"));
  const phoneDigits = digits(searchParams.get("phone"));
  if (receiptNumber === "" || phoneDigits === "") {
    return { error: "접수번호와 휴대폰번호가 필요합니다.", status: 400 } as const;
  }
  let result: {
    data: unknown | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("applications")
    .select(
      `id, created_at, receipt_number, applicant_name, phone, departure, departure_region, destination, stopovers, departure_date, departure_time, return_date, trip_type, bus_grade, passenger_count, request_message, application_type, organization_type, organization_name, ${quoteLifecycleSelectColumns()}, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url, ${APPLICATION_SPONSOR_AND_SELECTED_PRICE_COLUMNS}`,
    )
    .eq("receipt_number", receiptNumber)
    .maybeSingle();
  if (isMissingColumnError(result.error)) {
    result = await admin
      .from("applications")
      .select(
        `id, created_at, receipt_number, applicant_name, phone, departure, destination, stopovers, departure_date, departure_time, return_date, trip_type, bus_grade, passenger_count, request_message, ${quoteLifecycleSelectColumns()}, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url`,
      )
      .eq("receipt_number", receiptNumber)
      .maybeSingle();
  }
  const { data, error } = result;
  if (error) return { error: error.message, status: 502 } as const;
  const app = data as Record<string, unknown> | null;
  if (!app || digits(app.phone) !== phoneDigits) {
    return { error: "견적요청을 찾을 수 없습니다.", status: 404 } as const;
  }
  return { app } as const;
}

async function resolveApplicationsByLookupPassword(
  admin: NonNullable<ReturnType<typeof createServiceRoleSupabase>>,
  request: Request,
) {
  const { searchParams } = new URL(request.url);
  const phoneDigits = digits(searchParams.get("phone"));
  const lookupPassword = safeText(searchParams.get("lookup_password"));
  if (phoneDigits === "" || lookupPassword === "") {
    return { error: "휴대폰번호와 간단 비밀번호가 필요합니다.", status: 400 } as const;
  }
  if (lookupPassword.length < 4) {
    return { error: "간단 비밀번호는 4자리 이상 입력해 주세요.", status: 400 } as const;
  }
  const result: {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("applications")
    .select("id, phone, client_lookup_password")
    .eq("client_lookup_password", lookupPassword)
    .order("created_at", { ascending: false });
  if (isMissingColumnError(result.error)) {
    return {
      error: "DB 컬럼 업데이트 필요: sql/client_lookup_password.sql을 적용해 주세요.",
      status: 503,
    } as const;
  }
  if (result.error) return { error: result.error.message, status: 502 } as const;
  const rows = (Array.isArray(result.data) ? result.data : []).filter(
    (row) => digits((row as Record<string, unknown>).phone) === phoneDigits,
  );
  if (rows.length === 0) {
    return { error: "일치하는 견적요청을 찾을 수 없습니다.", status: 404 } as const;
  }
  return { rows: rows as Record<string, unknown>[] } as const;
}

async function loadPayload(admin: NonNullable<ReturnType<typeof createServiceRoleSupabase>>, app: Record<string, unknown>) {
  const applicationId = safeText(app.id);
  await processApplicationQuoteLifecycle(admin, applicationId);
  let latestResult: {
    data: unknown | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("applications")
    .select(
      `id, created_at, receipt_number, applicant_name, phone, departure, departure_region, destination, stopovers, departure_date, departure_time, return_date, trip_type, bus_grade, passenger_count, request_message, application_type, organization_type, organization_name, ${quoteLifecycleSelectColumns()}, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url, ${APPLICATION_SPONSOR_AND_SELECTED_PRICE_COLUMNS}`,
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (isMissingColumnError(latestResult.error)) {
    latestResult = await admin
      .from("applications")
      .select(
        `id, created_at, receipt_number, applicant_name, phone, departure, destination, stopovers, departure_date, departure_time, return_date, trip_type, bus_grade, passenger_count, request_message, ${quoteLifecycleSelectColumns()}, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url`,
      )
      .eq("id", applicationId)
      .maybeSingle();
  }

  let memberResult: {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("driver_quotes")
    .select(
      "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, planned_total_support, planned_customer_support, planned_driver_support, planned_discount_price, planned_final_price, confirmed_total_support, confirmed_customer_support, confirmed_driver_support, confirmed_discount_price, confirmed_final_price, customer_support_amount, support_discount_amount, driver_support_amount, preapproved_support_amount, approved_support_amount, final_customer_support_amount, final_driver_support_amount, member_price, final_member_price, sponsor_discounted_price, sponsor_quote_enabled, sponsor_support_status, support_settlement_type, estimated_support_amount, extension_support_amount, extension_applied",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (isMissingColumnError(memberResult.error)) {
    memberResult = await admin
      .from("driver_quotes")
      .select(
        "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, customer_support_amount, support_discount_amount, member_price, sponsor_discounted_price, sponsor_quote_enabled, sponsor_support_status",
      )
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
  }
  if (isMissingColumnError(memberResult.error)) {
    memberResult = await admin
      .from("driver_quotes")
      .select("id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
  }

  const guestResult: {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
  } = await admin
    .from("guest_driver_quotes")
    .select("id, created_at, application_id, price, vehicle_type, available_time, message, status, match_result, guest_company_name, guest_driver_name, guest_phone")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (memberResult.error && guestResult.error) {
    throw new Error("견적 정보를 불러오지 못했습니다.");
  }
  const latest = latestResult.data;
  const memberRows = memberResult.error ? [] : memberResult.data;
  const guestRows = guestResult.error ? [] : guestResult.data;
  const current = (latest as Record<string, unknown> | null) ?? app;
  const contractNumber =
    safeText(current.final_selected_quote_id) !== ""
      ? await ensureContractNumber(admin, current)
      : safeText(current.contract_number);
  const contactRevealed = safeText(current.contact_revealed_at) !== "";
  const revealStatuses = new Set(["final_selected", "contract_pending", "completed"]);
  const finalSelectedQuoteId = safeText(current.final_selected_quote_id);
  const canRevealSelectedContact =
    contactRevealed &&
    finalSelectedQuoteId !== "" &&
    revealStatuses.has(safeText(current.quote_status, "collecting"));
  const finalSelectedQuoteSource =
    safeText(current.final_selected_quote_source) === "guest" ? "guest" : "member";
  const memberPartnerIds = [
    ...new Set(
      (Array.isArray(memberRows) ? memberRows : [])
        .map((raw) => safeText((raw as Record<string, unknown>).partner_driver_id))
        .filter(Boolean),
    ),
  ];
  const memberAuthUserIds = [
    ...new Set(
      (Array.isArray(memberRows) ? memberRows : [])
        .map((raw) => safeText((raw as Record<string, unknown>).auth_user_id))
        .filter(Boolean),
    ),
  ];
  const [{ data: partnerRows }, { data: authPartnerRows }] = await Promise.all([
    memberPartnerIds.length > 0
      ? admin
          .from("partner_drivers")
          .select("id, company_name, manager_name, phone")
          .in("id", memberPartnerIds)
      : Promise.resolve({ data: [] }),
    memberAuthUserIds.length > 0
      ? admin
          .from("partner_drivers")
          .select("auth_user_id, company_name, manager_name, phone")
          .in("auth_user_id", memberAuthUserIds)
      : Promise.resolve({ data: [] }),
  ]);
  const partnerById = new Map(
    (Array.isArray(partnerRows) ? partnerRows : []).map((row) => [
      safeText((row as Record<string, unknown>).id),
      row as Record<string, unknown>,
    ]),
  );
  const partnerByAuthUserId = new Map(
    (Array.isArray(authPartnerRows) ? authPartnerRows : []).map((row) => [
      safeText((row as Record<string, unknown>).auth_user_id),
      row as Record<string, unknown>,
    ]),
  );

  const { data: sponsorPreapprovals } = await admin
    .from("sponsor_preapprovals")
    .select("status, approved_support_amount, estimated_support_amount")
    .eq("application_id", applicationId);
  const sponsorRows = Array.isArray(sponsorPreapprovals)
    ? (sponsorPreapprovals as Array<Record<string, unknown>>)
    : [];
  const hasApprovedSponsor = sponsorRows.some((row) => safeText(row.status) === "approved");
  const hasRejectedSponsor =
    sponsorRows.length > 0 &&
    sponsorRows.every((row) => ["rejected", "cancelled", "expired"].includes(safeText(row.status)));
  const derivedSponsorSupportStatus = hasApprovedSponsor
    ? "approved"
    : hasRejectedSponsor
      ? "rejected"
      : sponsorRows.length > 0
        ? "preapproved"
        : "none";
  const storedSponsorSupportStatus = safeText(current.sponsor_support_status);
  const applicationSponsorStatus =
    storedSponsorSupportStatus && storedSponsorSupportStatus !== "none"
      ? storedSponsorSupportStatus
      : derivedSponsorSupportStatus;
  const sponsorApprovedFromPreapprovals = sponsorRows
    .filter((row) => safeText(row.status) === "approved")
    .reduce((sum, row) => sum + (parseInteger(row.approved_support_amount) ?? 0), 0);
  const appApproved =
    parseInteger(current.sponsor_approved_support_amount) ??
    (sponsorApprovedFromPreapprovals > 0 ? sponsorApprovedFromPreapprovals : null);
  const appTargetNormal = parseInteger(current.target_normal_price);
  const appTargetMember = parseInteger(current.target_member_price);

  const quotes = [
    ...(Array.isArray(memberRows) ? memberRows : []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const partner =
        partnerById.get(safeText(row.partner_driver_id)) ??
        partnerByAuthUserId.get(safeText(row.auth_user_id)) ??
        {};
      const supportOptions = {
        applicationApprovedSupportTotal: appApproved,
        sponsorApprovedSupportAmount: appApproved,
        applicationSponsorStatus,
        applicationTargetNormalPrice: appTargetNormal,
        applicationTargetMemberPrice: appTargetMember,
      };
      const support = buildClientMemberQuoteSupport(row, supportOptions);
      const breakdown = support.support_breakdown;
      const quoteSponsorStatus =
        safeText(row.sponsor_support_status) === "approved" || applicationSponsorStatus === "approved"
          ? "approved"
          : safeText(row.sponsor_support_status);
      return {
        source: "member",
        id: safeText(row.id),
        company_name: safeText(partner?.company_name, "제휴기사"),
        driver_name: safeText(partner?.manager_name, "—"),
        phone:
          canRevealSelectedContact &&
          finalSelectedQuoteSource === "member" &&
          safeText(row.id) === finalSelectedQuoteId
            ? safeText(partner?.phone)
            : "",
        price: support.price,
        member_price: support.member_price,
        support_discount_planned_price: support.support_discount_planned_price,
        support_discount_applied_price: support.support_discount_applied_price,
        final_discount_applied_price: support.final_discount_applied_price,
        confirmed_discount_price: support.confirmed_discount_price,
        support_breakdown: breakdown,
        planned_total_support: support.planned_total_support,
        planned_customer_support: support.planned_customer_support,
        planned_driver_support: support.planned_driver_support,
        customer_support_amount:
          support.planned_customer_support ?? parseInteger(row.customer_support_amount),
        client_reward_amount: parseInteger(row.client_reward_amount),
        confirmed_total_support: support.confirmed_total_support,
        confirmed_customer_support: support.confirmed_customer_support,
        confirmed_driver_support: support.confirmed_driver_support,
        support_settlement_type: safeText(row.support_settlement_type),
        extension_support_amount: support.extension_support_amount,
        preapproved_support_amount: parseInteger(row.preapproved_support_amount),
        approved_support_amount:
          support.confirmed_total_support ?? parseInteger(row.approved_support_amount),
        sponsor_approved_support_amount: support.confirmed_total_support ?? appApproved,
        final_customer_support_amount: support.confirmed_customer_support,
        support_status: quoteSponsorStatus,
        sponsor_support_status: quoteSponsorStatus,
        sponsor_quote_enabled: support.sponsor_quote_enabled,
        vehicle_type: safeText(row.vehicle_type, "—"),
        available_time: safeText(row.available_time, "—"),
        memo: safeText(row.message),
        message: safeText(row.message),
        status: safeText(row.status, "submitted"),
        created_at: safeText(row.created_at),
      };
    }),
    ...(Array.isArray(guestRows) ? guestRows : []).map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        source: "guest",
        id: safeText(row.id),
        company_name: safeText(row.guest_company_name, "비회원 기사"),
        driver_name: safeText(row.guest_driver_name, "—"),
        phone:
          canRevealSelectedContact &&
          finalSelectedQuoteSource === "guest" &&
          safeText(row.id) === finalSelectedQuoteId
            ? safeText(row.guest_phone)
            : "",
        price: parseInteger(row.price),
        member_price: parseInteger(row.price),
        support_discount_planned_price: parseInteger(row.price),
        support_discount_applied_price: null,
        final_discount_applied_price: parseInteger(row.price),
        support_breakdown: null,
        sponsor_quote_enabled: false,
        vehicle_type: safeText(row.vehicle_type, "—"),
        available_time: safeText(row.available_time, "—"),
        memo: safeText(row.message),
        message: safeText(row.message),
        status: safeText(row.status, safeText(row.match_result, "submitted")),
        created_at: safeText(row.created_at),
      };
    }),
  ].sort((a, b) => {
    const aSupport = a.member_price != null ? 0 : 1;
    const bSupport = b.member_price != null ? 0 : 1;
    if (aSupport !== bSupport) return aSupport - bSupport;
    const priceDiff = comparablePrice(a) - comparablePrice(b);
    if (priceDiff !== 0) return priceDiff;
    const rawPriceDiff = (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
    if (rawPriceDiff !== 0) return rawPriceDiff;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
  return {
    application: {
      id: applicationId,
      receipt_number: safeText(current.receipt_number),
      contract_number: contractNumber,
      contract_pdf_generated_at: safeText(current.contract_pdf_generated_at),
      contract_pdf_url: safeText(current.contract_pdf_url),
      departure: safeText(current.departure),
      departure_region: safeText(current.departure_region),
      destination: safeText(current.destination),
      stopovers: Array.isArray(current.stopovers)
        ? current.stopovers.map((item) => safeText(item)).filter(Boolean)
        : [],
      departure_date: safeText(current.departure_date),
      departure_time: safeText(current.departure_time),
      return_date: safeText(current.return_date),
      trip_type: safeText(current.trip_type),
      application_type: safeText(current.application_type),
      organization_type: safeText(current.organization_type),
      group_type:
        safeText(current.organization_type) || safeText(current.application_type),
      organization_name: safeText(current.organization_name),
      bus_grade: safeText(current.bus_grade),
      passenger_count: parseInteger(current.passenger_count),
      applicant_name: safeText(current.applicant_name),
      phone: safeText(current.phone),
      request_message: safeText(current.request_message),
      quote_status: safeText(current.quote_status, "collecting"),
        quote_deadline_at: safeText(current.quote_deadline_at),
        quote_limit_count: parseInteger(current.quote_limit_count),
        target_normal_price: parseInteger(current.target_normal_price),
        target_member_price: parseInteger(current.target_member_price),
      quote_closed_at: safeText(current.quote_closed_at),
      auto_selected_quote_id: safeText(current.auto_selected_quote_id),
      auto_selected_quote_source: safeText(current.auto_selected_quote_source),
      auto_selected_at: safeText(current.auto_selected_at),
      auto_final_confirm_at: safeText(current.auto_final_confirm_at),
      final_selected_quote_id: safeText(current.final_selected_quote_id),
      final_selected_quote_source: safeText(current.final_selected_quote_source),
      final_selected_at: safeText(current.final_selected_at),
      client_price_selection_kind: safeText(current.client_price_selection_kind) || null,
      selected_price_type: safeText(current.selected_price_type) || null,
      selected_price_label: safeText(current.selected_price_label) || null,
      selected_price: parseInteger(current.selected_price),
      final_price_selection_kind:
        safeText(current.client_price_selection_kind) ||
        (safeText(current.selected_price_type)
          ? selectedPriceTypeToLegacyKind(
              safeText(current.selected_price_type) as "normal" | "support_planned" | "support_confirmed",
            )
          : null),
      contact_revealed_at: safeText(current.contact_revealed_at),
      contract_status: safeText(current.contract_status),
      contract_started_at: safeText(current.contract_started_at),
      client_contract_confirmed_at: safeText(current.client_contract_confirmed_at),
      driver_contract_confirmed_at: safeText(current.driver_contract_confirmed_at),
      deposit_amount: parseInteger(current.deposit_amount) ?? 0,
      deposit_status: safeText(current.deposit_status, "unpaid"),
      deposit_confirmed_at: safeText(current.deposit_confirmed_at),
      contract_memo: safeText(current.contract_memo),
      quote_count: quotes.length,
      sponsor_support_status: applicationSponsorStatus,
      sponsor_preapproved_count: parseInteger(current.sponsor_preapproved_count) ?? 0,
      sponsor_approved_count: parseInteger(current.sponsor_approved_count) ?? 0,
      sponsor_rejected_count: parseInteger(current.sponsor_rejected_count) ?? 0,
      sponsor_approved_support_amount: parseInteger(current.sponsor_approved_support_amount),
    },
    quotes,
  };
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
  if (safeText(searchParams.get("lookup_password")) !== "") {
    const resolvedList = await resolveApplicationsByLookupPassword(admin, request);
    if ("error" in resolvedList) {
      return NextResponse.json({ error: resolvedList.error }, { status: resolvedList.status });
    }
    const payloads = await Promise.all(
      resolvedList.rows.map((row) => loadPayload(admin, row)),
    );
    return NextResponse.json({
      ok: true,
      applications: payloads.map((payload) => ({
        ...payload.application,
        quotes: payload.quotes,
      })),
    });
  }
  const resolved = await resolveApplication(admin, request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json({ ok: true, ...(await loadPayload(admin!, resolved.app)) });
}

export async function POST(request: Request) {
  const admin = createServiceRoleSupabase();
  let body: {
    receipt_number?: unknown;
    phone?: unknown;
    application_id?: unknown;
    action?: unknown;
    quote_id?: unknown;
    quote_source?: unknown;
    price_selection_kind?: unknown;
    selected_price_type?: unknown;
    selected_price_label?: unknown;
    selected_price?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  const url = new URL(request.url);
  url.searchParams.set("receipt_number", safeText(body.receipt_number));
  url.searchParams.set("phone", safeText(body.phone));
  const resolved = await resolveApplication(admin, new Request(url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const app = resolved.app;
  const applicationId = safeText(app.id);
  const action = safeText(body.action);
  const quoteId = safeText(body.quote_id);
  const quoteSource = safeText(body.quote_source) === "guest" ? "guest" : "member";

  if (action === "reopen") {
    await admin
      .from("applications")
      .update({
        quote_status: "collecting",
        quote_closed_at: null,
        quote_closed_reason: "client_reopened",
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
        client_price_selection_kind: null,
        selected_price_type: null,
        selected_price_label: null,
        selected_price: null,
      })
      .eq("id", applicationId);
    return NextResponse.json({ ok: true, ...(await loadPayload(admin, app)) });
  }

  if (action === "select_quote" && quoteId !== "") {
    const now = new Date();
    const settings = await getQuoteAutomationSettings(admin);
    await admin
      .from("applications")
      .update({
        auto_selected_quote_id: quoteId,
        auto_selected_quote_source: quoteSource,
        auto_selected_at: now.toISOString(),
        auto_final_confirm_at: calculateAutoFinalConfirmAt(now, settings),
        quote_status: "auto_selected",
      })
      .eq("id", applicationId);
    return NextResponse.json({ ok: true, ...(await loadPayload(admin, app)) });
  }

  if (action === "final_confirm") {
    const bodyApplicationId = safeText(body.application_id);
    if (bodyApplicationId !== "" && bodyApplicationId !== applicationId) {
      return NextResponse.json({ error: "견적요청 정보가 일치하지 않습니다." }, { status: 400 });
    }
    const selectedId = quoteId || safeText(app.auto_selected_quote_id);
    const selectedSource = quoteId ? quoteSource : safeText(app.auto_selected_quote_source) === "guest" ? "guest" : "member";
    if (selectedId === "") {
      return NextResponse.json({ error: "확정할 견적이 없습니다." }, { status: 400 });
    }

    const selectedPriceType = safeText(body.selected_price_type) as
      | "normal"
      | "support_planned"
      | "support_confirmed"
      | "";
    let selectedPriceLabel = safeText(body.selected_price_label);
    const selectedPrice = parseInteger(body.selected_price);
    if (
      selectedPriceType !== "normal" &&
      selectedPriceType !== "support_planned" &&
      selectedPriceType !== "support_confirmed"
    ) {
      return NextResponse.json(
        { error: "선택한 견적가 종류(selected_price_type)가 필요합니다." },
        { status: 400 },
      );
    }
    if (selectedPrice == null || selectedPrice < 0) {
      return NextResponse.json(
        { error: "선택한 견적가 금액(selected_price)이 필요합니다." },
        { status: 400 },
      );
    }

    const defaultLabelByType: Record<
      "normal" | "support_planned" | "support_confirmed",
      string
    > = {
      normal: "일반견적가",
      support_planned: "지원금 할인 예정가",
      support_confirmed: "지원금 할인 적용가",
    };
    if (selectedPriceLabel === "") {
      selectedPriceLabel = defaultLabelByType[selectedPriceType];
    }

    const now = new Date().toISOString();
    const contractStatus = safeText(app.contract_status) || "pending";
    const contractStartedAt = safeText(app.contract_started_at) || now;
    const contractNumber =
      safeText(app.contract_number) ||
      (await ensureContractNumber(admin, {
        ...app,
        final_selected_at: now,
        contract_started_at: contractStartedAt,
      }));
    const legacyKind = selectedPriceTypeToLegacyKind(
      selectedPriceType as "normal" | "support_planned" | "support_confirmed",
    );
    const priceSelection = safeText(body.price_selection_kind) || legacyKind;
    const finalPatch: Record<string, unknown> = {
      final_selected_quote_id: selectedId,
      final_selected_quote_source: selectedSource,
      final_selected_at: now,
      quote_status: "final_selected",
      contact_revealed_at: now,
      contract_status: contractStatus,
      contract_started_at: contractStartedAt,
      contract_number: contractNumber,
      selected_price_type: selectedPriceType,
      selected_price_label: selectedPriceLabel,
      selected_price: selectedPrice,
      client_price_selection_kind: priceSelection,
    };
    let finalUpdate = await admin.from("applications").update(finalPatch).eq("id", applicationId);
    if (finalUpdate.error && isMissingColumnError(finalUpdate.error)) {
      const legacy = { ...finalPatch };
      delete legacy.selected_price_type;
      delete legacy.selected_price_label;
      delete legacy.selected_price;
      delete legacy.client_price_selection_kind;
      finalUpdate = await admin.from("applications").update(legacy).eq("id", applicationId);
    } else if (
      finalUpdate.error &&
      /client_price_selection_kind|selected_price/i.test(finalUpdate.error.message)
    ) {
      const legacy = { ...finalPatch };
      delete legacy.client_price_selection_kind;
      finalUpdate = await admin.from("applications").update(legacy).eq("id", applicationId);
      if (finalUpdate.error && isMissingColumnError(finalUpdate.error)) {
        const minimal = { ...legacy };
        delete minimal.selected_price_type;
        delete minimal.selected_price_label;
        delete minimal.selected_price;
        finalUpdate = await admin.from("applications").update(minimal).eq("id", applicationId);
      }
    }
    if (finalUpdate.error) {
      return NextResponse.json({ error: finalUpdate.error.message }, { status: 502 });
    }
    if (selectedPriceType === "normal") {
      await admin
        .from("sponsor_preapprovals")
        .update({ matched_reason: NORMAL_MATCH_SPONSOR_REASON })
        .eq("application_id", applicationId);
    }
    await admin
      .from(selectedSource === "member" ? "driver_quotes" : "guest_driver_quotes")
      .update(
        selectedSource === "member"
          ? { status: "final_selected" }
          : { status: "final_selected", match_result: "selected" },
      )
      .eq("id", selectedId);
    let driverPhone = "";
    let driverName = "기사님";
    if (selectedSource === "guest") {
      const { data: guestQuote } = await admin
        .from("guest_driver_quotes")
        .select("guest_phone, guest_driver_name, guest_company_name")
        .eq("id", selectedId)
        .maybeSingle();
      const guest = (guestQuote ?? {}) as Record<string, unknown>;
      driverPhone = safeText(guest.guest_phone);
      driverName = safeText(guest.guest_driver_name, safeText(guest.guest_company_name, "기사님"));
    } else {
      const { data: memberQuote } = await admin
        .from("driver_quotes")
        .select("partner_driver_id, auth_user_id")
        .eq("id", selectedId)
        .maybeSingle();
      const member = (memberQuote ?? {}) as Record<string, unknown>;
      const partnerDriverId = safeText(member.partner_driver_id);
      const authUserId = safeText(member.auth_user_id);
      const { data: partner } =
        partnerDriverId !== ""
          ? await admin
              .from("partner_drivers")
              .select("phone, manager_name, company_name")
              .eq("id", partnerDriverId)
              .maybeSingle()
          : await admin
              .from("partner_drivers")
              .select("phone, manager_name, company_name")
              .eq("auth_user_id", authUserId)
              .maybeSingle();
      const partnerRow = (partner ?? {}) as Record<string, unknown>;
      driverPhone = safeText(partnerRow.phone);
      driverName = safeText(partnerRow.manager_name, safeText(partnerRow.company_name, "기사님"));
    }
    await Promise.all([
      sendNotificationSms(admin, {
        target_type: "customer",
        target_phone: safeText(app.phone),
        target_name: safeText(app.applicant_name),
        notification_type: "final_selected_customer",
        application_id: applicationId,
        quote_id: selectedId,
        quote_source: selectedSource,
        message: `[무료전세버스] 최종 견적 선택이 완료되었습니다. 선택한 기사 연락처를 대시보드에서 확인해 주세요.`,
      }),
      driverPhone
        ? sendNotificationSms(admin, {
            target_type: selectedSource === "guest" ? "guest_driver" : "driver",
            target_phone: driverPhone,
            target_name: driverName,
            notification_type: "final_selected_driver",
            application_id: applicationId,
            quote_id: selectedId,
            quote_source: selectedSource,
            message: `[무료전세버스] 고객이 견적을 최종 선택했습니다. 대시보드에서 고객 연락처를 확인해 주세요.`,
          })
        : Promise.resolve(),
    ]);
    return NextResponse.json({ ok: true, ...(await loadPayload(admin, app)) });
  }

  return NextResponse.json({ error: "지원하지 않는 동작입니다." }, { status: 400 });
}

