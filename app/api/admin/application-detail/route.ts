import { NextResponse } from "next/server";

import {
  fetchAdminDetailBasic,
  fetchAdminDetailDebug,
  fetchAdminDetailQuotes,
  fetchAdminDetailSms,
  fetchAdminDetailSponsor,
} from "@/lib/admin-application-detail-sections";
import { sanitizeOperationalError } from "@/lib/operational-error-message";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const SECTIONS = new Set(["basic", "quotes", "sms", "sponsor", "debug"]);

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

export async function GET(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  if (!sessionClient) {
    return NextResponse.json(
      { error: "서버 설정 오류(Supabase)입니다." },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const applicationId = safeText(searchParams.get("application_id"));
  const section = safeText(searchParams.get("section"), "basic");

  if (applicationId === "") {
    return NextResponse.json({ error: "application_id가 필요합니다." }, { status: 400 });
  }
  if (!SECTIONS.has(section)) {
    return NextResponse.json({ error: "section 값이 올바르지 않습니다." }, { status: 400 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const serverDebugEnabled =
    process.env.NEXT_PUBLIC_ENABLE_QUOTE_DEBUG === "true" ||
    process.env.QUOTE_SUPPORT_SNAPSHOT_DEBUG === "true";

  if (section === "debug" && !serverDebugEnabled) {
    return NextResponse.json({ error: "디버그 모드가 비활성화되어 있습니다." }, { status: 403 });
  }

  try {
    if (section === "basic") {
      const basic = await fetchAdminDetailBasic(admin, applicationId);
      return NextResponse.json({ ok: true, section: "basic", basic });
    }
    if (section === "quotes") {
      const includeDebug = serverDebugEnabled && searchParams.get("debug") === "true";
      const quotes = await fetchAdminDetailQuotes(admin, applicationId, undefined, includeDebug);
      return NextResponse.json({ ok: true, section: "quotes", quotes });
    }
    if (section === "sponsor") {
      const sponsor = await fetchAdminDetailSponsor(admin, applicationId);
      return NextResponse.json({ ok: true, section: "sponsor", sponsor });
    }
    if (section === "sms") {
      const sms_logs = await fetchAdminDetailSms(admin, applicationId);
      return NextResponse.json({ ok: true, section: "sms", sms_logs });
    }
    const debug = await fetchAdminDetailDebug(admin, applicationId, undefined);
    return NextResponse.json({ ok: true, section: "debug", debug });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "상세 조회에 실패했습니다.";
    const error = sanitizeOperationalError(
      raw,
      "견적 데이터를 불러오는 중 문제가 발생했습니다.",
    );
    return NextResponse.json(
      {
        error,
        ...(serverDebugEnabled || process.env.NODE_ENV !== "production"
          ? { debug_error: raw }
          : {}),
      },
      { status: 502 },
    );
  }
}
