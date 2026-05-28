import { NextResponse } from "next/server";

import { logAdminAction } from "@/lib/admin-action-log";
import { safeText } from "@/lib/sponsor";
import { refreshQuoteSnapshotsAfterSponsorConfirm } from "@/lib/support-breakdown-snapshot";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function PATCH(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  const admin = createServiceRoleSupabase();
  if (!sessionClient || !admin) {
    return NextResponse.json({ error: "서버 설정 오류입니다." }, { status: 500 });
  }

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const preapprovalId = safeText(body?.preapproval_id ?? "");
  if (!preapprovalId) {
    return NextResponse.json({ error: "preapproval_id가 필요합니다." }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await admin
    .from("sponsor_preapprovals")
    .select("id, application_id, estimated_support_amount, approved_support_amount, status, decision_memo")
    .eq("id", preapprovalId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 502 });
  if (!existing) return NextResponse.json({ error: "스폰서 가승인 정보를 찾을 수 없습니다." }, { status: 404 });

  const existingRow = existing as Record<string, unknown>;
  const applicationId = safeText(existingRow.application_id ?? "");

  const patch: Record<string, unknown> = {};

  const newEstimated = parseInteger(body?.estimated_support_amount);
  if (newEstimated !== null) patch.estimated_support_amount = newEstimated;

  const newApproved = parseInteger(body?.approved_support_amount);
  if (newApproved !== null) {
    patch.approved_support_amount = newApproved;
    if (!patch.approved_at) patch.approved_at = new Date().toISOString();
  }

  const supportKind = body?.support_kind !== undefined ? safeText(body.support_kind) : undefined;
  if (supportKind !== undefined) patch.support_kind = supportKind;

  const supportCondition = body?.support_condition !== undefined ? safeText(body.support_condition) : undefined;
  if (supportCondition !== undefined) patch.support_condition = supportCondition;

  const supportType = body?.support_type !== undefined ? safeText(body.support_type) : undefined;
  if (supportType !== undefined) patch.support_type = supportType;

  const decisionMemo = body?.decision_memo !== undefined ? safeText(body.decision_memo) : undefined;
  if (decisionMemo !== undefined) patch.decision_memo = decisionMemo;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });
  }

  const { error: updateErr } = await admin
    .from("sponsor_preapprovals")
    .update(patch)
    .eq("id", preapprovalId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 502 });
  }

  if (newApproved !== null && applicationId) {
    await refreshQuoteSnapshotsAfterSponsorConfirm(admin, applicationId);
  }

  await logAdminAction(admin, {
    adminEmail: user.email ?? null,
    actionType: "sponsor_edit",
    targetTable: "sponsor_preapprovals",
    targetId: preapprovalId,
    beforeJson: {
      estimated_support_amount: existingRow.estimated_support_amount,
      approved_support_amount: existingRow.approved_support_amount,
      decision_memo: existingRow.decision_memo,
    },
    afterJson: patch,
  });

  return NextResponse.json({ ok: true });
}
