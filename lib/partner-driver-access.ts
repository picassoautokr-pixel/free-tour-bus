import type { SupabaseClient } from "@supabase/supabase-js";

import type { Profile } from "@/lib/profile";

/** partner_drivers.status 값 — 로그인 허용은 approved 만 */
export type PartnerDriverRecordStatus =
  | "pending"
  | "reviewing"
  | "approved"
  | "rejected";

export function normalizePartnerDriverStatus(
  raw: string | null | undefined,
): PartnerDriverRecordStatus | null {
  const n = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    n === "pending" ||
    n === "reviewing" ||
    n === "approved" ||
    n === "rejected"
  ) {
    return n;
  }
  if (n === "approve") return "approved";
  if (n === "reject" || n === "denied") return "rejected";
  if (n === "review") return "reviewing";
  return null;
}

export async function fetchPartnerDriverApprovalRow(
  supabase: SupabaseClient,
  params: {
    userEmail: string | null | undefined;
    partnerDriverIdFromProfile: string | null | undefined;
  },
): Promise<{ status: PartnerDriverRecordStatus | null }> {
  const email = String(params.userEmail ?? "").trim().toLowerCase();
  const pid = String(params.partnerDriverIdFromProfile ?? "").trim();

  try {
    if (pid !== "") {
      const { data, error } = await supabase
        .from("partner_drivers")
        .select("status")
        .eq("id", pid)
        .maybeSingle();

      if (!error && data && typeof (data as { status?: unknown }).status === "string") {
        const st = normalizePartnerDriverStatus((data as { status: string }).status);
        return { status: st };
      }
    }

    if (email !== "") {
      const { data, error } = await supabase
        .from("partner_drivers")
        .select("status")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data && typeof (data as { status?: unknown }).status === "string") {
        const st = normalizePartnerDriverStatus((data as { status: string }).status);
        return { status: st };
      }
    }
  } catch {
    /* empty */
  }

  return { status: null };
}

/**
 * 기사 대시보드·로그인 후 검증: 승인된 신청과 연결되어야 함.
 */
export async function isPartnerDriverLoginAllowed(
  supabase: SupabaseClient,
  profile: Profile | null,
  userEmail: string | null | undefined,
): Promise<boolean> {
  const { status } = await fetchPartnerDriverApprovalRow(supabase, {
    userEmail,
    partnerDriverIdFromProfile: profile?.partner_driver_id ?? null,
  });
  return status === "approved";
}
