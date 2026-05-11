import { NextResponse } from "next/server";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function safeText(value: unknown, emptyLabel = ""): string {
  if (value == null) return emptyLabel;
  const s = String(value).trim();
  return s === "" ? emptyLabel : s;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function GET(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient();
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

  const { data: quotesRaw, error: quotesError } = await admin
    .from("driver_quotes")
    .select(
      "id, created_at, application_id, partner_driver_id, auth_user_id, price, vehicle_type, available_time, message, status",
    )
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });

  if (quotesError) {
    return NextResponse.json({ error: quotesError.message }, { status: 502 });
  }

  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [];
  const partnerIds = Array.from(
    new Set(
      quotes
        .map((q) => safeText((q as { partner_driver_id?: unknown }).partner_driver_id))
        .filter(Boolean),
    ),
  );

  const partnerById = new Map<
    string,
    { company_name: string; manager_name: string; phone: string }
  >();
  if (partnerIds.length > 0) {
    const { data: partnersRaw, error: partnersError } = await admin
      .from("partner_drivers")
      .select("id, company_name, manager_name, phone")
      .in("id", partnerIds);

    if (partnersError) {
      return NextResponse.json(
        { error: partnersError.message },
        { status: 502 },
      );
    }

    for (const raw of Array.isArray(partnersRaw) ? partnersRaw : []) {
      const row = raw as Record<string, unknown>;
      const id = safeText(row.id);
      if (id === "") continue;
      partnerById.set(id, {
        company_name: safeText(row.company_name, "—"),
        manager_name: safeText(row.manager_name, "—"),
        phone: safeText(row.phone, "—"),
      });
    }
  }

  const normalized = quotes.map((raw) => {
    const row = raw as Record<string, unknown>;
    const partnerDriverId = safeText(row.partner_driver_id);
    const partner = partnerById.get(partnerDriverId);
    return {
      id: safeText(row.id),
      created_at: safeText(row.created_at),
      application_id: safeText(row.application_id),
      partner_driver_id: partnerDriverId,
      auth_user_id: safeText(row.auth_user_id),
      price: parseInteger(row.price),
      vehicle_type: safeText(row.vehicle_type, "—"),
      available_time: safeText(row.available_time, "—"),
      message: safeText(row.message),
      status: safeText(row.status, "submitted"),
      company_name: partner?.company_name ?? "—",
      manager_name: partner?.manager_name ?? "—",
      phone: partner?.phone ?? "—",
    };
  });

  return NextResponse.json({ ok: true, quotes: normalized });
}
