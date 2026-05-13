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
    | { application_id?: unknown; action?: unknown }
    | null;
  const applicationId = safeText(body?.application_id);
  const action = safeText(body?.action, "paid");
  if (applicationId === "" || !["paid", "waived"].includes(action)) {
    return NextResponse.json({ error: "요청 값이 올바르지 않습니다." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const patch =
    action === "paid"
      ? {
          deposit_status: "paid",
          deposit_confirmed_at: now,
          contract_status: "ride_confirmed",
        }
      : {
          deposit_status: "waived",
          deposit_confirmed_at: now,
          contract_status: "ride_confirmed",
        };
  const { error } = await admin.from("applications").update(patch).eq("id", applicationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  await logContractNotification(admin, {
    applicationId,
    notificationType: action === "paid" ? "deposit_paid" : "ride_confirmed",
    message: action === "paid" ? "예약금 입금이 확인되었습니다." : "예약금 면제로 배차가 확정되었습니다.",
  });
  if (action === "paid") {
    await logContractNotification(admin, {
      applicationId,
      notificationType: "ride_confirmed",
      message: "배차 확정 완료 상태로 전환되었습니다.",
    });
  }
  return NextResponse.json({ ok: true });
}
