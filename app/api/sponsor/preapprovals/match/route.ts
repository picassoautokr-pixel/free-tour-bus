import { NextResponse } from "next/server";

import { matchSponsorPreapprovals } from "@/lib/sponsor-preapproval";
import { safeText } from "@/lib/sponsor";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const applicationId = safeText(body?.application_id ?? body?.applicationId);
  if (!applicationId) {
    return NextResponse.json({ error: "application_id가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await matchSponsorPreapprovals(admin, applicationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
