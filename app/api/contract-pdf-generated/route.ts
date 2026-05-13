import { NextResponse } from "next/server";

import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function safeText(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  return s;
}

function digits(value: unknown): string {
  return safeText(value).replace(/\D/g, "");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const applicationId = safeText(body?.applicationId);
  const receiptNumber = safeText(body?.receiptNumber);
  const phoneDigits = digits(body?.phone);
  if (applicationId === "") {
    return NextResponse.json({ ok: false, error: "신청 정보가 없습니다." }, { status: 400 });
  }

  const authClient = await createSupabaseRouteHandlerClient();
  const { data: authData } = authClient
    ? await authClient.auth.getUser()
    : { data: { user: null } };
  const user = authData.user;
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data: application, error: applicationError } = await admin
    .from("applications")
    .select("id, user_id, receipt_number, phone, final_selected_quote_id, final_selected_quote_source")
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError || !application) {
    return NextResponse.json({ ok: false, error: "신청서를 찾을 수 없습니다." }, { status: 404 });
  }

  const finalQuoteId = safeText(application.final_selected_quote_id);
  if (finalQuoteId === "") {
    return NextResponse.json({ ok: false, error: "최종 매칭 후 이용할 수 있습니다." }, { status: 403 });
  }

  const { data: roleRows } = user
    ? await admin.from("user_roles").select("role").eq("user_id", user.id)
    : { data: null };
  const profile = user && authClient ? await fetchProfileForAuthUser(authClient, user.id) : null;
  const isAdmin =
    Array.isArray(roleRows) && roleRows.some((row) => safeText(row.role) === "admin") ||
    parseUserRole(profile?.role) === USER_ROLES.ADMIN;
  const isOwner = user != null && safeText(application.user_id) === user.id;
  const isClientLookup =
    receiptNumber !== "" &&
    phoneDigits !== "" &&
    safeText(application.receipt_number) === receiptNumber &&
    digits(application.phone) === phoneDigits;

  let isMatchedPartner = false;
  if (user && profile && !isAdmin && !isOwner) {
    const partnerDriverId = safeText(profile.partner_driver_id);
    const quoteSource = safeText(application.final_selected_quote_source) === "guest" ? "guest" : "member";
    if (quoteSource === "member" && partnerDriverId !== "") {
      const { data: driverQuote } = await admin
        .from("driver_quotes")
        .select("id")
        .eq("id", finalQuoteId)
        .eq("partner_driver_id", partnerDriverId)
        .maybeSingle();
      isMatchedPartner = Boolean(driverQuote);
    } else if (quoteSource === "guest" && partnerDriverId !== "") {
      const { data: partner } = await admin
        .from("partner_drivers")
        .select("phone")
        .eq("id", partnerDriverId)
        .maybeSingle();
      const partnerDigits = digitsOnlyKoreanMobile(safeText(partner?.phone));
      const phones = partnerDigits
        ? [
            partnerDigits,
            `${partnerDigits.slice(0, 3)}-${partnerDigits.slice(3, 7)}-${partnerDigits.slice(7)}`,
          ]
        : [];
      const { data: guestQuote } = phones.length
        ? await admin
            .from("guest_driver_quotes")
            .select("id")
            .eq("id", finalQuoteId)
            .in("guest_phone", phones)
            .maybeSingle()
        : { data: null };
      isMatchedPartner = Boolean(guestQuote);
    }
  }

  if (!isAdmin && !isOwner && !isMatchedPartner && !isClientLookup) {
    return NextResponse.json({ ok: false, error: "PDF 생성 권한이 없습니다." }, { status: 403 });
  }

  const generatedAt = new Date().toISOString();
  const { error: updateError } = await admin
    .from("applications")
    .update({ contract_pdf_generated_at: generatedAt })
    .eq("id", applicationId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, contract_pdf_generated_at: generatedAt });
}
