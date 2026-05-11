import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePartnerDriverStatus } from "@/lib/partner-driver-access";
import { digitsOnlyKoreanMobile } from "@/lib/partner-phone-login";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function hyphenPhoneFromDigits(d: string): string {
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

async function fetchPartnerStatusByPhone(
  admin: SupabaseClient,
  digits: string,
): Promise<{ status: string; accountIssued: boolean } | null> {
  const hyphen = hyphenPhoneFromDigits(digits);

  const tryEq = async (phoneVal: string) => {
    const { data, error } = await admin
      .from("partner_drivers")
      .select("status, auth_user_id")
      .eq("phone", phoneVal)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data || typeof (data as { status?: unknown }).status !== "string") {
      return null;
    }
    const row = data as { status: string; auth_user_id?: unknown };
    return {
      status: row.status,
      accountIssued:
        row.auth_user_id != null && String(row.auth_user_id).trim() !== "",
    };
  };

  const a = await tryEq(digits);
  if (a != null) return a;
  const b = await tryEq(hyphen);
  if (b != null) return b;

  return null;
}

/**
 * 로그인 화면 배지용 — 제휴 신청 처리 상태만 반환 (비밀번호·개인정보 없음).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const emailRaw = String(searchParams.get("email") ?? "").trim();
  const phoneRaw = String(searchParams.get("phone") ?? "").trim();

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json({ status: null as string | null });
  }

  let found:
    | {
        status: string;
        accountIssued: boolean;
      }
    | null = null;

  const phoneDigits =
    phoneRaw !== ""
      ? digitsOnlyKoreanMobile(phoneRaw)
      : emailRaw.toLowerCase().endsWith("@phone.free-bus.co.kr")
        ? digitsOnlyKoreanMobile(emailRaw.split("@")[0] ?? "")
        : null;

  if (phoneDigits) {
    found = await fetchPartnerStatusByPhone(admin, phoneDigits);
  }

  if (
    found == null &&
    emailRaw !== "" &&
    isEmailLike(emailRaw) &&
    !emailRaw.toLowerCase().endsWith("@phone.free-bus.co.kr")
  ) {
    const { data, error } = await admin
      .from("partner_drivers")
      .select("status, auth_user_id")
      .ilike("email", emailRaw)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data && typeof (data as { status?: unknown }).status === "string") {
      const row = data as { status: string; auth_user_id?: unknown };
      found = {
        status: row.status,
        accountIssued:
          row.auth_user_id != null && String(row.auth_user_id).trim() !== "",
      };
    }
  }

  if (found == null) {
    return NextResponse.json({
      status: null as string | null,
      account_issued: false,
    });
  }

  const st = normalizePartnerDriverStatus(found.status);
  return NextResponse.json({ status: st, account_issued: found.accountIssued });
}
