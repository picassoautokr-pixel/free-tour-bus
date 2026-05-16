import { NextResponse } from "next/server";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST() {
  const sessionClient = await createSupabaseRouteHandlerClient("partner");
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

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 비밀번호 변경 시각을 저장할 수 없습니다.",
      },
      { status: 503 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("partner_drivers")
    .update({ password_changed_at: nowIso })
    .eq("auth_user_id", user.id)
    .select("id, password_changed_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `비밀번호 변경 시각 저장 실패: ${error.message}` },
      { status: 502 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "연결된 제휴기사 신청을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    password_changed_at: nowIso,
  });
}
