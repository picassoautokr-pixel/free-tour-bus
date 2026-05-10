import { NextResponse } from "next/server";
import { SolapiMessageService } from "solapi";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

/** STEP 2+: `resolveAdminRoleAccess` / `fetchProfileForAuthUser` 로 admin 검증 강화 가능. 현재는 세션만 검증. */

export const runtime = "nodejs";

/** 솔라피에 넘길 국내 휴대폰 번호 (하이픈 없이 010xxxxxxxx) */
function normalizeKoreanMobileDigits(digits: string): string | null {
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

type SendBody = {
  to?: unknown;
  text?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseRouteHandlerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "서버 설정 오류(Supabase)입니다." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const textRaw = typeof body.text === "string" ? body.text : "";
  const text = textRaw.trim();
  if (text === "") {
    return NextResponse.json({ error: "문자 내용을 입력해 주세요." }, { status: 400 });
  }

  const toRaw = typeof body.to === "string" ? body.to : "";
  const digits = toRaw.replace(/\D/g, "");
  const to = normalizeKoreanMobileDigits(digits);
  if (to == null) {
    return NextResponse.json(
      { error: "유효한 휴대폰 번호(010)가 아닙니다." },
      { status: 400 },
    );
  }

  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const from =
    process.env.SOLAPI_SENDER_NUMBER?.trim() ??
    process.env.SOLAPI_SENDER?.trim();

  if (!apiKey || !apiSecret || !from) {
    return NextResponse.json(
      {
        error:
          "솔라피 환경변수(SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER)가 설정되지 않았습니다.",
      },
      { status: 503 },
    );
  }

  try {
    const solapi = new SolapiMessageService(apiKey, apiSecret);
    await solapi.send([{ to, from, text }]);
    return NextResponse.json({ ok: true as const });
  } catch (e) {
    console.error("[solapi] send failed:", e);
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null && "toString" in e
          ? String(e)
          : "문자 발송에 실패했습니다.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
