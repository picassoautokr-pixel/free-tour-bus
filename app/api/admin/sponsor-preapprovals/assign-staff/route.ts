import { NextResponse } from "next/server";

import { assignSponsorPreapprovalStaff } from "@/lib/sponsor-preapproval-actions";
import { safeText } from "@/lib/sponsor";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  const admin = createServiceRoleSupabase();
  if (!sessionClient || !admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const preapprovalId = safeText(body?.preapproval_id);
  if (!preapprovalId) return NextResponse.json({ error: "preapproval_id가 필요합니다." }, { status: 400 });

  try {
    return NextResponse.json(
      await assignSponsorPreapprovalStaff(admin, {
        preapprovalId,
        assignedStaffId: body?.assigned_staff_id,
        actor: { userId: user.id, admin: true },
      }),
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
