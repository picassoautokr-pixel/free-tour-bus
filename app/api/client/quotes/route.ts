import { NextResponse } from "next/server";

import {
  calculateAutoFinalConfirmAt,
  getQuoteAutomationSettings,
  processApplicationQuoteLifecycle,
  quoteLifecycleSelectColumns,
} from "@/lib/quote-auction";
import { ensureContractNumber } from "@/lib/contract-deposit";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

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

async function resolveApplication(admin: ReturnType<typeof createServiceRoleSupabase>, request: Request) {
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.", status: 503 } as const;
  const { searchParams } = new URL(request.url);
  const receiptNumber = safeText(searchParams.get("receipt_number"));
  const phoneDigits = digits(searchParams.get("phone"));
  if (receiptNumber === "" || phoneDigits === "") {
    return { error: "접수번호와 휴대폰번호가 필요합니다.", status: 400 } as const;
  }
  const { data, error } = await admin
    .from("applications")
    .select(
      `id, created_at, receipt_number, applicant_name, phone, departure, destination, stopovers, departure_date, departure_time, trip_type, bus_grade, passenger_count, request_message, ${quoteLifecycleSelectColumns()}, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url`,
    )
    .eq("receipt_number", receiptNumber)
    .maybeSingle();
  if (error) return { error: error.message, status: 502 } as const;
  const app = data as Record<string, unknown> | null;
  if (!app || digits(app.phone) !== phoneDigits) {
    return { error: "견적요청을 찾을 수 없습니다.", status: 404 } as const;
  }
  return { app } as const;
}

async function loadPayload(admin: NonNullable<ReturnType<typeof createServiceRoleSupabase>>, app: Record<string, unknown>) {
  const applicationId = safeText(app.id);
  await processApplicationQuoteLifecycle(admin, applicationId);
  const [{ data: latest }, { data: memberRows }, { data: guestRows }] = await Promise.all([
    admin
      .from("applications")
      .select(
        `id, created_at, receipt_number, applicant_name, phone, departure, destination, stopovers, departure_date, departure_time, trip_type, bus_grade, passenger_count, request_message, ${quoteLifecycleSelectColumns()}, contact_revealed_at, client_contract_confirmed_at, driver_contract_confirmed_at, deposit_amount, deposit_status, deposit_confirmed_at, contract_memo, contract_pdf_generated_at, contract_pdf_url`,
      )
      .eq("id", applicationId)
      .maybeSingle(),
    admin
      .from("driver_quotes")
      .select(
        "id, created_at, price, estimated_support_amount, support_discount_amount, member_price, sponsor_discounted_price, sponsor_quote_enabled, driver_support_amount, client_reward_amount, vehicle_type, available_time, message, status, partner_driver_id, partner_drivers(company_name, manager_name, phone)",
      )
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
    admin
      .from("guest_driver_quotes")
      .select("id, created_at, price, vehicle_type, available_time, message, status, match_result, guest_company_name, guest_driver_name, guest_phone")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
  ]);
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
  const quotes = [
    ...(Array.isArray(memberRows) ? memberRows : []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const partnerRaw = Array.isArray(row.partner_drivers)
        ? row.partner_drivers[0]
        : row.partner_drivers;
      const partner = partnerRaw as Record<string, unknown> | null | undefined;
      return {
        source: "member",
        id: safeText(row.id),
        company_name: safeText(partner?.company_name, "회원 기사"),
        driver_name: safeText(partner?.manager_name, "—"),
        phone:
          canRevealSelectedContact && safeText(row.id) === finalSelectedQuoteId
            ? safeText(partner?.phone)
            : "",
        price: parseInteger(row.price),
        estimated_support_amount: parseInteger(row.estimated_support_amount),
        support_discount_amount: parseInteger(row.support_discount_amount),
        member_price:
          parseInteger(row.member_price) ?? parseInteger(row.sponsor_discounted_price),
        driver_support_amount: parseInteger(row.driver_support_amount),
        client_reward_amount: parseInteger(row.client_reward_amount),
        sponsor_quote_enabled: row.sponsor_quote_enabled === true,
        vehicle_type: safeText(row.vehicle_type, "—"),
        available_time: safeText(row.available_time, "—"),
        status: safeText(row.status, "submitted"),
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
          canRevealSelectedContact && safeText(row.id) === finalSelectedQuoteId
            ? safeText(row.guest_phone)
            : "",
        price: parseInteger(row.price),
        member_price: null,
        sponsor_quote_enabled: false,
        vehicle_type: safeText(row.vehicle_type, "—"),
        available_time: safeText(row.available_time, "—"),
        status: safeText(row.status, safeText(row.match_result, "submitted")),
      };
    }),
  ];
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
  const approvedSupportAmount =
    sponsorRows
      .map((row) => parseInteger(row.approved_support_amount))
      .find((value) => value != null) ?? null;
  return {
    application: {
      id: applicationId,
      receipt_number: safeText(current.receipt_number),
      contract_number: contractNumber,
      contract_pdf_generated_at: safeText(current.contract_pdf_generated_at),
      contract_pdf_url: safeText(current.contract_pdf_url),
      departure: safeText(current.departure),
      destination: safeText(current.destination),
      stopovers: Array.isArray(current.stopovers)
        ? current.stopovers.map((item) => safeText(item)).filter(Boolean)
        : [],
      departure_date: safeText(current.departure_date),
      departure_time: safeText(current.departure_time),
      trip_type: safeText(current.trip_type),
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
      sponsor_support_status: hasApprovedSponsor
        ? "approved"
        : hasRejectedSponsor
          ? "rejected"
          : sponsorRows.length > 0
            ? "preapproved"
            : "none",
      sponsor_approved_support_amount: approvedSupportAmount,
    },
    quotes,
  };
}

export async function GET(request: Request) {
  const admin = createServiceRoleSupabase();
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
    action?: unknown;
    quote_id?: unknown;
    quote_source?: unknown;
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
    const selectedId = quoteId || safeText(app.auto_selected_quote_id);
    const selectedSource = quoteId ? quoteSource : safeText(app.auto_selected_quote_source) === "guest" ? "guest" : "member";
    if (selectedId === "") {
      return NextResponse.json({ error: "확정할 견적이 없습니다." }, { status: 400 });
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
    await admin
      .from("applications")
      .update({
        final_selected_quote_id: selectedId,
        final_selected_quote_source: selectedSource,
        final_selected_at: now,
        quote_status: "final_selected",
        contact_revealed_at: now,
        contract_status: contractStatus,
        contract_started_at: contractStartedAt,
        contract_number: contractNumber,
      })
      .eq("id", applicationId);
    await admin
      .from(selectedSource === "member" ? "driver_quotes" : "guest_driver_quotes")
      .update(
        selectedSource === "member"
          ? { status: "final_selected" }
          : { status: "final_selected", match_result: "selected" },
      )
      .eq("id", selectedId);
    return NextResponse.json({ ok: true, ...(await loadPayload(admin, app)) });
  }

  return NextResponse.json({ error: "지원하지 않는 동작입니다." }, { status: 400 });
}

