/**
 * 어드민 API Route Handler 인증 — admin 대시보드와 동일한 레거시 허용 (UTF-8)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchProfileForAuthUser,
  normalizeProfileRole,
  resolveAdminRoleAccess,
  type Profile,
} from "@/lib/profile";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export type AdminApiAuthDebug = {
  auth_user_id: string | null;
  email: string | null;
  is_admin: boolean;
  role: string | null;
  is_verified_admin: boolean;
  allow_legacy_admin_access: boolean;
  denied_reason: string | null;
  which_check_failed: string | null;
};

export type AdminApiAuthSuccess = {
  ok: true;
  sessionClient: SupabaseClient;
  userId: string;
  email: string | null;
  profile: Profile | null;
  isVerifiedAdmin: boolean;
  allowLegacyAdminAccess: boolean;
  debug: AdminApiAuthDebug;
};

export type AdminApiAuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
  debug: AdminApiAuthDebug;
};

export type AdminApiAuthResult = AdminApiAuthSuccess | AdminApiAuthFailure;

function buildDebug(
  partial: Partial<AdminApiAuthDebug> & Pick<AdminApiAuthDebug, "auth_user_id">,
): AdminApiAuthDebug {
  return {
    auth_user_id: partial.auth_user_id,
    email: partial.email ?? null,
    is_admin: partial.is_admin ?? false,
    role: partial.role ?? null,
    is_verified_admin: partial.is_verified_admin ?? false,
    allow_legacy_admin_access: partial.allow_legacy_admin_access ?? true,
    denied_reason: partial.denied_reason ?? null,
    which_check_failed: partial.which_check_failed ?? null,
  };
}

/**
 * 어드민 신청 목록·상세 API용 — 세션 필수, 프로필 role 불일치만으로는 차단하지 않음.
 */
export async function assertAdminApiAccess(options?: {
  /** true면 profiles.role 이 admin 이 아니면 403 (deposit-confirm 등 엄격 API) */
  strictProfileAdmin?: boolean;
}): Promise<AdminApiAuthResult> {
  const strict = options?.strictProfileAdmin === true;

  const sessionClient = await createSupabaseRouteHandlerClient("admin");
  if (!sessionClient) {
    return {
      ok: false,
      status: 401,
      error: "서버 설정 오류(Supabase)입니다.",
      debug: buildDebug({
        auth_user_id: null,
        denied_reason: "supabase_env_missing",
        which_check_failed: "createSupabaseRouteHandlerClient",
      }),
    };
  }

  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser();

  if (userError) {
    console.error("[admin-api-auth] getUser:", userError.message);
  }

  if (!user?.id) {
    return {
      ok: false,
      status: 401,
      error: "로그인이 필요합니다.",
      debug: buildDebug({
        auth_user_id: null,
        denied_reason: "no_session",
        which_check_failed: "auth.getUser",
      }),
    };
  }

  const profile = await fetchProfileForAuthUser(sessionClient, user.id);
  const access = resolveAdminRoleAccess(profile);
  const role = normalizeProfileRole(profile);
  const isAdminRole = access.isVerifiedAdmin;

  const debug = buildDebug({
    auth_user_id: user.id,
    email: user.email ?? null,
    is_admin: isAdminRole,
    role: role ?? profile?.role ?? null,
    is_verified_admin: access.isVerifiedAdmin,
    allow_legacy_admin_access: access.allowLegacyAdminAccess,
    denied_reason: null,
    which_check_failed: null,
  });

  if (strict && profile && !isAdminRole) {
    return {
      ok: false,
      status: 403,
      error: "관리자만 접근할 수 있습니다.",
      debug: {
        ...debug,
        denied_reason: "profile_role_not_admin",
        which_check_failed: "strictProfileAdmin",
      },
    };
  }

  return {
    ok: true,
    sessionClient,
    userId: user.id,
    email: user.email ?? null,
    profile,
    isVerifiedAdmin: access.isVerifiedAdmin,
    allowLegacyAdminAccess: access.allowLegacyAdminAccess,
    debug,
  };
}
