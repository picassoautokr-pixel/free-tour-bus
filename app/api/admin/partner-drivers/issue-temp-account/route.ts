import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import {
  digitsOnlyKoreanMobile,
  syntheticEmailFromPhoneDigits,
} from "@/lib/partner-phone-login";
import { normalizePartnerDrivers } from "@/lib/partner-drivers-admin";
import { USER_ROLES } from "@/lib/roles";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SolapiMessageService } from "solapi";

export const runtime = "nodejs";

type Body = {
  id?: unknown;
  mode?: unknown;
};

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateFbTempPassword(): string {
  const buf = randomBytes(8);
  let s = "FB";
  for (let i = 0; i < 8; i++) {
    s += CHARSET[buf[i]! % CHARSET.length]!;
  }
  return s;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  emailLower: string,
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("[issue-temp-account] listUsers", error.message);
      return null;
    }
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === emailLower,
    );
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function upsertDriverProfile(
  admin: SupabaseClient,
  params: {
    userId: string;
    companyName: string;
    phone: string;
    email: string;
    partnerDriverId: string;
  },
): Promise<{ error: string | null }> {
  const base = {
    user_id: params.userId,
    name: params.companyName,
    phone: params.phone,
    email: params.email,
    role: USER_ROLES.DRIVER,
    partner_driver_id: params.partnerDriverId,
  };

  const { error } = await admin.from("profiles").upsert(base, {
    onConflict: "user_id",
  });
  if (!error) return { error: null };
  const msg = error.message.toLowerCase();
  if (msg.includes("partner_driver_id") || msg.includes("column")) {
    const { partner_driver_id: _p, ...rest } = base;
    const { error: e2 } = await admin.from("profiles").upsert(rest, {
      onConflict: "user_id",
    });
    return e2 ? { error: e2.message } : { error: null };
  }
  return { error: error.message };
}

function buildSmsText(params: {
  displayId: string;
  tempPassword: string;
}): string {
  return `[무료관광버스]
제휴기사 계정이 발급되었습니다.

로그인 주소:
https://www.free-bus.co.kr/partner/login

아이디:
${params.displayId}

임시 비밀번호:
${params.tempPassword}

로그인 후 비밀번호를 변경해 주세요.`;
}

