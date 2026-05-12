import { NextResponse } from "next/server";

import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function normalizeKoreanMobileDigits(value: unknown): string | null {
  const digits = safeText(value).replace(/\D/g, "");
  if (/^010\d{8}$/.test(digits)) return digits;
  if (/^8210\d{8}$/.test(digits)) return `0${digits.slice(2)}`;
  return null;
}

function formatKoreanMobile(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function statusMessage(statusRaw: string): string {
  const status = statusRaw.trim().toLowerCase();
  if (status === "approved" || status === "승인완료") {
    return "이미 승인된 제휴기사 계정입니다. 로그인 후 콜대기 페이지를 이용하실 수 있습니다.";
  }
  if (status === "reviewing" || status === "검토중") {
    return "관리자가 제출하신 정보를 검토하고 있습니다. 검토가 완료되면 안내드리겠습니다.";
  }
  if (status === "rejected" || status === "반려") {
    return "이전 제휴기사 신청이 반려되었습니다. 고객센터로 문의해 주세요.";
  }
  return "현재 신청서가 접수되어 관리자 확인을 기다리고 있습니다.";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phoneDigits = normalizeKoreanMobileDigits(searchParams.get("phone"));
  const email = safeText(searchParams.get("email"));
  const phoneFromEmail =
    email.toLowerCase().endsWith("@phone.free-bus.co.kr")
      ? normalizeKoreanMobileDigits(email.split("@")[0] ?? "")
      : null;
  const lookupPhoneDigits = phoneDigits ?? phoneFromEmail;

  if (lookupPhoneDigits == null && email === "") {
    return NextResponse.json({
      found: false,
      status: null as string | null,
      account_issued: false,
    });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  let rows: unknown[] = [];
  if (lookupPhoneDigits != null) {
    const { data, error } = await admin
      .from("partner_drivers")
      .select("status, company_name, manager_name, created_at, auth_user_id")
      .in("phone", [lookupPhoneDigits, formatKoreanMobile(lookupPhoneDigits)])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    rows = Array.isArray(data) ? data : [];
  }

  if (
    rows.length === 0 &&
    email !== "" &&
    !email.toLowerCase().endsWith("@phone.free-bus.co.kr")
  ) {
    const { data, error } = await admin
      .from("partner_drivers")
      .select("status, company_name, manager_name, created_at, auth_user_id")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    rows = Array.isArray(data) ? data : [];
  }

  const first = rows[0] as Record<string, unknown> | undefined;
  if (!first) {
    return NextResponse.json({
      found: false,
      status: null as string | null,
      account_issued: false,
    });
  }

  const status = safeText(first.status, "pending");
  const authUserId = safeText(first.auth_user_id);
  return NextResponse.json({
    found: true,
    status,
    account_issued: authUserId !== "",
    company_name: safeText(first.company_name),
    manager_name: safeText(first.manager_name),
    created_at: safeText(first.created_at),
    message: statusMessage(status),
  });
}
