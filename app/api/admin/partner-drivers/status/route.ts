import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendDriverApprovalSms } from "@/lib/driver-approval-sms";
import { normalizePartnerDrivers } from "@/lib/partner-drivers-admin";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { USER_ROLES } from "@/lib/roles";

export const runtime = "nodejs";

type Body = {
  partner_driver_id?: unknown;
  status?: unknown;
};

const ALLOWED = new Set(["pending", "reviewing", "approved", "rejected"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function tempPassword(): string {
  return `${randomBytes(18).toString("base64url")}Aa!1`;
}

async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  emailLower: string,
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("[partner-drivers/status] listUsers", error.message);
      return null;
    }
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === emailLower,
    );
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * optional 컬럼(approved_at, auth_user_id) 은 없으면 한 단계씩 제거하며 재시도
 */
async function updatePartnerDriverRow(
  admin: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<{ error: string | null }> {
  let payload: Record<string, unknown> = { ...fields };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await admin
      .from("partner_drivers")
      .update(payload)
      .eq("id", id);
    if (!error) return { error: null };
    const msg = error.message.toLowerCase();
    if (
      msg.includes("column") ||
      msg.includes("schema") ||
      msg.includes("auth_user_id") ||
      msg.includes("approved_at")
    ) {
      if ("approved_at" in payload) {
        const { approved_at: _a, ...rest } = payload;
        payload = rest;
        continue;
      }
      if ("auth_user_id" in payload) {
        const { auth_user_id: _u, ...rest } = payload;
        payload = rest;
        continue;
      }
    }
    return { error: error.message };
  }
  return { error: "partner_drivers 업데이트에 실패했습니다." };
}

async function upsertDriverProfile(
  admin: SupabaseClient,
  params: {
    userId: string;
    companyName: string;
    phone: string;
    email: string;
    partnerDriverId: string;
  },
): Promise<{ error: string | null }> {
  const base = {
    user_id: params.userId,
    name: params.companyName,
    phone: params.phone,
    email: params.email,
    role: USER_ROLES.DRIVER,
    partner_driver_id: params.partnerDriverId,
  };

  const { error } = await admin.from("profiles").upsert(base, {
    onConflict: "user_id",
  });
  if (!error) return { error: null };
  const msg = error.message.toLowerCase();
  if (msg.includes("partner_driver_id") || msg.includes("column")) {
    const { partner_driver_id: _p, ...rest } = base;
    const { error: e2 } = await admin.from("profiles").upsert(rest, {
      onConflict: "user_id",
    });
    return e2 ? { error: e2.message } : { error: null };
  }
  return { error: error.message };
}

