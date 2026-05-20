import { NextResponse } from "next/server";

import { approveSponsorPreapproval } from "@/lib/sponsor-preapproval-actions";
import { safeText } from "@/lib/sponsor";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient("sponsor");
  const admin = createServiceRoleSupabase();
  if (!sessionClient || !admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: company, error: companyError } = await admin
    .from("sponsor_companies")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (companyError || !company) {
    return NextResponse.json(
      { error: companyError?.message ?? "후원업체 정보를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (safeText((company as Record<string, unknown>).status) !== "approved") {
    return NextResponse.json({ error: "승인된 후원업체만 처리할 수 있습니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const preapprovalId = safeText(body?.preapproval_id);
  if (!preapprovalId) return NextResponse.json({ error: "preapproval_id가 필요합니다." }, { status: 400 });

  try {
    const result = await approveSponsorPreapproval(admin, {
      preapprovalId,
      approvedSupportAmount: body?.approved_support_amount,
      assignedStaffId: body?.assigned_staff_id,
      decisionMemo: body?.decision_memo,
      supportKind: body?.support_kind,
      supportFormKind: body?.support_form_kind,
      supportConditionLabel: body?.support_condition_label,
      actor: {
        userId: user.id,
        sponsorCompanyId: safeText((company as Record<string, unknown>).id),
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
