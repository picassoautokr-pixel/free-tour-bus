import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import {
  handleClientQuotesPost,
  loadPayload,
  resolveApplication,
  resolveApplicationsByLookupPassword,
  safeText,
} from "@/lib/client-quotes-handlers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const { searchParams } = new URL(request.url);
  if (safeText(searchParams.get("lookup_password")) !== "") {
    const resolvedList = await resolveApplicationsByLookupPassword(admin, request);
    if ("error" in resolvedList) {
      return NextResponse.json({ error: resolvedList.error }, { status: resolvedList.status });
    }
    const payloads = (
      await Promise.all(
        resolvedList.rows.map(async (row) => {
          try {
            return await loadPayload(admin, row);
          } catch (e) {
            if (e instanceof Error && e.message === "HIDDEN_APPLICATION") return null;
            throw e;
          }
        }),
      )
    ).filter((p): p is NonNullable<typeof p> => p != null);
    return NextResponse.json({
      ok: true,
      applications: payloads.map((payload) => ({
        ...payload.application,
        quotes: payload.quotes,
      })),
    });
  }
  const resolved = await resolveApplication(admin, request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json({ ok: true, ...(await loadPayload(admin, resolved.app)) });
}

export async function POST(request: Request) {
  const admin = createServiceRoleSupabase();
  let body: {
    receipt_number?: unknown;
    phone?: unknown;
    application_id?: unknown;
    action?: unknown;
    quote_id?: unknown;
    quote_source?: unknown;
    price_selection_kind?: unknown;
    selected_price_type?: unknown;
    selected_price_label?: unknown;
    selected_price?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  url.searchParams.set("receipt_number", safeText(body.receipt_number));
  url.searchParams.set("phone", safeText(body.phone));
  const resolved = await resolveApplication(admin, new Request(url));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const result = await handleClientQuotesPost(admin, resolved.app, body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, ...result.payload });
}
