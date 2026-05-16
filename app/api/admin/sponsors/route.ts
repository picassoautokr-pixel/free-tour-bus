import { NextResponse } from "next/server";

import {
  parseSponsorStatus,
  parseSponsorSupportType,
  safeText,
} from "@/lib/sponsor";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

async function requireAdmin() {
  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  if (!sessionClient) return { error: "서버 설정 오류입니다.", status: 500 } as const;
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) return { error: "로그인이 필요합니다.", status: 401 } as const;
  const admin = createServiceRoleSupabase();
  if (!admin) return { error: "서비스 설정 오류입니다.", status: 503 } as const;
  return { admin } as const;
}

export async function GET() {
  const resolved = await requireAdmin();
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
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
  return NextResponse.json({ ok: true, sponsor: data });
}
