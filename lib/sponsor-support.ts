import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseLike = Pick<SupabaseClient, "from">;

export type ApplicationSponsorSupportSummary = {
  approved_support_amount_total: number;
  preapproved_support_amount_total: number;
  approved_count: number;
  pending_count: number;
  rejected_count: number;
  status: "none" | "preapproved" | "approved" | "rejected" | "mixed";
};

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function safeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function deriveStatus(params: {
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
}): ApplicationSponsorSupportSummary["status"] {
  const activeKinds = [
    params.approvedCount > 0,
    params.pendingCount > 0,
    params.rejectedCount > 0,
  ].filter(Boolean).length;
  if (activeKinds > 1) return "mixed";
  if (params.approvedCount > 0) return "approved";
  if (params.pendingCount > 0) return "preapproved";
  if (params.rejectedCount > 0) return "rejected";
  return "none";
}

export async function getApprovedSponsorSupport(
  admin: SupabaseLike,
  applicationId: string,
): Promise<ApplicationSponsorSupportSummary> {
  const { data } = await admin
    .from("sponsor_preapprovals")
    .select("status, approved_support_amount, estimated_support_amount")
    .eq("application_id", applicationId);

  let approvedTotal = 0;
  let preapprovedTotal = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  for (const raw of Array.isArray(data) ? data : []) {
    const row = raw as Record<string, unknown>;
    const status = safeText(row.status);
    if (status === "approved") {
      const amount =
        parseInteger(row.approved_support_amount) ?? parseInteger(row.estimated_support_amount);
      if (amount != null && amount > 0) approvedTotal += amount;
      approvedCount += 1;
    } else if (status === "preapproved" || status === "pending") {
      const amount = parseInteger(row.estimated_support_amount);
      if (amount != null && amount > 0) preapprovedTotal += amount;
      pendingCount += 1;
    } else if (["rejected", "cancelled", "expired"].includes(status)) {
      rejectedCount += 1;
    }
  }

  return {
    approved_support_amount_total: approvedTotal,
    preapproved_support_amount_total: preapprovedTotal,
    approved_count: approvedCount,
    pending_count: pendingCount,
    rejected_count: rejectedCount,
    status: deriveStatus({ approvedCount, pendingCount, rejectedCount }),
  };
}

export async function refreshApplicationSponsorSupportSummary(
  admin: SupabaseLike,
  applicationId: string,
): Promise<ApplicationSponsorSupportSummary> {
  const summary = await getApprovedSponsorSupport(admin, applicationId);
  await admin
    .from("applications")
    .update({
      sponsor_support_status: summary.status,
      sponsor_approved_support_amount: summary.approved_support_amount_total,
      sponsor_preapproved_count: summary.pending_count,
      sponsor_approved_count: summary.approved_count,
      sponsor_rejected_count: summary.rejected_count,
      sponsor_support_updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);
  return summary;
}

export function supportLimitForQuote(params: {
  approvedSupportAmountTotal?: number | null;
  preapprovedSupportAmountTotal?: number | null;
  estimatedSupportAmount?: number | null;
}): number {
  const approved = params.approvedSupportAmountTotal ?? 0;
  if (approved > 0) return approved;
  const preapproved = params.preapprovedSupportAmountTotal ?? 0;
  if (preapproved > 0) return preapproved;
  return Math.max(0, params.estimatedSupportAmount ?? 0);
}

/** 견적 제출 시 총 예정 지원금 — 확정(approved) 금액을 예정으로 쓰지 않음 */
export function supportPlannedLimitForQuote(params: {
  preapprovedSupportAmountTotal?: number | null;
  estimatedSupportAmount?: number | null;
}): number {
  const preapproved = params.preapprovedSupportAmountTotal ?? 0;
  if (preapproved > 0) return preapproved;
  return Math.max(0, params.estimatedSupportAmount ?? 0);
}
