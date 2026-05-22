import type { SupabaseClient } from "@supabase/supabase-js";

import { recalculateDriverQuoteSupport } from "@/lib/driver-quote-support";
import { formatWon, sendNotificationSms, siteBaseUrl } from "@/lib/notification-service";
import {
  ruleSupportConditionLabel,
  ruleSupportFormLabel,
  type SponsorRuleRecord,
} from "@/lib/sponsor-rule-helpers";
import { parseInteger, safeText, sponsorSupportTypeLabel } from "@/lib/sponsor";
import { refreshQuoteSnapshotsAfterSponsorConfirm } from "@/lib/support-breakdown-snapshot";
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

async function assertNotLockedAfterMatch(
  admin: SupabaseClient,
  applicationId: string,
  actor: Actor,
) {
  if (actor.admin) return;
  const { data: application } = await admin
    .from("applications")
    .select("final_selected_quote_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (safeText((application as Record<string, unknown> | null)?.final_selected_quote_id)) {
    throw new Error("매칭완료 후에는 지원종류·지원금·담당자를 변경할 수 없습니다.");
  }
}

async function loadRuleById(
  admin: SupabaseClient,
  ruleId: string,
): Promise<SponsorRuleRecord | null> {
  if (!ruleId) return null;
  const { data } = await admin.from("sponsor_rules").select("*").eq("id", ruleId).maybeSingle();
  return data ? (data as SponsorRuleRecord) : null;
}

