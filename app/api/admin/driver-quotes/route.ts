import { NextResponse } from "next/server";

import { assertAdminApiAccess } from "@/lib/admin-api-auth";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import {
  safeText,
  handleAdminDriverQuotesGet,
  handleAdminQuoteEdit,
  handleAdminHideApplication,
  handleAdminApplicationAction,
  handleAdminGuestQuoteMatchResult,
} from "@/lib/admin-driver-quotes-handlers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await assertAdminApiAccess({ strictProfileAdmin: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const applicationId = safeText(searchParams.get("application_id"));
  if (applicationId === "") {
    return NextResponse.json(
      { error: "application_id가 필요합니다." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  return handleAdminDriverQuotesGet(admin, applicationId);
}

export async function PATCH(request: Request) {
  const auth = await assertAdminApiAccess({ strictProfileAdmin: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const adminEmail = auth.email;

  let body: {
    guest_quote_id?: unknown;
    match_result?: unknown;
    application_id?: unknown;
    action?: unknown;
    quote_id?: unknown;
    quote_kind?: unknown;
    quote_patch?: unknown;
    hide_application?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
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

  // 견적 직접 수정
  const quoteId = safeText(body.quote_id);
  const quoteKind = safeText(body.quote_kind);
  const quotePatch =
    body.quote_patch && typeof body.quote_patch === "object"
      ? (body.quote_patch as Record<string, unknown>)
      : null;
  if (quoteId && quotePatch) {
    return handleAdminQuoteEdit(admin, adminEmail, quoteId, quoteKind, quotePatch);
  }

  // 신청 숨김
  if (body.hide_application === true) {
    const hideApplicationId = safeText(body.application_id);
    if (hideApplicationId === "") {
      return NextResponse.json({ error: "application_id가 필요합니다." }, { status: 400 });
    }
    return handleAdminHideApplication(admin, adminEmail, hideApplicationId);
  }

  // 관리자 액션 (final_confirm / reopen / manual_close)
  const action = safeText(body.action);
  const actionApplicationId = safeText(body.application_id);
  if (action !== "") {
    if (
      actionApplicationId === "" ||
      !["final_confirm", "reopen", "manual_close"].includes(action)
    ) {
      return NextResponse.json(
        { error: "관리자 액션 값이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    return handleAdminApplicationAction(admin, action, actionApplicationId);
  }

  // 비회원 견적 match_result 변경
  const guestQuoteId = safeText(body.guest_quote_id);
  const matchResult = safeText(body.match_result);
  if (guestQuoteId === "" || !["pending", "selected", "not_selected"].includes(matchResult)) {
    return NextResponse.json({ error: "상태 값이 올바르지 않습니다." }, { status: 400 });
  }
  return handleAdminGuestQuoteMatchResult(admin, guestQuoteId, matchResult);
}
