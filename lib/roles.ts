/**
 * 서비스 역할 — profiles.role 및 향후 권한 검사용.
 * (client: 일반 고객, driver: 제휴 기사, sponsor: 후원업체, admin: 관리자)
 */
export const USER_ROLES = {
  CLIENT: "client",
  DRIVER: "driver",
  SPONSOR: "sponsor",
  ADMIN: "admin",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

const ROLE_SET = new Set<string>(Object.values(USER_ROLES));

export function parseUserRole(raw: string | null | undefined): UserRole | null {
  const n = String(raw ?? "").trim().toLowerCase();
  if (ROLE_SET.has(n)) return n as UserRole;
  return null;
}

export function isAdminRole(role: string | null | undefined): boolean {
  return parseUserRole(role) === USER_ROLES.ADMIN;
}

export function isDriverRole(role: string | null | undefined): boolean {
  return parseUserRole(role) === USER_ROLES.DRIVER;
}

export function isClientRole(role: string | null | undefined): boolean {
  return parseUserRole(role) === USER_ROLES.CLIENT;
}

export function isSponsorRole(role: string | null | undefined): boolean {
  return parseUserRole(role) === USER_ROLES.SPONSOR;
}
