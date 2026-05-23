/**
 * 신청(application) 단위 확정·예상 지원금 — sponsor_preapprovals fallback (UTF-8)
 */

import type { AdminSponsorDetail } from "@/lib/admin-application-detail-build";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 확정 지원금 (application → sponsor preapproval) */
export function resolveApplicationApprovedSupportTotal(
  application: Record<string, unknown>,
  sponsor?: AdminSponsorDetail | null,
): number | null {
  return (
    parseInteger(application.approved_support_amount) ??
    parseInteger(application.sponsor_approved_support_amount) ??
    sponsor?.approved_support_amount ??
    null
  );
}

/** 예상 지원금 (application → sponsor preapproval) */
export function resolveApplicationEstimatedSupportTotal(
  application: Record<string, unknown>,
  sponsor?: AdminSponsorDetail | null,
): number | null {
  return (
    parseInteger(application.estimated_support_amount) ??
    parseInteger(application.sponsor_estimated_support_amount) ??
    sponsor?.estimated_support_amount ??
    null
  );
}
