/**
 * 신청(application) 단위 확정·예상 지원금 — snapshot · preapproval fallback (UTF-8)
 */

import type { AdminSponsorDetail } from "@/lib/admin-application-detail-build";
import { parseSupportBreakdownSnapshot } from "@/lib/support-breakdown-snapshot";

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function confirmedFromApplicationSnapshot(application: Record<string, unknown>): number | null {
  const snap = parseSupportBreakdownSnapshot(application.support_breakdown_snapshot);
  if (snap?.confirmed_total_support != null) {
    return Math.max(0, Math.trunc(snap.confirmed_total_support));
  }
  return null;
}

function plannedFromApplicationSnapshot(application: Record<string, unknown>): number | null {
  const snap = parseSupportBreakdownSnapshot(application.support_breakdown_snapshot);
  if (snap?.planned_total_support != null) {
    return Math.max(0, Math.trunc(snap.planned_total_support));
  }
  return null;
}

/** 확정 지원금: snapshot → applications 요약 → sponsor_preapprovals */
export function resolveApplicationApprovedSupportTotal(
  application: Record<string, unknown>,
  sponsor?: AdminSponsorDetail | null,
): number | null {
  return (
    confirmedFromApplicationSnapshot(application) ??
    parseInteger(application.approved_support_amount) ??
    parseInteger(application.sponsor_approved_support_amount) ??
    sponsor?.approved_support_amount ??
    null
  );
}

/** 예상 지원금: snapshot → applications → sponsor_preapprovals */
export function resolveApplicationEstimatedSupportTotal(
  application: Record<string, unknown>,
  sponsor?: AdminSponsorDetail | null,
): number | null {
  return (
    plannedFromApplicationSnapshot(application) ??
    parseInteger(application.estimated_support_amount) ??
    parseInteger(application.sponsor_estimated_support_amount) ??
    sponsor?.estimated_support_amount ??
    null
  );
}
