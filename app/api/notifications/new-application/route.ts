import { NextResponse } from "next/server";

import { logNotification, siteBaseUrl } from "@/lib/notification-service";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

type Body = {
  receipt_number?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const receiptNumber = safeText(body.receipt_number);
  if (receiptNumber === "") {
    return NextResponse.json({ error: "receipt_number가 필요합니다." }, { status: 400 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { data: app, error } = await admin
    .from("applications")
    .select(
      "id, departure, destination, departure_date, departure_time, passenger_count",
    )
    .eq("receipt_number", receiptNumber)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  const row = app as Record<string, unknown> | null;
  if (!row) {
    return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  }

  const dateTime = [safeText(row.departure_date, "미정"), safeText(row.departure_time)]
    .filter(Boolean)
    .join(" ");
  await logNotification(
    admin,
    {
      target_type: "admin",
      target_phone: "admin",
      target_name: "관리자",
      notification_type: "new_application",
      application_id: safeText(row.id),
      message: `[무료관광버스]
새 전세버스 견적요청이 등록되었습니다.

출발: ${safeText(row.departure, "미정")}
도착: ${safeText(row.destination, "미정")}
일시: ${dateTime || "미정"}
인원: ${safeText(row.passenger_count, "미정")}

콜 확인:
${siteBaseUrl()}/partner/dashboard`,
    },
    {
      status: "skipped",
      error: "MVP: regional driver SMS dispatch is disabled.",
    },
  );

  return NextResponse.json({ ok: true });
}

