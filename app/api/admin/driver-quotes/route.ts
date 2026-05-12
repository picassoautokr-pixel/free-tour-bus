import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";

import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
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
  const sessionClient = await createSupabaseRouteHandlerClient();
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

  const { data: quotesRaw, error: quotesError } = await admin
    .from("driver_quotes")
    .select(
      "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status, sponsor_support_amount, sponsor_discounted_price, sponsor_quote_enabled",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

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

  const normalized = quotes.map((raw) => {
    const row = raw as Record<string, unknown>;
    const partnerDriverId = safeText(row.partner_driver_id);
    const partner = partnerById.get(partnerDriverId);
    return {
      id: safeText(row.id),
      created_at: safeText(row.created_at),
      application_id: safeText(row.application_id),
      partner_driver_id: partnerDriverId,
      auth_user_id: safeText(row.auth_user_id),
      price: parseInteger(row.price),
      sponsor_support_amount: parseInteger(row.sponsor_support_amount),
      sponsor_discounted_price: parseInteger(row.sponsor_discounted_price),
      sponsor_quote_enabled: row.sponsor_quote_enabled === true,
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
    "id, created_at, application_id, quote_referral_id, referral_token, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status, match_result, result_notified_at, result_sms_error, linked_partner_driver_id, linked_auth_user_id";
  const guestSelectBasic =
    "id, created_at, application_id, quote_referral_id, referral_token, guest_company_name, guest_driver_name, guest_phone, price, vehicle_type, available_time, message, status, match_result, result_notified_at, result_sms_error";

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
      member_converted: resolved != null,
      linked_partner_company: resolved?.company_name ?? "",
      linked_partner_phone: resolved?.phone ?? "",
    };
  });

  return NextResponse.json({ ok: true, quotes: normalized, guest_quotes });
}

export async function PATCH(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient();
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

  let body: { guest_quote_id?: unknown; match_result?: unknown };
  try {
    body = (await request.json()) as {
      guest_quote_id?: unknown;
      match_result?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
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
