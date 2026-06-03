import { NextResponse } from "next/server";

import { rejectSponsorPreapproval } from "@/lib/sponsor-preapproval-actions";
import { safeText } from "@/lib/sponsor";
import { assertAdminApiAccess } from "@/lib/admin-api-auth";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await assertAdminApiAccess({ strictProfileAdmin: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const preapprovalId = safeText(body?.preapproval_id);
  if (!preapprovalId) return NextResponse.json({ error: "preapproval_id가 필요합니다." }, { status: 400 });

  try {
    return NextResponse.json(
      await rejectSponsorPreapproval(admin, {
        preapprovalId,
        decisionMemo: body?.decision_memo,
        actor: { userId: auth.userId, admin: true },
      }),
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