async function resolveOrCreateAuthUserId(
  admin: SupabaseClient,
  row: {
    id: string;
    email: string;
    auth_user_id?: string | null;
  },
  siteUrl: string,
): Promise<{ userId: string; error: string | null; usedInvite: boolean }> {
  const email = String(row.email).trim();
  const emailLower = email.toLowerCase();
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/partner/login`;

  const existingId = row.auth_user_id
    ? String(row.auth_user_id).trim()
    : "";
  if (existingId) {
    const { data, error } = await admin.auth.admin.getUserById(existingId);
    if (!error && data.user?.id) {
      return { userId: data.user.id, error: null, usedInvite: false };
    }
  }

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (!invited.error && invited.data.user?.id) {
    return {
      userId: invited.data.user.id,
      error: null,
      usedInvite: true,
    };
  }

  const inviteMsg = invited.error?.message?.toLowerCase() ?? "";
  const maybeExists =
    inviteMsg.includes("already") ||
    inviteMsg.includes("registered") ||
    inviteMsg.includes("exists");

  if (maybeExists) {
    const byList = await findAuthUserIdByEmail(admin, emailLower);
    if (byList) {
      return { userId: byList, error: null, usedInvite: false };
    }
  }

  const created = await admin.auth.admin.createUser({
    email,
    password: tempPassword(),
    email_confirm: true,
  });
  if (!created.error && created.data.user?.id) {
    return { userId: created.data.user.id, error: null, usedInvite: false };
  }

  const createMsg = created.error?.message ?? "";
  const byList2 = await findAuthUserIdByEmail(admin, emailLower);
  if (byList2) {
    return { userId: byList2, error: null, usedInvite: false };
  }

  return {
    userId: "",
    error: createMsg || invited.error?.message || "Auth 사용자를 만들 수 없습니다.",
    usedInvite: false,
  };
}

export async function POST(request: Request) {
  const sessionClient = await createSupabaseRouteHandlerClient();
  if (!sessionClient) {
    return NextResponse.json(
      { error: "서버 설정 오류(Supabase)입니다." },
      { status: 500 },
    );
  }

  const {
    data: { user: sessionUser },
  } = await sessionClient.auth.getUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createServiceRoleSupabase();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. 승인 처리를 위해 서버 환경변수를 추가해 주세요.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, {
      status: 400,
    });
  }

  const partnerDriverId = body.partner_driver_id;
  const statusRaw = body.status;
  if (!isNonEmptyString(partnerDriverId) || !isNonEmptyString(statusRaw)) {
    return NextResponse.json(
      { error: "partner_driver_id 와 status 가 필요합니다." },
      { status: 400 },
    );
  }

  const status = statusRaw.trim().toLowerCase();
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "허용되지 않는 status 입니다." }, {
      status: 400,
    });
  }

  const { data: rowRaw, error: fetchErr } = await admin
    .from("partner_drivers")
    .select("*")
    .eq("id", partnerDriverId.trim())
    .maybeSingle();

  if (fetchErr || rowRaw == null) {
    return NextResponse.json(
      { error: fetchErr?.message ?? "신청 내역을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const row = rowRaw as Record<string, unknown>;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(request.url).origin ||
    "";

  if (status === "approved") {
    const r = row as {
      id: string;
      email: string;
      company_name: string;
      phone: string;
      auth_user_id?: string | null;
    };

    const authResult = await resolveOrCreateAuthUserId(admin, {
      id: String(r.id),
      email: String(r.email ?? ""),
      auth_user_id:
        "auth_user_id" in row && row.auth_user_id != null
          ? String(row.auth_user_id)
          : null,
    }, siteUrl || "http://localhost:3000");

    if (authResult.error || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error ?? "Auth 연결 실패" },
        { status: 502 },
      );
    }

    const profErr = await upsertDriverProfile(admin, {
      userId: authResult.userId,
      companyName: String(r.company_name ?? "").trim() || "제휴 기사",
      phone: String(r.phone ?? "").trim(),
      email: String(r.email ?? "").trim(),
      partnerDriverId: String(r.id),
    });
    if (profErr.error) {
      return NextResponse.json({ error: profErr.error }, { status: 502 });
    }

    const approvedAt = new Date().toISOString();
    const updateFields: Record<string, unknown> = {
      status: "approved",
      auth_user_id: authResult.userId,
      approved_at: approvedAt,
    };

    const up = await updatePartnerDriverRow(admin, partnerDriverId.trim(), updateFields);
    if (up.error) {
      return NextResponse.json({ error: up.error }, { status: 502 });
    }

    void sendDriverApprovalSms({
      toPhone: String(r.phone ?? "").replace(/\D/g, ""),
      companyName: String(r.company_name ?? ""),
      infoLine: "로그인 안내 메일을 확인해 주세요.",
    }).catch(() => {});

    const { data: refreshed } = await admin
      .from("partner_drivers")
      .select("*")
      .eq("id", partnerDriverId.trim())
      .maybeSingle();

    const normalized = normalizePartnerDrivers(refreshed ? [refreshed] : []);
    return NextResponse.json({
      ok: true,
      partner_driver: normalized[0] ?? null,
      auth_user_id: authResult.userId,
      invited: authResult.usedInvite,
    });
  }

  const updateFields: Record<string, unknown> = { status };
  const up = await updatePartnerDriverRow(admin, partnerDriverId.trim(), updateFields);
  if (up.error) {
    return NextResponse.json({ error: up.error }, { status: 502 });
  }

  const { data: refreshed } = await admin
    .from("partner_drivers")
    .select("*")
    .eq("id", partnerDriverId.trim())
    .maybeSingle();

  const normalized = normalizePartnerDrivers(refreshed ? [refreshed] : []);
  return NextResponse.json({
    ok: true,
    partner_driver: normalized[0] ?? null,
  });
}
