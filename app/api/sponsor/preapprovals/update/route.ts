import { NextResponse } from "next/server";

import {
  approveSponsorPreapproval,
  rejectSponsorPreapproval,
  revertSponsorPreapprovalToPlanned,
  updateApprovedSponsorPreapproval,
} from "@/lib/sponsor-preapproval-actions";
import { safeText } from "@/lib/sponsor";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function resolveCompany() {
  const sessionClient = await createSupabaseRouteHandlerClient("sponsor");
  const admin = createServiceRoleSupabase();
  if (!sessionClient || !admin) {
    return { error: "서버 설정 오류입니다.", status: 500 } as const;
  }
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return { error: "로그인이 필요합니다.", status: 401 } as const;

  const { data: company, error } = await admin
    .from("sponsor_companies")
    .select("id, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || !company) {
    return { error: error?.message ?? "후원업체 정보를 찾을 수 없습니다.", status: 404 } as const;
  }
  if (safeText((company as Record<string, unknown>).status) !== "approved") {
    return { error: "승인된 후원업체만 처리할 수 있습니다.", status: 403 } as const;
  }
  return {
    admin,
    userId: user.id,
    companyId: safeText((company as Record<string, unknown>).id),
  } as const;
}

export async function POST(request: Request) {
  const resolved = await resolveCompany();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = safeText(body?.action);
  const preapprovalId = safeText(body?.preapproval_id);
  if (!preapprovalId) {
    return NextResponse.json({ error: "preapproval_id가 필요합니다." }, { status: 400 });
  }

  const actor = { userId: resolved.userId, sponsorCompanyId: resolved.companyId };

  try {
    if (action === "approve") {
      const result = await approveSponsorPreapproval(resolved.admin, {
        preapprovalId,
        approvedSupportAmount: body?.approved_support_amount,
        assignedStaffId: body?.assigned_staff_id,
        decisionMemo: body?.decision_memo,
        supportKind: body?.support_kind,
        supportFormKind: body?.support_form_kind,
        supportConditionLabel: body?.support_condition_label,
        actor,
      });
      return NextResponse.json(result);
    }
    if (action === "reject") {
      const result = await rejectSponsorPreapproval(resolved.admin, {
        preapprovalId,
        decisionMemo: body?.decision_memo,
        actor,
      });
      return NextResponse.json(result);
    }
    if (action === "change") {
      const result = await updateApprovedSponsorPreapproval(resolved.admin, {
        preapprovalId,
        approvedSupportAmount: body?.approved_support_amount,
        assignedStaffId: body?.assigned_staff_id,
        decisionMemo: body?.decision_memo,
        supportKind: body?.support_kind,
        supportFormKind: body?.support_form_kind,
        supportConditionLabel: body?.support_condition_label,
        payoutStatus: body?.payout_status,
        actor,
      });
      return NextResponse.json(result);
    }
    if (action === "revert") {
      const result = await revertSponsorPreapprovalToPlanned(resolved.admin, {
        preapprovalId,
        actor,
      });
      return NextResponse.json(result);
    }
    if (action === "payout") {
      const result = await updateApprovedSponsorPreapproval(resolved.admin, {
        preapprovalId,
        payoutStatus: body?.payout_status,
        actor,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
