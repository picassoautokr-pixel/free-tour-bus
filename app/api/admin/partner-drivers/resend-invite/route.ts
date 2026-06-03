import { NextResponse } from "next/server";

import {
  getPartnerSetPasswordRedirectTo,
  withExpectedEmail,
} from "@/lib/partner-login-redirect";
import { assertAdminApiAccess } from "@/lib/admin-api-auth";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

type Body = {
  /** 신규 스펙: { id: partner_driver_id } */
  id?: unknown;
  /** 하위호환 */
  partner_driver_id?: unknown;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * 제휴 기사 이메일로 초대 메일 재발송 (inviteUserByEmail).
 * 이미 동일 이메일 계정이 있으면 Supabase 가 에러를 반환할 수 있습니다.
 */
export async function POST(request: Request) {
  const auth = await assertAdminApiAccess({ strictProfileAdmin: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    console.error("[resend-invite] SUPABASE_SERVICE_ROLE_KEY 없음");
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 초대 메일 재발송을 위해 서버 환경변수를 추가해 주세요.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, {
      status: 400,
    });
  }

  const partnerDriverId = ("id" in body ? body.id : undefined) ?? body.partner_driver_id;
  if (!isNonEmptyString(partnerDriverId)) {
    return NextResponse.json({ error: "id(partner_driver_id) 가 필요합니다." }, {
      status: 400,
    });
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

  let redirectTo = getPartnerSetPasswordRedirectTo();
  if (!redirectTo) {
    redirectTo = "https://www.free-bus.co.kr/partner/set-password";
  }
  redirectTo = withExpectedEmail(redirectTo, email);

  console.log("[resend-invite] inviteUserByEmail redirectTo:", redirectTo, "email:", email);

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (invited.error) {
    console.error("[resend-invite] inviteUserByEmail failed:", invited.error.message);
    return NextResponse.json(
      {
        error: invited.error.message,
        invite_email_sent: false,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    invite_email_sent: true,
    message: "초대 메일 발송을 요청했습니다.",
  });
}