function buildConfirmSnapshotPatch(params: {
  rule: SponsorRuleRecord | null;
  plannedTotal: number;
  confirmedTotal: number;
  staff: Record<string, unknown> | null;
  supportKind?: string;
  supportFormKind?: string;
  supportConditionLabel?: string;
  sponsorRuleId?: string;
  supportSettlementMode?: string;
}): Record<string, unknown> {
  const rule = params.rule;
  const ruleName = safeText(params.supportKind) || safeText(rule?.title);
  return {
    planned_total_support: params.plannedTotal,
    approved_support_amount: params.confirmedTotal,
    sponsor_rule_id: params.sponsorRuleId || safeText(rule?.id) || null,
    sponsor_rule_name: ruleName || null,
    support_kind: ruleName || null,
    support_form_kind:
      safeText(params.supportFormKind) ||
      (rule ? ruleSupportFormLabel(rule) : "") ||
      null,
    support_condition_label:
      safeText(params.supportConditionLabel) ||
      (rule ? ruleSupportConditionLabel(rule) : "") ||
      null,
    support_settlement_mode: safeText(params.supportSettlementMode) || "client_priority",
    manager_name: params.staff ? safeText(params.staff.name) : null,
    manager_phone: params.staff ? safeText(params.staff.phone) : null,
  };
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
    sponsorRuleId?: unknown;
    plannedTotalSupport?: unknown;
    sponsorRuleName?: unknown;
    supportSettlementMode?: unknown;
    supportType?: unknown;
    actor: Actor;
  },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);

  const now = new Date().toISOString();
  const estimated = parseInteger(ctx.preapproval.estimated_support_amount) ?? 0;
  const plannedTotal = parseInteger(params.plannedTotalSupport) ?? estimated;
  const approvedAmount = parseInteger(params.approvedSupportAmount) ?? plannedTotal;
  const assignedStaffId = safeText(params.assignedStaffId);
  const ruleId = safeText(params.sponsorRuleId) || safeText(ctx.preapproval.sponsor_rule_id);
  const rule = await loadRuleById(admin, ruleId);

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
    assigned_staff_id: assignedStaffId || null,
    approved_at: now,
    decided_at: now,
    decided_by: params.actor.userId,
    decision_memo: safeText(params.decisionMemo),
    staff_assigned_at: assignedStaffId ? now : null,
    payout_status: "processing",
    ...buildConfirmSnapshotPatch({
      rule,
      plannedTotal,
      confirmedTotal: approvedAmount,
      staff,
      supportKind: safeText(params.sponsorRuleName) || safeText(params.supportKind),
      supportFormKind: safeText(params.supportFormKind) || (rule ? ruleSupportFormLabel(rule) : ""),
      supportConditionLabel:
        safeText(params.supportConditionLabel) ||
        (rule ? ruleSupportConditionLabel(rule) : ""),
      sponsorRuleId: ruleId,
      supportSettlementMode: safeText(params.supportSettlementMode),
    }),
  };
  if (params.supportType && rule) {
    patch.support_form_kind = sponsorSupportTypeLabel(params.supportType);
  }

  let { error } = await admin
    .from("sponsor_preapprovals")
    .update(patch)
    .eq("id", params.preapprovalId);
  if (error && /does not exist|42703|column/i.test(error.message)) {
    const legacyPatch = { ...patch };
    for (const key of [
      "payout_status",
      "support_kind",
      "support_form_kind",
      "support_condition_label",
      "sponsor_rule_id",
      "planned_total_support",
      "sponsor_rule_name",
      "support_settlement_mode",
      "manager_name",
      "manager_phone",
    ]) {
      delete legacyPatch[key];
    }
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
  await refreshQuoteSnapshotsAfterSponsorConfirm(admin, applicationId);

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
    sponsorRuleId?: unknown;
    plannedTotalSupport?: unknown;
    sponsorRuleName?: unknown;
    supportSettlementMode?: unknown;
    payoutStatus?: unknown;
    actor: Actor;
  },
) {
  const ctx = await loadPreapprovalContext(admin, params.preapprovalId);
  assertOwner(ctx, params.actor);
  if (safeText(ctx.preapproval.status) !== "approved") {
    throw new Error("지원확정된 건만 변경할 수 있습니다.");
  }
  const applicationId = safeText(ctx.preapproval.application_id);
  await assertNotLockedAfterMatch(admin, applicationId, params.actor);

  const approvedAmount =
    parseInteger(params.approvedSupportAmount) ??
    parseInteger(ctx.preapproval.approved_support_amount) ??
    parseInteger(ctx.preapproval.estimated_support_amount) ??
    0;
  const assignedStaffId = safeText(params.assignedStaffId);
  const payoutStatus = safeText(params.payoutStatus);
  const plannedTotal =
    parseInteger(params.plannedTotalSupport) ??
    parseInteger(ctx.preapproval.planned_total_support) ??
    parseInteger(ctx.preapproval.estimated_support_amount) ??
    0;
  const ruleId = safeText(params.sponsorRuleId) || safeText(ctx.preapproval.sponsor_rule_id);
  const rule = await loadRuleById(admin, ruleId);

  let staff: Record<string, unknown> | null = null;
  if (assignedStaffId) {
    const { data } = await admin
      .from("sponsor_staff")
      .select("id, name, phone, sponsor_company_id")
      .eq("id", assignedStaffId)
      .maybeSingle();
    staff = (data ?? null) as Record<string, unknown> | null;
  }

  const patch: Record<string, unknown> = {
    assigned_staff_id: assignedStaffId || null,
    decision_memo: safeText(params.decisionMemo),
    decided_at: new Date().toISOString(),
    decided_by: params.actor.userId,
    ...buildConfirmSnapshotPatch({
      rule,
      plannedTotal,
      confirmedTotal: approvedAmount,
      staff,
      supportKind: safeText(params.sponsorRuleName) || safeText(params.supportKind),
      supportFormKind: safeText(params.supportFormKind),
      supportConditionLabel: safeText(params.supportConditionLabel),
      sponsorRuleId: ruleId,
      supportSettlementMode: safeText(params.supportSettlementMode),
    }),
  };
  if (payoutStatus === "processing" || payoutStatus === "completed" || payoutStatus === "pending") {
    patch.payout_status = payoutStatus;
  }

  let { error } = await admin.from("sponsor_preapprovals").update(patch).eq("id", params.preapprovalId);
  if (error && /does not exist|42703|column/i.test(error.message)) {
    const legacy = { ...patch };
    for (const key of [
      "payout_status",
      "support_kind",
      "support_form_kind",
      "support_condition_label",
      "sponsor_rule_id",
      "planned_total_support",
      "sponsor_rule_name",
      "support_settlement_mode",
      "manager_name",
      "manager_phone",
    ]) {
      delete legacy[key];
    }
    const res = await admin.from("sponsor_preapprovals").update(legacy).eq("id", params.preapprovalId);
    error = res.error;
  }
  if (error) throw new Error(error.message);

  await refreshApplicationSponsorSupportSummary(admin, applicationId);
  await recalculateDriverQuoteSupport(admin, applicationId);
  await refreshQuoteSnapshotsAfterSponsorConfirm(admin, applicationId);
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
