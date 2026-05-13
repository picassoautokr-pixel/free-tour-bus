import { NextResponse } from "next/server";

import {
  logContractNotification,
  maybeStartDepositWaiting,
  safeText,
} from "@/lib/contract-deposit";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function digits(value: unknown): string {
  return safeText(value).replace(/\D/g, "");
}

export async function POST(request: Request) {
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { receipt_number?: unknown; phone?: unknown }
    | null;
  const receiptNumber = safeText(body?.receipt_number);
  const phoneDigits = digits(body?.phone);
  if (receiptNumber === "" || phoneDigits === "") {
    return NextResponse.json(
      { error: "접수번호와 휴대폰번호가 필요합니다." },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("applications")
    .select("*")
    .eq("receipt_number", receiptNumber)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const app = data as Record<string, unknown> | null;
  if (!app || digits(app.phone) !== phoneDigits) {
    return NextResponse.json({ error: "견적요청을 찾을 수 없습니다." }, { status: 404 });
  }

  const status = safeText(app.quote_status);
  if (
    safeText(app.final_selected_quote_id) === "" ||
    safeText(app.contact_revealed_at) === "" ||
    !["final_selected", "contract_pending", "completed"].includes(status)
  ) {
    return NextResponse.json({ error: "최종확정 후 계약 확인이 가능합니다." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const patchedApp = { ...app, client_contract_confirmed_at: now };
  const depositPatch = await maybeStartDepositWaiting(admin, patchedApp);
  const nextStatus =
    depositPatch.contract_status ??
    (safeText(app.driver_contract_confirmed_at) !== ""
      ? "fully_confirmed"
      : "client_confirmed");

  const { error: updateError } = await admin
    .from("applications")
    .update({
      client_contract_confirmed_at: now,
      contract_started_at: safeText(app.contract_started_at) || now,
      contract_status: nextStatus,
      ...depositPatch,
    })
    .eq("id", safeText(app.id));
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 502 });
  }

  await logContractNotification(admin, {
    applicationId: safeText(app.id),
    notificationType: depositPatch.contract_status ? "deposit_waiting" : "contract_client_confirmed",
    message: depositPatch.contract_status
      ? "양측 계약 확인 완료, 예약금 입금 대기 상태로 전환되었습니다."
      : "클라이언트가 계약 내용을 확인했습니다.",
    targetType: "customer",
    targetPhone: safeText(app.phone),
    targetName: safeText(app.applicant_name),
  });

  return NextResponse.json({ ok: true });
}