async function sendSolapiSms(toDigits: string, text: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim();

  if (!apiKey || !apiSecret || !from) {
    return {
      ok: false,
      error:
        "솔라피 환경변수(SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.",
    };
  }

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to: toDigits, from, text }]);
    return { ok: true, error: null };
  } catch (e) {
    console.error("[issue-temp-account] solapi send failed:", e);
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null && "toString" in e
          ? String(e)
          : "문자 발송에 실패했습니다.";
    return { ok: false, error: msg };
  }
}

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
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 제휴기사 계정 발급을 위해 서버 환경변수를 추가해 주세요.",
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

  const partnerDriverId = body.id;
  const modeRaw = body.mode;
  if (!isNonEmptyString(partnerDriverId) || !isNonEmptyString(modeRaw)) {
    return NextResponse.json(
      { error: "id 와 mode 가 필요합니다." },
      { status: 400 },
    );
  }

  const mode = modeRaw.trim().toLowerCase();
  if (mode !== "issue" && mode !== "reset") {
    return NextResponse.json(
      { error: "mode 는 issue 또는 reset 이어야 합니다." },
      { status: 400 },
    );
  }

  const { data: rowRaw, error: fetchErr } = await admin
    .from("partner_drivers")
    .select("*")
    .eq("id", partnerDriverId.trim())
    .maybeSingle();

  if (fetchErr || rowRaw == null) {
    return NextResponse.json(
      { error: fetchErr?.message ?? "제휴 신청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const row = rowRaw as Record<string, unknown>;
  const phoneDigits = digitsOnlyKoreanMobile(String(row.phone ?? ""));
  if (!phoneDigits) {
    return NextResponse.json(
      { error: "유효한 휴대폰 번호(010)가 없습니다." },
      { status: 400 },
    );
  }

  const syntheticEmail = syntheticEmailFromPhoneDigits(phoneDigits);
  const syntheticEmailLower = syntheticEmail.toLowerCase();

  const companyName =
    String(row.company_name ?? "").trim() || "제휴 기사";
  const managerName = String(row.manager_name ?? "").trim();
  const displayName =
    companyName !== "제휴 기사" ? companyName : managerName || companyName;

  const phoneDisplay = String(row.phone ?? "").trim() || phoneDigits;

  const tempPassword = generateFbTempPassword();
  const warnings: string[] = [];

  let userId = "";

  const existingAuthId =
    row.auth_user_id != null && String(row.auth_user_id).trim() !== ""
      ? String(row.auth_user_id).trim()
      : "";

  if (existingAuthId) {
    const { error: updErr } = await admin.auth.admin.updateUserById(
      existingAuthId,
      {
        password: tempPassword,
        email_confirm: true,
      },
    );
    if (updErr) {
      console.error("[issue-temp-account] updateUserById failed:", updErr.message);
      return NextResponse.json(
        { error: `Auth 사용자 비밀번호 갱신 실패: ${updErr.message}` },
        { status: 502 },
      );
    }
    userId = existingAuthId;
  } else {
    const existingBySynthetic = await findAuthUserIdByEmail(
      admin,
      syntheticEmailLower,
    );
    if (existingBySynthetic) {
      const { error: updErr } = await admin.auth.admin.updateUserById(
        existingBySynthetic,
        {
          password: tempPassword,
          email_confirm: true,
        },
      );
      if (updErr) {
        return NextResponse.json(
          { error: `기존 계정 비밀번호 갱신 실패: ${updErr.message}` },
          { status: 502 },
        );
      }
      userId = existingBySynthetic;
    } else {
      const created = await admin.auth.admin.createUser({
        email: syntheticEmailLower,
        password: tempPassword,
        email_confirm: true,
      });
      if (created.error || !created.data.user?.id) {
        const msg =
          created.error?.message ??
          "Supabase Auth 사용자를 생성하지 못했습니다.";
        console.error("[issue-temp-account] createUser failed:", msg);
        return NextResponse.json({ error: msg }, { status: 502 });
      }
      userId = created.data.user.id;
    }
  }

  const profErr = await upsertDriverProfile(admin, {
    userId,
    companyName: displayName,
    phone: phoneDisplay,
    email: syntheticEmailLower,
    partnerDriverId: partnerDriverId.trim(),
  });
  if (profErr.error) {
    return NextResponse.json(
      { error: `profiles 저장 실패: ${profErr.error}` },
      { status: 502 },
    );
  }

  const nowIso = new Date().toISOString();
  const partnerPatch: Record<string, unknown> = {
    auth_user_id: userId,
    temporary_password_issued_at: nowIso,
    password_changed_at: null,
  };

  if (mode === "issue") {
    partnerPatch.status = "approved";
    if (row.approved_at == null || String(row.approved_at).trim() === "") {
      partnerPatch.approved_at = nowIso;
    }
  }

  const { error: pdErr } = await admin
    .from("partner_drivers")
    .update(partnerPatch)
    .eq("id", partnerDriverId.trim());

  if (
    pdErr &&
    /temporary_password_issued_at|password_changed_at|column/i.test(pdErr.message)
  ) {
    warnings.push(
      "임시 비밀번호 상태 컬럼이 없어 일부 시각을 저장하지 못했습니다. sql/partner_drivers_temporary_password.sql 을 적용해 주세요.",
    );
    const {
      temporary_password_issued_at: _tp,
      password_changed_at: _pc,
      ...rest
    } = partnerPatch;
    const { error: e2 } = await admin
      .from("partner_drivers")
      .update(rest)
      .eq("id", partnerDriverId.trim());
    if (e2) {
      return NextResponse.json(
        { error: `partner_drivers 갱신 실패: ${e2.message}` },
        { status: 502 },
      );
    }
  } else if (pdErr) {
    return NextResponse.json(
      { error: `partner_drivers 갱신 실패: ${pdErr.message}` },
      { status: 502 },
    );
  }

  const smsText = buildSmsText({
    displayId: phoneDigits,
    tempPassword,
  });
  const smsResult = await sendSolapiSms(phoneDigits, smsText);

  const smsPatch: Record<string, unknown> = {
    last_sms_error: smsResult.ok ? null : smsResult.error,
  };
  const { error: smsPatchErr } = await admin
    .from("partner_drivers")
    .update(smsPatch)
    .eq("id", partnerDriverId.trim());

  if (smsPatchErr && /last_sms_error|column/i.test(smsPatchErr.message)) {
    warnings.push(
      "last_sms_error 컬럼이 없어 문자 실패 메시지를 저장하지 못했습니다. sql/partner_drivers_temporary_password.sql 을 적용해 주세요.",
    );
  } else if (smsPatchErr) {
    warnings.push(`문자 발송 결과 저장 실패: ${smsPatchErr.message}`);
  }

  const { data: refreshed } = await admin
    .from("partner_drivers")
    .select("*")
    .eq("id", partnerDriverId.trim())
    .maybeSingle();

  const normalized = normalizePartnerDrivers(refreshed ? [refreshed] : []);

  return NextResponse.json({
    ok: true,
    mode,
    sms_sent: smsResult.ok,
    sms_error: smsResult.error,
    message: smsResult.ok
      ? "임시 비밀번호를 문자로 발송했습니다."
      : "계정은 생성되었지만 문자 발송에 실패했습니다.",
    /** 클라이언트에서 발급 직후 1회만 표시 — DB에는 저장하지 않음 */
    credentials_once: {
      login_id: phoneDigits,
      temporary_password: tempPassword,
    },
    warnings,
    partner_driver: normalized[0] ?? null,
  });
}
