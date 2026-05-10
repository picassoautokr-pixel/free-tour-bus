import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendDriverApprovalSms } from "@/lib/driver-approval-sms";
import { getPartnerLoginRedirectTo } from "@/lib/partner-login-redirect";
import { normalizePartnerDrivers } from "@/lib/partner-drivers-admin";
import { createServiceRoleSupabase } from "@/lib/supabase/service-role";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { USER_ROLES } from "@/lib/roles";

export const runtime = "nodejs";

type Body = {
  partner_driver_id?: unknown;
  status?: unknown;
  /** 승인 처리 시 함께 저장할 관리자 메모(선택) */
  admin_memo?: unknown;
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
 * 승인(approved) 전용 — status·auth_user_id·approved_at 을 반드시 함께 저장합니다.
 * 컬럼 누락 시 조용히 생략하지 않고 실패로 처리합니다.
 */
async function updatePartnerDriverApprovedStrict(
  admin: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error, data } = await admin
    .from("partner_drivers")
    .update(fields)
    .eq("id", id)
    .select("id,status,approved_at,auth_user_id,admin_memo");

  const rows = Array.isArray(data) ? data : data != null ? [data] : [];

  if (error) {
    console.error(
      "[partner-drivers/status] APPROVED partner_drivers update failed:",
      error.message,
      "code:",
      error.code,
      "details:",
      error.details,
      "hint:",
      error.hint,
      "payload:",
      JSON.stringify(fields),
    );
    const hint =
      /approved_at|auth_user_id|column/i.test(error.message) &&
      !/violates|foreign key/i.test(error.message)
        ? " DB에 approved_at, auth_user_id 컬럼이 있는지 확인하고 sql/partner_drivers_step3.sql 을 적용했는지 확인해 주세요."
        : "";
    return { error: `${error.message}${hint}` };
  }

  if (rows.length === 0) {
    console.error(
      "[partner-drivers/status] update succeeded but select returned no rows for id",
      id,
    );
    return {
      error:
        "partner_drivers 갱신 후 확인(select)에 실패했습니다. RLS 또는 id 일치 여부를 확인해 주세요.",
    };
  }

  const row = rows[0];
  console.log(
    "[partner-drivers/status] approved row persisted:",
    JSON.stringify(row),
  );

  const r = row as Record<string, unknown> | undefined;
  if (
    r &&
    (String(r.auth_user_id ?? "").trim() === "" ||
      r.approved_at == null ||
      String(r.approved_at ?? "").trim() === "")
  ) {
    const msg =
      "갱신 응답에 approved_at 또는 auth_user_id 가 비어 있습니다. DB 컬럼·RLS·트리거를 확인해 주세요.";
    console.error("[partner-drivers/status]", msg, row);
    return { error: msg };
  }

  return { error: null };
}

