import { NextResponse } from "next/server";

import { normalizePartnerDriverStatus } from "@/lib/partner-driver-access";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function isEmailLike(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * 로그인 화면 배지용 — 이메일에 해당하는 제휴 신청 처리 상태만 반환 (비밀번호·개인정보 없음).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = String(searchParams.get("email") ?? "").trim();
  if (email === "" || !isEmailLike(email)) {
    return NextResponse.json({ status: null as string | null });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json({ status: null as string | null });
  }

  const { data, error } = await admin
    .from("partner_drivers")
    .select("status")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || typeof (data as { status?: unknown }).status !== "string") {
    return NextResponse.json({ status: null as string | null });
  }

  const st = normalizePartnerDriverStatus((data as { status: string }).status);
  return NextResponse.json({ status: st });
}
