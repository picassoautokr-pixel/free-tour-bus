export type RoleSubdomain = "admin" | "partner" | "sponsor";

const ROLE_HOST_PREFIXES: Record<RoleSubdomain, string> = {
  admin: "admin.",
  partner: "partner.",
  sponsor: "sponsor.",
};

const DEFAULT_ROLE_URLS: Record<RoleSubdomain, string> = {
  admin: "https://admin.free-bus.co.kr",
  partner: "https://partner.free-bus.co.kr",
  sponsor: "https://sponsor.free-bus.co.kr",
};

export function normalizedHost(host: string | null | undefined): string {
  return (host ?? "").split(":")[0]?.toLowerCase().trim() ?? "";
}

export function roleFromHost(host: string | null | undefined): RoleSubdomain | null {
  const cleanHost = normalizedHost(host);
  if (!cleanHost) return null;
  if (cleanHost.startsWith(ROLE_HOST_PREFIXES.partner)) return "partner";
  if (cleanHost.startsWith(ROLE_HOST_PREFIXES.sponsor)) return "sponsor";
  if (cleanHost.startsWith(ROLE_HOST_PREFIXES.admin)) return "admin";
  return null;
}

export function isRoleHost(role: RoleSubdomain): boolean {
  if (typeof window === "undefined") return false;
  return roleFromHost(window.location.host) === role;
}

export function roleDashboardPath(role: RoleSubdomain): string {
  if (isRoleHost(role)) return role === "admin" ? "/" : "/dashboard";
  if (role === "admin") return "/admin";
  return `/${role}/dashboard`;
}

export function roleLoginPath(role: RoleSubdomain): string {
  if (isRoleHost(role)) return "/login";
  return role === "admin" ? "/admin/login" : `/${role}/login`;
}

export function roleRegisterUrl(role: "partner" | "sponsor"): string {
  const envUrl =
    role === "partner"
      ? process.env.NEXT_PUBLIC_PARTNER_URL
      : process.env.NEXT_PUBLIC_SPONSOR_URL;
  if (envUrl?.trim()) return `${envUrl.replace(/\/+$/, "")}/register`;
  return `/${role}/register`;
}

export function defaultRoleBaseUrl(role: RoleSubdomain): string {
  return DEFAULT_ROLE_URLS[role];
}
