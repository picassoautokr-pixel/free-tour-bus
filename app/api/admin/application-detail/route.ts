import { NextResponse } from "next/server";

import {
  fetchAdminDetailBasic,
  fetchAdminDetailDebug,
  fetchAdminDetailQuotesResilient,
  fetchAdminDetailSms,
  fetchAdminDetailSponsor,
} from "@/lib/admin-application-detail-sections";
import { assertAdminApiAccess, type AdminApiAuthDebug } from "@/lib/admin-api-auth";
import { sanitizeOperationalError } from "@/lib/operational-error-message";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const SECTIONS = new Set(["basic", "quotes", "sms", "sponsor", "debug", "all"]);

const QUOTES_USER_MESSAGE = "견적 데이터를 불러오는 중 문제가 발생했습니다.";

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function isDebugResponse(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_QUOTE_DEBUG === "true" ||
    process.env.QUOTE_SUPPORT_SNAPSHOT_DEBUG === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function attachDebugFields<T extends Record<string, unknown>>(
  body: T,
  authDebug: AdminApiAuthDebug,
): T & { auth_debug?: AdminApiAuthDebug } {
  if (!isDebugResponse()) return body;
  return { ...body, auth_debug: authDebug };
}

function jsonAuthFailure(auth: Extract<Awaited<ReturnType<typeof assertAdminApiAccess>>, { ok: false }>) {
  const error = sanitizeOperationalError(auth.error, QUOTES_USER_MESSAGE);
  return NextResponse.json(
    attachDebugFields(
      {
        ok: false,
        error,
        denied_reason: auth.debug.denied_reason,
        which_check_failed: auth.debug.which_check_failed,
        ...(isDebugResponse() ? { error_detail: auth.error } : {}),
      },
      auth.debug,
    ),
    { status: auth.status },
  );
}

export async function GET(request: Request) {
  const auth = await assertAdminApiAccess({ strictProfileAdmin: false });
  if (!auth.ok) {
    return jsonAuthFailure(auth);
  }

  const { searchParams } = new URL(request.url);
  const applicationId = safeText(searchParams.get("application_id"));
  const sectionParam = safeText(searchParams.get("section"));
  const section = sectionParam === "" ? "basic" : sectionParam;

  if (applicationId === "") {
    return NextResponse.json(
      attachDebugFields({ ok: false, error: "application_id가 필요합니다." }, auth.debug),
      { status: 400 },
    );
  }
  if (!SECTIONS.has(section)) {
    return NextResponse.json(
      attachDebugFields({ ok: false, error: "section 값이 올바르지 않습니다." }, auth.debug),
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      attachDebugFields(
        {
          ok: false,
          error: sanitizeOperationalError(
            "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.",
            QUOTES_USER_MESSAGE,
          ),
        },
        auth.debug,
      ),
      { status: 503 },
    );
  }

  const serverDebugEnabled =
    process.env.NEXT_PUBLIC_ENABLE_QUOTE_DEBUG === "true" ||
    process.env.QUOTE_SUPPORT_SNAPSHOT_DEBUG === "true";

  const includeDebug = serverDebugEnabled && searchParams.get("debug") === "true";

  try {
    if (section === "basic") {
      const basic = await fetchAdminDetailBasic(admin, applicationId);
      return NextResponse.json(
        attachDebugFields({ ok: true, section: "basic", basic }, auth.debug),
      );
    }

    if (section === "quotes" || section === "all") {
      const quotes = await fetchAdminDetailQuotesResilient(
        admin,
        applicationId,
        undefined,
        includeDebug,
      );
      if (section === "quotes") {
        return NextResponse.json(
          attachDebugFields({ ok: true, section: "quotes", quotes }, auth.debug),
        );
      }
      let basic;
      try {
        basic = await fetchAdminDetailBasic(admin, applicationId);
      } catch (basicErr) {
        const raw = basicErr instanceof Error ? basicErr.message : "기본 정보 조회 실패";
        console.error("[application-detail] all/basic failed:", raw, basicErr);
        return NextResponse.json(
          attachDebugFields(
            {
              ok: true,
              section: "all",
              application: null,
              matched_driver: null,
              sponsor_stage: null,
              member_quotes: quotes.member_quotes,
              guest_quotes: quotes.guest_quotes,
              quote_summary: quotes.quote_summary,
              warnings: [`기본 정보 조회 실패: ${raw}`, ...(quotes.warnings ?? [])],
            },
            auth.debug,
          ),
        );
      }
      return NextResponse.json(
        attachDebugFields(
          {
            ok: true,
            section: "all",
            application: basic.application,
            matched_driver: basic.matched_driver,
            sponsor_stage: basic.sponsor_stage,
            sponsor: basic.sponsor ?? null,
            member_quotes: quotes.member_quotes,
            guest_quotes: quotes.guest_quotes,
            quote_summary: quotes.quote_summary,
            warnings: [...(basic.warnings ?? []), ...(quotes.warnings ?? [])],
          },
          auth.debug,
        ),
      );
    }

    if (section === "sponsor") {
      const sponsor = await fetchAdminDetailSponsor(admin, applicationId);
      return NextResponse.json(
        attachDebugFields({ ok: true, section: "sponsor", sponsor }, auth.debug),
      );
    }

    if (section === "sms") {
      const sms_logs = await fetchAdminDetailSms(admin, applicationId);
      return NextResponse.json(
        attachDebugFields({ ok: true, section: "sms", sms_logs }, auth.debug),
      );
    }

    if (!serverDebugEnabled) {
      return NextResponse.json(
        attachDebugFields(
          {
            ok: true,
            section: "debug",
            debug: null,
            warnings: ["서버 DEBUG 모드가 비활성화되어 있습니다."],
            debug_denied: true,
            denied_reason: "server_debug_disabled",
            which_check_failed: "serverDebugEnabled",
          },
          auth.debug,
        ),
      );
    }

    const debug = await fetchAdminDetailDebug(admin, applicationId, undefined);
    return NextResponse.json(
      attachDebugFields({ ok: true, section: "debug", debug }, auth.debug),
    );
  } catch (e) {
    const raw = e instanceof Error ? e.message : "상세 조회에 실패했습니다.";
    console.error("[application-detail] GET failed:", raw, e);
    return NextResponse.json(
      attachDebugFields(
        {
          ok: false,
          error: sanitizeOperationalError(raw, QUOTES_USER_MESSAGE),
          ...(isDebugResponse() ? { error_detail: raw } : {}),
        },
        auth.debug,
      ),
      { status: 502 },
    );
  }
}
