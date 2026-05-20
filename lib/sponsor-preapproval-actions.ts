import type { SupabaseClient } from "@supabase/supabase-js";

import { recalculateDriverQuoteSupport } from "@/lib/driver-quote-support";
import { formatWon, sendNotificationSms, siteBaseUrl } from "@/lib/notification-service";
import { parseInteger, safeText } from "@/lib/sponsor";
import { refreshApplicationSponsorSupportSummary } from "@/lib/sponsor-support";

type Actor = {
  userId: string;
  sponsorCompanyId?: string;
  admin?: boolean;
};

async function loadPreapprovalContext(
  admin: SupabaseClient,
  preapprovalId: string,
) {
  const { data: preapproval, error } = await admin
    .from("sponsor_preapprovals")
    .select("*")
    .eq("id", preapprovalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!preapproval) throw new Error("가승인 후보를 찾을 수 없습니다.");
  const p = preapproval as Record<string, unknown>;

  const [{ data: company }, { data: application }, { data: rule }] = await Promise.all([
    admin
      .from("sponsor_companies")
      .select("id, company_name")
      .eq("id", safeText(p.sponsor_company_id))
      .maybeSingle(),
    admin
      .from("applications")
      .select("id, applicant_name, phone, departure, destination, departure_date")
      .eq("id", safeText(p.application_id))
      .maybeSingle(),
    safeText(p.sponsor_rule_id)
      ? admin
          .from("sponsor_rules")
          .select("id, title")
          .eq("id", safeText(p.sponsor_rule_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    preapproval: p,
    company: (company ?? {}) as Record<string, unknown>,
    application: (application ?? {}) as Record<string, unknown>,
    rule: (rule ?? {}) as Record<string, unknown>,
  };
}

function assertOwner(ctx: { preapproval: Record<string, unknown> }, actor: Actor) {
  if (actor.admin) return;
  if (safeText(ctx.preapproval.sponsor_company_id) !== safeText(actor.sponsorCompanyId)) {
    throw new Error("해당 가승인 후보에 접근할 권한이 없습니다.");
  }
}

export async function approveSponsorPreapproval(
  admin: SupabaseClient,
  params: {
    preapprovalId: string;
    approvedSupportAmount?: unknown;
    assignedStaffId?: unknown;
    decisionMemo?: unknown;
    supportKind?: unknown;
    supportFormKind?: unknown;
    supportConditionLabel?: unknown;
    actor: Actor;
  },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);

  const now = new Date().toISOString();
  const estimated = parseInteger(ctx.preapproval.estimated_support_amount) ?? 0;
  const approvedAmount = parseInteger(params.approvedSupportAmount) ?? estimated;
  const assignedStaffId = safeText(params.assignedStaffId);

  let staff: Record<string, unknown> | null = null;
  if (assignedStaffId) {
    const { data, error } = await admin
      .from("sponsor_staff")
      .select("id, name, phone, role, sponsor_company_id")
      .eq("id", assignedStaffId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("담당자를 찾을 수 없습니다.");
    staff = data as Record<string, unknown>;
    if (safeText(staff.sponsor_company_id) !== safeText(ctx.preapproval.sponsor_company_id)) {
      throw new Error("다른 후원업체 담당자는 배정할 수 없습니다.");
    }
  }

  const patch: Record<string, unknown> = {
    status: "approved",
    approved_support_amount: approvedAmount,
    assigned_staff_id: assignedStaffId || null,
    approved_at: now,
    decided_at: now,
    decided_by: params.actor.userId,
    decision_memo: safeText(params.decisionMemo),
    staff_assigned_at: assignedStaffId ? now : null,
    payout_status: "processing",
    support_kind: safeText(params.supportKind) || null,
    support_form_kind: safeText(params.supportFormKind) || null,
    support_condition_label: safeText(params.supportConditionLabel) || null,
  };

  let { error } = await admin
    .from("sponsor_preapprovals")
    .update(patch)
    .eq("id", params.preapprovalId);
  if (
    error &&
    /payout_status|support_kind|support_form_kind|support_condition_label|does not exist|42703/i.test(
      error.message,
    )
  ) {
    const legacyPatch = { ...patch };
    delete legacyPatch.payout_status;
    delete legacyPatch.support_kind;
    delete legacyPatch.support_form_kind;
    delete legacyPatch.support_condition_label;
    const legacy = await admin
      .from("sponsor_preapprovals")
      .update(legacyPatch)
      .eq("id", params.preapprovalId);
    error = legacy.error;
  }
  if (error) throw new Error(error.message);
  const applicationId = safeText(ctx.preapproval.application_id);
  await refreshApplicationSponsorSupportSummary(admin, applicationId);
  await recalculateDriverQuoteSupport(admin, applicationId);

  await sendNotificationSms(admin, {
    target_type: "customer",
    target_phone: safeText(ctx.application.phone),
    target_name: safeText(ctx.application.applicant_name),
    notification_type: "sponsor_preapproval_approved",
    application_id: applicationId,
    quote_id: params.preapprovalId,
    quote_source: "sponsor_preapproval",
    message:
      "[무료전세버스]\n후원업체 지원금이 승인되었습니다. 견적 비교 화면에서 지원금 적용가를 확인해주세요.",
    allowDuplicate: true,
  });

  if (staff) {
    const message = `[무료전세버스]
지원금 매칭 건이 배정되었습니다.

후원업체: ${safeText(ctx.company.company_name, "후원업체")}
지원금: ${formatWon(approvedAmount)}
출발: ${safeText(ctx.application.departure)}
도착: ${safeText(ctx.application.destination)}
일시: ${safeText(ctx.application.departure_date)}

대시보드에서 확인해주세요.
${siteBaseUrl()}/sponsor/dashboard`;

    await sendNotificationSms(admin, {
      target_type: "sponsor_staff",
      target_phone: safeText(staff.phone),
      target_name: safeText(staff.name),
      notification_type: "sponsor_staff_assigned",
      application_id: safeText(ctx.preapproval.application_id),
      quote_id: params.preapprovalId,
      quote_source: "sponsor_preapproval",
      message,
      allowDuplicate: true,
    });

    const { data: latestLog } = await admin
      .from("notification_logs")
      .select("status, error, sent_at")
      .eq("quote_id", params.preapprovalId)
      .eq("quote_source", "sponsor_preapproval")
      .eq("notification_type", "sponsor_staff_assigned")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const log = (latestLog ?? {}) as Record<string, unknown>;
    await admin
      .from("sponsor_preapprovals")
      .update({
        staff_sms_sent_at: safeText(log.sent_at) || null,
        staff_sms_error: safeText(log.error) || null,
      })
      .eq("id", params.preapprovalId);
  }

  return { ok: true };
}

export async function updateApprovedSponsorPreapproval(
  admin: SupabaseClient,
  params: {
    preapprovalId: string;
    approvedSupportAmount?: unknown;
    assignedStaffId?: unknown;
    decisionMemo?: unknown;
    supportKind?: unknown;
    supportFormKind?: unknown;
    supportConditionLabel?: unknown;
    payoutStatus?: unknown;
    actor: Actor;
  },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);
  if (safeText(ctx.preapproval.status) !== "approved") {
    throw new Error("지원확정된 건만 변경할 수 있습니다.");
  }

  const approvedAmount =
    parseInteger(params.approvedSupportAmount) ??
    parseInteger(ctx.preapproval.approved_support_amount) ??
    parseInteger(ctx.preapproval.estimated_support_amount) ??
    0;
  const assignedStaffId = safeText(params.assignedStaffId);
  const payoutStatus = safeText(params.payoutStatus);
  const patch: Record<string, unknown> = {
    approved_support_amount: approvedAmount,
    assigned_staff_id: assignedStaffId || null,
    decision_memo: safeText(params.decisionMemo),
    support_kind: safeText(params.supportKind) || null,
    support_form_kind: safeText(params.supportFormKind) || null,
    support_condition_label: safeText(params.supportConditionLabel) || null,
    decided_at: new Date().toISOString(),
    decided_by: params.actor.userId,
  };
  if (payoutStatus === "processing" || payoutStatus === "completed" || payoutStatus === "pending") {
    patch.payout_status = payoutStatus;
  }

  let { error } = await admin.from("sponsor_preapprovals").update(patch).eq("id", params.preapprovalId);
  if (error && /payout_status|support_kind|does not exist|42703/i.test(error.message)) {
    const legacy = { ...patch };
    delete legacy.payout_status;
    delete legacy.support_kind;
    delete legacy.support_form_kind;
    delete legacy.support_condition_label;
    const res = await admin.from("sponsor_preapprovals").update(legacy).eq("id", params.preapprovalId);
    error = res.error;
  }
  if (error) throw new Error(error.message);

  const applicationId = safeText(ctx.preapproval.application_id);
  await refreshApplicationSponsorSupportSummary(admin, applicationId);
  await recalculateDriverQuoteSupport(admin, applicationId);
  return { ok: true };
}

export async function revertSponsorPreapprovalToPlanned(
  admin: SupabaseClient,
  params: { preapprovalId: string; actor: Actor },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);
  if (safeText(ctx.preapproval.status) !== "approved") {
    throw new Error("지원확정 건만 지원예정으로 전환할 수 있습니다.");
  }

  const { data: application } = await admin
    .from("applications")
    .select("final_selected_quote_id")
    .eq("id", safeText(ctx.preapproval.application_id))
    .maybeSingle();
  if (safeText((application as Record<string, unknown> | null)?.final_selected_quote_id)) {
    throw new Error("매칭이 완료된 지원건은 지원예정 전환할 수 없습니다.");
  }

  const { error } = await admin
    .from("sponsor_preapprovals")
    .update({
      status: "preapproved",
      approved_support_amount: null,
      approved_at: null,
      payout_status: null,
      decided_at: new Date().toISOString(),
      decided_by: params.actor.userId,
    })
    .eq("id", params.preapprovalId);
  if (error) throw new Error(error.message);

  const applicationId = safeText(ctx.preapproval.application_id);
  await refreshApplicationSponsorSupportSummary(admin, applicationId);
  await recalculateDriverQuoteSupport(admin, applicationId);
  return { ok: true };
}

export async function rejectSponsorPreapproval(
  admin: SupabaseClient,
  params: {
    preapprovalId: string;
    decisionMemo?: unknown;
    actor: Actor;
  },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);
  if (safeText(ctx.preapproval.status) === "approved") {
    const { data: application } = await admin
      .from("applications")
      .select("final_selected_quote_id")
      .eq("id", safeText(ctx.preapproval.application_id))
      .maybeSingle();
    if (safeText((application as Record<string, unknown> | null)?.final_selected_quote_id)) {
      throw new Error("매칭이 완료된 지원건은 지원취소할 수 없습니다.");
    }
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("sponsor_preapprovals")
    .update({
      status: "rejected",
      rejected_at: now,
      decided_at: now,
      decided_by: params.actor.userId,
      decision_memo: safeText(params.decisionMemo),
    })
    .eq("id", params.preapprovalId);
  if (error) throw new Error(error.message);
  const applicationId = safeText(ctx.preapproval.application_id);
  await refreshApplicationSponsorSupportSummary(admin, applicationId);
  await recalculateDriverQuoteSupport(admin, applicationId);

  await sendNotificationSms(admin, {
    target_type: "admin",
    target_phone: "admin",
    target_name: "관리자",
    notification_type: "sponsor_preapproval_rejected",
    application_id: applicationId,
    quote_id: params.preapprovalId,
    quote_source: "sponsor_preapproval",
    message: `후원업체 지원이 취소되었습니다: ${safeText(params.decisionMemo, "사유 없음")}`,
    allowDuplicate: true,
  });

  return { ok: true };
}

export async function assignSponsorPreapprovalStaff(
  admin: SupabaseClient,
  params: {
    preapprovalId: string;
    assignedStaffId: unknown;
    actor: Actor;
  },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);
  const staffId = safeText(params.assignedStaffId);
  if (!staffId) throw new Error("담당자를 선택해 주세요.");
  const { data: staff, error: staffError } = await admin
    .from("sponsor_staff")
    .select("id, sponsor_company_id")
    .eq("id", staffId)
    .maybeSingle();
  if (staffError) throw new Error(staffError.message);
  if (!staff) throw new Error("담당자를 찾을 수 없습니다.");
  if (safeText((staff as Record<string, unknown>).sponsor_company_id) !== safeText(ctx.preapproval.sponsor_company_id)) {
    throw new Error("다른 후원업체 담당자는 배정할 수 없습니다.");
  }
  const { error } = await admin
    .from("sponsor_preapprovals")
    .update({
      assigned_staff_id: staffId,
      staff_assigned_at: new Date().toISOString(),
      decided_by: params.actor.userId,
    })
    .eq("id", params.preapprovalId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
