/**
 * Supabase `profiles` 행 — Auth 사용자와 서비스 역할 연결.
 * (테이블은 대시보드에서 생성했다고 가정, RLS로 본인 행 조회 허용 필요)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { USER_ROLES, type UserRole, parseUserRole } from "@/lib/roles";

export type Profile = {
  id: string;
  user_id: string;
  created_at: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** DB text — 파싱은 parseUserRole */
  role: string;
  partner_driver_id: string | null;
};

export type AdminRoleResolution = {
  profile: Profile | null;
  /** profiles 에 행이 있고 role 이 명확히 admin */
  isVerifiedAdmin: boolean;
  /**
   * 프로필 없음 / 조회 실패 / role 불일치 시 기존처럼 접근 허용(차단하지 않음).
   * 이후 단계에서 엄격 모드 전환 시 사용.
   */
  allowLegacyAdminAccess: boolean;
};

/**
 * 로그인한 Auth 사용자 UUID로 프로필 1건 조회 (없으면 null).
 * 테이블·RLS 오류 시에도 예외 대신 null 반환(호출부에서 레거시 처리).
 */
export async function fetchProfileForAuthUser(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, user_id, created_at, name, phone, email, role, partner_driver_id",
      )
      .eq("user_id", authUserId)
      .maybeSingle();

    if (error) {
      console.warn("[profiles] fetch failed:", error.message);
      return null;
    }
    if (data == null) return null;
    return data as Profile;
  } catch (e) {
    console.warn("[profiles] fetch exception:", e);
    return null;
  }
}

/**
 * 관리자 화면 접근용 역할 해석.
 * - 검증된 admin 이면 isVerifiedAdmin === true
 * - 그 외(미생성·오류·다른 role)는 allowLegacyAdminAccess === true 로 기존 로그인 유지
 */
export function resolveAdminRoleAccess(
  profile: Profile | null,
): AdminRoleResolution {
  if (!profile) {
    return {
      profile: null,
      isVerifiedAdmin: false,
      allowLegacyAdminAccess: true,
    };
  }

  const parsed = parseUserRole(profile.role);
  if (parsed === USER_ROLES.ADMIN) {
    return {
      profile,
      isVerifiedAdmin: true,
      allowLegacyAdminAccess: false,
    };
  }

  return {
    profile,
    isVerifiedAdmin: false,
    allowLegacyAdminAccess: true,
  };
}

/** 표시·로깅용으로 역할 정규화 */
export function normalizeProfileRole(profile: Profile | null): UserRole | null {
  if (!profile) return null;
  return parseUserRole(profile.role);
}
