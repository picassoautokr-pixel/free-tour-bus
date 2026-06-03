import { NextResponse } from "next/server";

import {
  parseSponsorStatus,
  parseSponsorSupportType,
  safeText,
} from "@/lib/sponsor";
import { assertAdminApiAccess } from "@/lib/admin-api-auth";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function requireAdmin() {
  const auth = await assertAdminApiAccess({ strictProfileAdmin: true });
  if (!auth.ok) return { error: auth.error, status: auth.status } as const;
  const admin = createServiceRoleSupabase();
  if (!admin) return { error: "서비스 설정 오류입니다.", status: 503 } as const;
  return { admin } as const;
}

export async function GET(request: Request) {
  const resolved = await requireAdmin();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { searchParams } = new URL(request.url);
  const applicationId = safeText(searchParams.get("application_id"));
  if (applicationId) {
    const { data: preapprovalRows, error } = await resolved.admin
      .from("sponsor_preapprovals")
      .select("*")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    const preapprovals = Array.isArray(preapprovalRows) ? preapprovalRows : [];
    const companyIds = [
      ...new Set(preapprovals.map((row) => safeText((row as Record<string, unknown>).sponsor_company_id)).filter(Boolean)),
    ];
    const ruleIds = [
      ...new Set(preapprovals.map((row) => safeText((row as Record<string, unknown>).sponsor_rule_id)).filter(Boolean)),
    ];
    const staffIds = [
      ...new Set(preapprovals.map((row) => safeText((row as Record<string, unknown>).assigned_staff_id)).filter(Boolean)),
    ];
    const [{ data: companyRows }, { data: ruleRows }, { data: staffRows }] = await Promise.all([
      companyIds.length > 0
        ? resolved.admin.from("sponsor_companies").select("id, company_name").in("id", companyIds)
        : Promise.resolve({ data: [] }),
      ruleIds.length > 0
        ? resolved.admin.from("sponsor_rules").select("id, title").in("id", ruleIds)
        : Promise.resolve({ data: [] }),
      staffIds.length > 0
        ? resolved.admin.from("sponsor_staff").select("id, name, phone, role").in("id", staffIds)
        : Promise.resolve({ data: [] }),
    ]);
    const companyNameById = new Map(
      (Array.isArray(companyRows) ? companyRows : []).map((row) => [
        safeText((row as Record<string, unknown>).id),
        safeText((row as Record<string, unknown>).company_name),
      ]),
    );
    const ruleTitleById = new Map(
      (Array.isArray(ruleRows) ? ruleRows : []).map((row) => [
        safeText((row as Record<string, unknown>).id),
        safeText((row as Record<string, unknown>).title),
      ]),
    );
    const staffById = new Map(
      (Array.isArray(staffRows) ? staffRows : []).map((row) => [
        safeText((row as Record<string, unknown>).id),
        row as Record<string, unknown>,
      ]),
    );

    return NextResponse.json({
      ok: true,
      preapprovals: preapprovals.map((rowRaw) => {
        const row = rowRaw as Record<string, unknown>;
        const staff = staffById.get(safeText(row.assigned_staff_id)) ?? {};
        return {
          ...row,
          sponsor_company_name: companyNameById.get(safeText(row.sponsor_company_id)) ?? "",
          sponsor_rule_title: ruleTitleById.get(safeText(row.sponsor_rule_id)) ?? "",
          assigned_staff_name: safeText(staff.name),
          assigned_staff_phone: safeText(staff.phone),
          assigned_staff_role: safeText(staff.role),
        };
      }),
    });
  }

  const { data, error } = await resolved.admin
    .from("sponsor_companies")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, sponsors: Array.isArray(data) ? data : [] });
}

export async function PATCH(request: Request) {
  const resolved = await requireAdmin();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  const id = safeText(body.id);
  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const status = parseSponsorStatus(body.status);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    admin_memo: safeText(body.admin_memo),
    support_type: parseSponsorSupportType(body.support_type),
    updated_at: now,
  };
  if (status === "approved") patch.approved_at = now;
  if (status === "rejected") patch.rejected_at = now;

  const { data, error } = await resolved.admin
    .from("sponsor_companies")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  if (status === "approved") {
    const { ensureDefaultSponsorRuleForCompany } = await import("@/lib/sponsor-default-rule");
    await ensureDefaultSponsorRuleForCompany(resolved.admin, id);
  }

  return NextResponse.json({ ok: true, sponsor: data });
}
