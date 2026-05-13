import { NextResponse } from "next/server";

import { logContractNotification, safeText } from "@/lib/contract-deposit";
import { fetchProfileForAuthUser } from "@/lib/profile";
import { USER_ROLES, parseUserRole } from "@/lib/roles";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function requireAdmin() {
  const sessionClient = await createSupabaseRouteHandlerClient();
  if (!sessionClient) return { ok: false as const, status: 500, error: "서버 설정 오류입니다." };
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return { ok: false as const, status: 401, error: "로그인이 필요합니다." };
  const profile = await fetchProfileForAuthUser(sessionClient, user.id);
  if (profile && parseUserRole(profile.role) !== USER_ROLES.ADMIN) {
    return { ok: false as const, status: 403, error: "관리자만 접근할 수 있습니다." };
  }
  return { ok: true as const };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = createServiceRoleSupabase();
  if (!admin) return NextResponse.json({ error: "서비스 키가 없습니다." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as
    | { application_id?: unknown; memo?: unknown }
    | null;
  const applicationId = safeText(body?.application_id);
  if (applicationId === "") {
    return NextResponse.json({ error: "application_id가 필요합니다." }, { status: 400 });
  }
  const { error } = await admin
    .from("applications")
    .update({
      contract_status: "cancelled",
      contract_memo: safeText(body?.memo),
    })
    .eq("id", applicationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await logContractNotification(admin, {
    applicationId,
    notificationType: "ride_confirmed",
    message: "관리자가 계약을 취소했습니다.",
  });
  return NextResponse.json({ ok: true });
}
