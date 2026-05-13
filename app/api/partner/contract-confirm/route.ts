import { NextResponse } from "next/server";

import {
  logContractNotification,
  maybeStartDepositWaiting,
  safeText,
} from "@/lib/contract-deposit";
import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function resolveDriver() {
  const sessionClient = await createSupabaseRouteHandlerClient();
  if (!sessionClient) return { ok: false as const, status: 500, error: "서버 설정 오류입니다." };
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return { ok: false as const, status: 401, error: "로그인이 필요합니다." };
  const profile = await fetchProfileForAuthUser(sessionClient, user.id);
  if (!profile || parseUserRole(profile.role) !== USER_ROLES.DRIVER) {
    return { ok: false as const, status: 403, error: "기사 계정으로 로그인해 주세요." };
  }
  return {
    ok: true as const,
    userId: user.id,
    partnerDriverId: safeText(profile.partner_driver_id),
  };
}

export async function POST(request: Request) {
  const driver = await resolveDriver();
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
  const body = (await request.json().catch(() => null)) as
    | { application_id?: unknown }
    | null;
  const applicationId = safeText(body?.application_id);
  if (applicationId === "") {
    return NextResponse.json({ error: "application_id가 필요합니다." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const app = data as Record<string, unknown> | null;
  if (!app) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });

  const quoteId = safeText(app.final_selected_quote_id);
  const quoteSource = safeText(app.final_selected_quote_source) === "guest" ? "guest" : "member";
  if (
    quoteId === "" ||
    safeText(app.contact_revealed_at) === "" ||
    !["final_selected", "contract_pending", "completed"].includes(safeText(app.quote_status))
  ) {
    return NextResponse.json({ error: "최종확정 후 계약 확인이 가능합니다." }, { status: 409 });
  }

  let ownsSelectedQuote = false;
  if (quoteSource === "member") {
    const { data: quote } = await admin
      .from("driver_quotes")
      .select("id")
      .eq("id", quoteId)
      .eq("partner_driver_id", driver.partnerDriverId)
      .maybeSingle();
    ownsSelectedQuote = !!quote;
  } else {
    const { data: partner } = await admin
      .from("partner_drivers")
      .select("phone")
      .eq("id", driver.partnerDriverId)
      .maybeSingle();
    const phoneDigits = digitsOnlyKoreanMobile(safeText((partner as { phone?: unknown } | null)?.phone));
    const phones = phoneDigits ? [phoneDigits, `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 7)}-${phoneDigits.slice(7)}`] : [];
    const { data: quote } = phones.length
      ? await admin
          .from("guest_driver_quotes")
          .select("id")
          .eq("id", quoteId)
          .in("guest_phone", phones)
          .maybeSingle()
      : { data: null };
    ownsSelectedQuote = !!quote;
  }
  if (!ownsSelectedQuote) {
    return NextResponse.json({ error: "매칭된 기사만 계약 확인이 가능합니다." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const patchedApp = { ...app, driver_contract_confirmed_at: now };
  const depositPatch = await maybeStartDepositWaiting(admin, patchedApp);
  const nextStatus =
    depositPatch.contract_status ??
    (safeText(app.client_contract_confirmed_at) !== ""
      ? "fully_confirmed"
      : "driver_confirmed");

  const { error: updateError } = await admin
    .from("applications")
    .update({
      driver_contract_confirmed_at: now,
      contract_started_at: safeText(app.contract_started_at) || now,
      contract_status: nextStatus,
      ...depositPatch,
    })
    .eq("id", applicationId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 502 });

  await logContractNotification(admin, {
    applicationId,
    notificationType: depositPatch.contract_status ? "deposit_waiting" : "contract_driver_confirmed",
    message: depositPatch.contract_status
      ? "양측 계약 확인 완료, 예약금 입금 대기 상태로 전환되었습니다."
      : "기사가 계약 내용을 확인했습니다.",
    targetType: "driver",
  });

  return NextResponse.json({ ok: true });
}
