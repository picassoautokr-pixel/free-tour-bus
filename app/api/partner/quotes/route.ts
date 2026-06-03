import { NextResponse } from "next/server";

import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import {
  resolveApprovedDriver,
  handlePartnerQuotePost,
  handlePartnerQuotePatch,
  type PartnerQuoteBody,
} from "@/lib/partner-quotes-handlers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const driver = await resolveApprovedDriver();
  if (!driver.ok) {
    return NextResponse.json({ error: driver.error }, { status: driver.status });
  }

  let body: PartnerQuoteBody;
  try {
    body = (await request.json()) as PartnerQuoteBody;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  return handlePartnerQuotePost(admin, driver, body);
}

export async function PATCH(request: Request) {
  const driver = await resolveApprovedDriver();
  if (!driver.ok) {
    return NextResponse.json({ error: driver.error }, { status: driver.status });
  }

  let body: PartnerQuoteBody;
  try {
    body = (await request.json()) as PartnerQuoteBody;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  return handlePartnerQuotePatch(admin, driver, body);
}
