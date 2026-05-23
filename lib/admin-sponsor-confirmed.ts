/**
 * 어드민 — 스폰서 지원확정 판별 (application / preapproval / sponsor_support, UTF-8)
 */

import type { AdminSponsorDetail } from "@/lib/admin-application-detail-build";
import { isSponsorStageConfirmed, resolveSponsorStageBadge } from "@/lib/admin-progress-stage";
import { safeText } from "@/lib/sponsor";

export type AdminSponsorConfirmedResolution = {
  confirmed: boolean;
  badge: "지원확정" | "지원검토";
  source: string;
};

function statusConfirmed(status: string): boolean {
  return isSponsorStageConfirmed(status);
}

/** approved · confirmed 이면 지원확정 */
export function resolveAdminSponsorConfirmed(params: {
  application?: Record<string, unknown> | null;
  sponsor?: AdminSponsorDetail | null;
  preapprovalRows?: Record<string, unknown>[];
}): AdminSponsorConfirmedResolution {
  const application = params.application ?? {};

  const sponsorSupportStatus = safeText(application.sponsor_support_status);
  if (statusConfirmed(sponsorSupportStatus)) {
    return {
      confirmed: true,
      badge: "지원확정",
      source: `application.sponsor_support_status=${sponsorSupportStatus}`,
    };
  }

  const applicationStatus = safeText(application.status);
  if (statusConfirmed(applicationStatus)) {
    return {
      confirmed: true,
      badge: "지원확정",
      source: `application.status=${applicationStatus}`,
    };
  }

  const sponsor = params.sponsor;
  if (sponsor?.sponsor_confirmed) {
    return {
      confirmed: true,
      badge: "지원확정",
      source: "sponsor_preapproval.sponsor_confirmed",
    };
  }

  const preStatus = safeText(sponsor?.support_status);
  if (statusConfirmed(preStatus)) {
    return {
      confirmed: true,
      badge: "지원확정",
      source: `sponsor_preapproval.status=${preStatus}`,
    };
  }

  for (const row of params.preapprovalRows ?? []) {
    const rowStatus = safeText(row.status);
    if (statusConfirmed(rowStatus)) {
      return {
        confirmed: true,
        badge: "지원확정",
        source: `sponsor_preapprovals.status=${rowStatus}`,
      };
    }
  }

  const badge = resolveSponsorStageBadge(sponsorSupportStatus || preStatus);
  return {
    confirmed: false,
    badge: badge === "지원확정" ? "지원확정" : "지원검토",
    source: "default_review",
  };
}