/** 승인이 아닌 상태 변경용 — status( 및 선택 필드)만 갱신 */
async function updatePartnerDriverRow(
  admin: SupabaseClient,
  id: string,
  fields: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { error } = await admin.from("partner_drivers").update(fields).eq("id", id);
  if (error) {
    console.error(
      "[partner-drivers/status] status-only update failed:",
      error.message,
      error.code,
      JSON.stringify(fields),
    );
    return { error: error.message };
  }
  return { error: null };
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

type AuthResolveResult = {
  userId: string;
  error: string | null;
  /** inviteUserByEmail 로 신규 초대가 성공해(대개) 초대 메일이 발송된 경우만 true */
  inviteEmailSent: boolean;
  /** 이미 Auth 에 동일 이메일 계정이 있어 연결만 한 경우 */
  linkedExistingUser: boolean;
};

async function resolveOrCreateAuthUserId(
  admin: SupabaseClient,
  row: {
    id: string;
    email: string;
    auth_user_id?: string | null;
  },
  fallbackOrigin: string,
): Promise<AuthResolveResult> {
  const email = String(row.email).trim();
  const emailLower = email.toLowerCase();

  let redirectTo = getPartnerLoginRedirectTo();
  if (!redirectTo) {
    redirectTo = `${fallbackOrigin.replace(/\/$/, "")}/partner/login`;
  }
  console.log(
    "[partner-drivers/status] inviteUserByEmail redirectTo:",
    redirectTo,
  );

  const existingId = row.auth_user_id
    ? String(row.auth_user_id).trim()
    : "";
  if (existingId) {
    const { data, error } = await admin.auth.admin.getUserById(existingId);
    if (!error && data.user?.id) {
      return {
        userId: data.user.id,
        error: null,
        inviteEmailSent: false,
        linkedExistingUser: true,
      };
    }
  }

  const existingByEmail = await findAuthUserIdByEmail(admin, emailLower);
  if (existingByEmail) {
    console.warn(
      "[partner-drivers/status] 기존 Auth 사용자 이메일 매칭:",
      emailLower,
    );
    return {
      userId: existingByEmail,
      error: null,
      inviteEmailSent: false,
      linkedExistingUser: true,
    };
  }

  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (!invited.error && invited.data.user?.id) {
    return {
      userId: invited.data.user.id,
      error: null,
      inviteEmailSent: true,
      linkedExistingUser: false,
    };
  }

  if (invited.error) {
    console.error(
      "[partner-drivers/status] inviteUserByEmail failed:",
      invited.error.message,
      "email:",
      email,
    );
  } else if (!invited.data.user?.id) {
    console.error(
      "[partner-drivers/status] inviteUserByEmail returned no user id:",
      JSON.stringify(invited.data),
    );
  }

  const inviteMsg = invited.error?.message?.toLowerCase() ?? "";
  const maybeExists =
    inviteMsg.includes("already") ||
    inviteMsg.includes("registered") ||
    inviteMsg.includes("exists");

  if (maybeExists) {
    const byList = await findAuthUserIdByEmail(admin, emailLower);
    if (byList) {
      console.warn(
        "[partner-drivers/status] 초대 실패(중복) 후 기존 사용자 연결:",
        emailLower,
      );
      return {
        userId: byList,
        error: null,
        inviteEmailSent: false,
        linkedExistingUser: true,
      };
    }
    console.error(
      "[partner-drivers/status] duplicate 이메일인데 listUsers 에서 찾지 못함:",
      emailLower,
    );
  }

  const created = await admin.auth.admin.createUser({
    email,
    password: tempPassword(),
    email_confirm: true,
  });
  if (!created.error && created.data.user?.id) {
    console.warn(
      "[partner-drivers/status] invite 불가 후 createUser 로 계정 생성(초대 메일 없음):",
      emailLower,
    );
    return {
      userId: created.data.user.id,
      error: null,
      inviteEmailSent: false,
      linkedExistingUser: false,
    };
  }

  if (created.error) {
    console.error(
      "[partner-drivers/status] createUser failed:",
      created.error.message,
    );
  }

  const createMsg = created.error?.message ?? "";
  const byList2 = await findAuthUserIdByEmail(admin, emailLower);
  if (byList2) {
    return {
      userId: byList2,
      error: null,
      inviteEmailSent: false,
      linkedExistingUser: true,
    };
  }

  const combined =
    createMsg ||
    invited.error?.message ||
    "Supabase Auth 에서 사용자를 생성·연결하지 못했습니다.";
  console.error("[partner-drivers/status] resolveOrCreateAuthUserId exhausted:", combined);

  return {
    userId: "",
    error: combined,
    inviteEmailSent: false,
    linkedExistingUser: false,
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
    console.error(
      "[partner-drivers/status] SUPABASE_SERVICE_ROLE_KEY 가 비어 있어 승인·Auth 연결을 수행할 수 없습니다.",
    );
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

  const currentStatusRaw = String(row.status ?? "").trim().toLowerCase();
  const alreadyApproved =
    currentStatusRaw === "approved" || currentStatusRaw === "approve";

  if (status === "approved" && alreadyApproved) {
    const memoFields: Record<string, unknown> = {};
    if ("admin_memo" in body && typeof body.admin_memo === "string") {
      memoFields.admin_memo = body.admin_memo.trim();
    }
    if (Object.keys(memoFields).length > 0) {
      const upMemo = await updatePartnerDriverRow(
        admin,
        partnerDriverId.trim(),
        memoFields,
      );
      if (upMemo.error) {
        return NextResponse.json({ error: upMemo.error }, { status: 502 });
      }
    }
    const { data: refreshedMemo } = await admin
      .from("partner_drivers")
      .select("*")
      .eq("id", partnerDriverId.trim())
      .maybeSingle();
    const normalizedMemo = normalizePartnerDrivers(
      refreshedMemo ? [refreshedMemo] : [],
    );
    return NextResponse.json({
      ok: true,
      partner_driver: normalizedMemo[0] ?? null,
      invite_email_sent: false,
      linked_existing_auth_user: true,
      note: "이미 승인된 건입니다. 관리자 메모만 갱신했습니다.",
    });
  }

  if (status === "approved") {
    const r = row as {
      id: string;
      email: string;
      company_name: string;
      phone: string;
      auth_user_id?: string | null;
    };

    const authResult = await resolveOrCreateAuthUserId(
      admin,
      {
        id: String(r.id),
        email: String(r.email ?? ""),
        auth_user_id:
          "auth_user_id" in row && row.auth_user_id != null
            ? String(row.auth_user_id)
            : null,
      },
      siteUrl || "http://localhost:3000",
    );

    if (authResult.error || !authResult.userId) {
      console.error(
        "[partner-drivers/status] 승인 중단: Auth 사용자 확보 실패 —",
        authResult.error,
      );
      return NextResponse.json(
        {
          error:
            authResult.error ??
            "Supabase Auth 사용자를 생성하거나 기존 계정과 연결하지 못했습니다.",
          auth_error: authResult.error ?? true,
        },
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
      console.error(
        "[partner-drivers/status] 승인 중단: profiles upsert 실패 —",
        profErr.error,
      );
      return NextResponse.json(
        {
          error: `profiles 저장 실패: ${profErr.error}`,
          auth_user_id: authResult.userId,
        },
        { status: 502 },
      );
    }

    const approvedAt = new Date().toISOString();
    const coreUpdate: Record<string, unknown> = {
      status: "approved",
      auth_user_id: authResult.userId,
      approved_at: approvedAt,
    };
    if (typeof body.admin_memo === "string") {
      coreUpdate.admin_memo = body.admin_memo.trim();
    }

    const up = await updatePartnerDriverApprovedStrict(
      admin,
      partnerDriverId.trim(),
      coreUpdate,
    );
    if (up.error) {
      console.error(
        "[partner-drivers/status] 승인 중단: partner_drivers 갱신 실패 —",
        up.error,
      );
      return NextResponse.json(
        {
          error: up.error,
          auth_user_id: authResult.userId,
        },
        { status: 502 },
      );
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
      invite_email_sent: authResult.inviteEmailSent,
      linked_existing_auth_user: authResult.linkedExistingUser,
    });
  }

  const updateFields: Record<string, unknown> = { status };
  if (typeof body.admin_memo === "string") {
    updateFields.admin_memo = body.admin_memo.trim();
  }
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
