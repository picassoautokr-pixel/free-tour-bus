import { NextResponse } from "next/server";

import { getPartnerSetPasswordRedirectTo } from "@/lib/partner-login-redirect";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";

type Body = {
  /** { id: partner_driver_id } */
  id?: unknown;
  /** 하위호환 */
  partner_driver_id?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * 비밀번호 설정/재설정 메일 발송.
 * Supabase Auth recovery 이메일을 보내고 redirectTo 를 /partner/set-password 로 고정합니다.
 */
export async function POST(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient();
  if (!sessionClient) {
    return NextResponse.json(
      { error: "서버 설정 오류(Supabase)입니다." },
      { status: 500 },
    );
  }

  const {
    data: { user: sessionUser },
  } = await sessionClient.auth.getUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    console.error("[password-reset] SUPABASE_SERVICE_ROLE_KEY 없음");
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 비밀번호 설정메일 발송을 위해 서버 환경변수를 추가해 주세요.",
      },
      { status: 503 },
    );
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

  const partnerDriverId =
    ("id" in body ? body.id : undefined) ?? body.partner_driver_id;
  if (!isNonEmptyString(partnerDriverId)) {
    return NextResponse.json(
      { error: "id(partner_driver_id) 가 필요합니다." },
      { status: 400 },
    );
  }

  const { data: rowRaw, error: fetchErr } = await admin
    .from("partner_drivers")
    .select("email")
    .eq("id", partnerDriverId.trim())
    .maybeSingle();

  if (fetchErr || rowRaw == null) {
    return NextResponse.json(
      { error: fetchErr?.message ?? "신청 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const email = String((rowRaw as { email?: unknown }).email ?? "").trim();
  if (email === "") {
    return NextResponse.json({ error: "이메일이 없습니다." }, { status: 400 });
  }

  const redirectTo =
    getPartnerSetPasswordRedirectTo() ||
    "https://www.free-bus.co.kr/partner/set-password";

  console.log(
    "[password-reset] resetPasswordForEmail redirectTo:",
    redirectTo,
    "email:",
    email,
  );

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error("[password-reset] resetPasswordForEmail failed:", error.message);
    return NextResponse.json(
      {
        error: error.message,
        password_reset_email_sent: false,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    password_reset_email_sent: true,
    message: "비밀번호 설정메일 발송을 요청했습니다.",
  });
}

